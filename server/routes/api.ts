import { Router } from "express";
import { getMesa, reinitializeMesa, type BackendChoice } from "../services/mesa.js";
import { hasKey, setKey, deleteKey, getKey } from "../services/config.js";
import { hasAnthropicKey, reinitializeAnthropic, clearAnthropic } from "../services/claude.js";
import { emitActivity } from "./events.js";
import { getQuotes } from "../services/market.js";
import { runAgent } from "../agents/base.js";
import { fundamentalsAgent } from "../agents/fundamentals.js";
import { sentimentAgent } from "../agents/sentiment.js";
import { technicalAgent } from "../agents/technical.js";
import { saveRoundSnapshot, listHistoryRounds, loadRoundSnapshot } from "../services/memory.js";
import { readPlaybook, appendEntry, diffAppended, writePlaybook } from "../services/playbook.js";
import type { Portfolio, AnalysisRound, StorageBackend } from "../../shared/types.js";

export const apiRouter = Router();

// Keep the latest round in-memory so /merge can record the outcome on the
// already-persisted history file.
let lastRound: AnalysisRound | null = null;
let lastPriceMap: Map<string, number> | null = null;
let lastPlaybookBefore: string | null = null;

// Helper: snapshot main into `snapshot/{ts}` so we can replay from this point.
async function snapshotMain(timestamp: number): Promise<string> {
  const snapshotBranch = `snapshot/${timestamp}`;
  await getMesa().createBranch(snapshotBranch, "main");
  return snapshotBranch;
}

apiRouter.get("/portfolio", async (_req, res) => {
  try {
    const raw = await getMesa().readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(raw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);
    const quotes = await getQuotes(tickers);

    let marketValue = portfolio.cash;
    const holdings = portfolio.portfolio.map((h) => {
      const quote = quotes.get(h.ticker);
      const currentPrice = quote?.price ?? 0;
      marketValue += h.shares * currentPrice;
      return { ...h, currentPrice, name: quote?.name ?? h.ticker };
    });

    res.json({ ...portfolio, portfolio: holdings, marketValue });
  } catch (error) {
    res.status(500).json({ error: "Failed to load portfolio" });
  }
});

async function runAnalysis(timestamp: number, replayedFrom?: number) {
  const raw = await getMesa().readFile("main", "portfolio.json");
  const portfolio: Portfolio = JSON.parse(raw);
  const tickers = portfolio.portfolio.map((h) => h.ticker);
  const quotes = await getQuotes(tickers);
  const currentPrices = new Map<string, number>();
  for (const [ticker, quote] of quotes) {
    currentPrices.set(ticker, quote.price);
  }

  // Snapshot main BEFORE running so we can replay from this state later.
  await snapshotMain(timestamp);

  // Capture the playbook contents at this snapshot so we can compute per-agent
  // deltas later when merging or dismissing.
  const playbookBefore = await readPlaybook("main");

  const agents = [
    { config: fundamentalsAgent, branch: `agent/fundamentals-${timestamp}` },
    { config: sentimentAgent, branch: `agent/sentiment-${timestamp}` },
    { config: technicalAgent, branch: `agent/technical-${timestamp}` },
  ];

  for (const a of agents) {
    await getMesa().createBranch(a.branch, "main");
    emitActivity("branch_created", `Forked ${a.branch} from main`, { branch: a.branch });
  }

  const results = await Promise.all(
    agents.map(async (a) => {
      emitActivity("analysis_started", `${a.config.name} analyzing portfolio`, { agent: a.config.name, branch: a.branch });
      const result = await runAgent(a.config, a.branch, currentPrices, { timestamp });
      emitActivity("agent_complete", `${a.config.name} finished: ${result.status}`, { agent: a.config.name, branch: a.branch });
      return result;
    })
  );

  const round: AnalysisRound = {
    timestamp,
    branches: agents.map((a) => a.branch),
    results,
    replayedFrom,
  };

  await saveRoundSnapshot(round, currentPrices);

  lastRound = round;
  lastPriceMap = currentPrices;
  lastPlaybookBefore = playbookBefore;

  const changeIds: Record<string, { base: string | null; head: string | null }> = {};
  const baseChangeId = await getMesa().getChangeId("main");
  for (const a of agents) {
    const headChangeId = await getMesa().getChangeId(a.branch);
    changeIds[a.branch] = { base: baseChangeId, head: headChangeId };
  }

  return { timestamp, results, replayedFrom, changeIds };
}

apiRouter.post("/analyze", async (_req, res) => {
  try {
    if (!hasAnthropicKey()) {
      res.status(400).json({ error: "Anthropic API key not configured — add it in Settings" });
      return;
    }
    const result = await runAnalysis(Date.now());
    res.json(result);
  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

apiRouter.get("/diff", async (req, res) => {
  try {
    const { base, head } = req.query as { base?: string; head?: string };
    if (!base || !head) {
      res.status(400).json({ error: "base and head change IDs required" });
      return;
    }
    const diff = await getMesa().getDiff(base, head);
    res.json({ diff });
  } catch (error) {
    res.status(500).json({ error: "Failed to get diff" });
  }
});

apiRouter.post("/replay", async (req, res) => {
  try {
    const { from } = req.body as { from: number };
    if (!from) {
      res.status(400).json({ error: "'from' timestamp required" });
      return;
    }

    const stored = await loadRoundSnapshot(from);
    if (!stored) {
      res.status(404).json({ error: "Round not found" });
      return;
    }

    // Return the stored results as-is — no LLM call, just the historical data.
    const results = stored.results.map((r) => ({
      agentName: r.agentName,
      branch: r.branch,
      status: r.status,
      error: r.error,
      proposal: r.proposal
        ? {
            ...r.proposal,
            proposedPortfolio: { portfolio: [], cash: r.proposal.cashAfter, lastUpdated: "" },
          }
        : undefined,
    }));

    res.json({ timestamp: stored.timestamp, results, replayedFrom: from, mergedAgent: stored.mergedAgent });
  } catch (error) {
    console.error("Replay failed:", error);
    res.status(500).json({ error: "Replay failed" });
  }
});

/**
 * Merge ALL three agents' playbook deltas into main's playbook (so every
 * agent always learns) but only apply the WINNING agent's portfolio changes.
 */
async function mergePlaybooksAndPortfolio(winningBranch: string | null, branches: string[]) {
  if (!lastPlaybookBefore) return;
  const before = lastPlaybookBefore;

  // 1. Apply each agent's playbook delta to main.
  for (const branch of branches) {
    try {
      const after = await readPlaybook(branch);
      const delta = diffAppended(before, after);
      if (delta) {
        await appendEntry("main", delta);
      }
    } catch {
      // branch may be missing entries
    }
  }

  // 2. If a winner was chosen, apply only that branch's portfolio.json.
  if (winningBranch) {
    const portfolioRaw = await getMesa().readFile(winningBranch, "portfolio.json");
    await getMesa().writeFile("main", "portfolio.json", portfolioRaw);
  }
}

apiRouter.post("/merge", async (req, res) => {
  try {
    const { branch, allBranches } = req.body as { branch: string; allBranches: string[] };
    if (!branch || !allBranches) {
      res.status(400).json({ error: "branch and allBranches required" });
      return;
    }

    await mergePlaybooksAndPortfolio(branch, allBranches);
    emitActivity("branch_merged", `Merged ${branch} into main`, { branch });

    if (lastRound && lastRound.branches.includes(branch) && lastPriceMap) {
      const mergedResult = lastRound.results.find((r) => r.branch === branch);
      lastRound.mergedAgent = mergedResult?.agentName;
      await saveRoundSnapshot(lastRound, lastPriceMap);
    }

    for (const b of allBranches) {
      try {
        await getMesa().deleteBranch(b);
        emitActivity("branch_deleted", `Deleted ${b}`, { branch: b });
      } catch {
        // branch may already be deleted
      }
    }

    const raw = await getMesa().readFile("main", "portfolio.json");
    res.json({ portfolio: JSON.parse(raw) });
  } catch (error) {
    console.error("Merge failed:", error);
    res.status(500).json({ error: "Merge failed" });
  }
});

apiRouter.post("/dismiss", async (req, res) => {
  try {
    const { allBranches } = req.body as { allBranches: string[] };

    // Even on dismiss, playbook deltas still merge — every round always teaches.
    await mergePlaybooksAndPortfolio(null, allBranches);

    for (const b of allBranches) {
      try {
        await getMesa().deleteBranch(b);
        emitActivity("branch_deleted", `Deleted ${b}`, { branch: b });
      } catch {
        // already deleted
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Dismiss failed" });
  }
});

apiRouter.get("/history", async (_req, res) => {
  try {
    const portfolioRaw = await getMesa().readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(portfolioRaw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);
    const quotes = await getQuotes(tickers);
    const currentPrices = new Map<string, number>();
    for (const [ticker, quote] of quotes) {
      currentPrices.set(ticker, quote.price);
    }

    const rounds = await listHistoryRounds(currentPrices);
    res.json({ rounds });
  } catch (error) {
    res.status(500).json({ error: "Failed to load history" });
  }
});

apiRouter.get("/playbook", async (_req, res) => {
  try {
    const content = await readPlaybook("main");
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: "Failed to load playbook" });
  }
});

apiRouter.get("/settings", async (_req, res) => {
  const active = getMesa().backendName();
  const hasMesaKey = hasKey("MESA_API_KEY");

  const backends: StorageBackend[] = [
    {
      name: "local-fs",
      label: "Local filesystem",
      description:
        "Branches and history live in a directory on disk. Fully functional. Used as the development fallback.",
      available: true,
      active: active === "local-fs",
    },
    {
      name: "mesa-sdk",
      label: "Mesa SDK · api.mesa.dev",
      description:
        "Real branches on Mesa's versioned filesystem. Sub-50ms reads, instant forks, full audit trail via REST API.",
      available: hasMesaKey,
      active: active === "mesa-sdk",
    },
    {
      name: "mesa-mount",
      label: "Mesa fs.mount · native",
      description:
        "Native NAPI filesystem backed by Mesa cloud. Uses MesaFileSystem — same cloud storage, POSIX-style read/write interface.",
      available: hasMesaKey,
      active: active === "mesa-mount",
    },
  ];

  let mesaInfo: { org?: string; repo?: string; whoami?: string; tags?: Record<string, string> } | undefined;
  if (active === "mesa-sdk" || active === "mesa-mount") {
    try {
      const mesaApiKey = getKey("MESA_API_KEY");
      if (mesaApiKey) {
        const { Mesa } = await import("@mesadev/sdk");
        const client = new Mesa({ apiKey: mesaApiKey });
        const who = await client.whoami();
        const repo = await client.repos.get({ repo: "portfolio-advisor" }).catch(() => null);
        mesaInfo = {
          org: who.org.slug,
          repo: "portfolio-advisor",
          whoami: who.key_name ?? who.key_id ?? "unknown",
          tags: repo?.tags,
        };
      }
    } catch { /* skip */ }
  }

  res.json({
    backends,
    mesaInfo,
    keys: { mesa: hasMesaKey, anthropic: hasKey("ANTHROPIC_API_KEY") },
  });
});

apiRouter.post("/settings/keys", async (req, res) => {
  try {
    const { mesa: mesaKey, anthropic: anthropicKey, backend } = req.body as {
      mesa?: string;
      anthropic?: string;
      backend?: BackendChoice;
    };

    if (anthropicKey) {
      try {
        const testClient = new (await import("@anthropic-ai/sdk")).default({ apiKey: anthropicKey });
        await testClient.messages.countTokens({
          model: "claude-haiku-4-5-20251001",
          messages: [{ role: "user", content: "test" }],
        });
      } catch {
        res.json({ ok: false, error: "Invalid Anthropic API key" });
        return;
      }
      setKey("ANTHROPIC_API_KEY", anthropicKey);
      reinitializeAnthropic(anthropicKey);
    }

    if (mesaKey) {
      try {
        const { Mesa } = await import("@mesadev/sdk");
        const testClient = new Mesa({ apiKey: mesaKey });
        await testClient.whoami();
      } catch {
        res.json({ ok: false, error: "Invalid Mesa API key" });
        return;
      }
      setKey("MESA_API_KEY", mesaKey);
      await reinitializeMesa(mesaKey, backend);
    }

    if (backend && !mesaKey) {
      const existingMesaKey = getKey("MESA_API_KEY");
      if (existingMesaKey) {
        await reinitializeMesa(existingMesaKey, backend);
      }
    }

    const active = getMesa().backendName();
    const hasMesa = hasKey("MESA_API_KEY");
    res.json({
      ok: true,
      keys: { mesa: hasMesa, anthropic: hasKey("ANTHROPIC_API_KEY") },
      backends: [
        {
          name: "local-fs",
          label: "Local filesystem",
          description: "Branches and history live in a directory on disk.",
          available: true,
          active: active === "local-fs",
        },
        {
          name: "mesa-sdk",
          label: "Mesa SDK · api.mesa.dev",
          description: "Real branches on Mesa's versioned filesystem via REST API.",
          available: hasMesa,
          active: active === "mesa-sdk",
        },
        {
          name: "mesa-mount",
          label: "Mesa fs.mount · native",
          description: "Native NAPI filesystem backed by Mesa cloud storage.",
          available: hasMesa,
          active: active === "mesa-mount",
        },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save keys" });
  }
});

apiRouter.post("/settings/backend", async (req, res) => {
  try {
    const { backend } = req.body as { backend: BackendChoice };
    if (!backend) {
      res.status(400).json({ error: "backend name required" });
      return;
    }
    if (backend === "local-fs") {
      await reinitializeMesa();
    } else {
      const mesaKey = getKey("MESA_API_KEY");
      if (!mesaKey) {
        res.status(400).json({ error: "Mesa API key required for this backend" });
        return;
      }
      await reinitializeMesa(mesaKey, backend);
    }
    emitActivity("file_written", `Backend switched to ${backend}`);
    res.json({ ok: true, active: getMesa().backendName() });
  } catch (error) {
    console.error("Backend switch failed:", error);
    res.status(500).json({ error: "Failed to switch backend" });
  }
});

apiRouter.delete("/settings/keys", async (_req, res) => {
  try {
    deleteKey("MESA_API_KEY");
    deleteKey("ANTHROPIC_API_KEY");
    await reinitializeMesa();
    clearAnthropic();
    res.json({ ok: true, keys: { mesa: false, anthropic: false } });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear keys" });
  }
});

apiRouter.post("/reset", async (_req, res) => {
  try {
    const mesa = getMesa();

    // 1. Delete all history files
    const historyFiles = await mesa.listFiles("main", "history");
    for (const file of historyFiles) {
      try {
        await mesa.deleteFile("main", `history/${file}`);
      } catch { /* skip */ }
    }

    // 2. Reset playbook to default
    await writePlaybook("main", "# Playbook\n\n_No entries yet. Agents will add observations and rules as they run._\n");

    // 3. Reset portfolio to default
    const { DEFAULT_PORTFOLIO } = await import("../index.js");
    await mesa.writeFile("main", "portfolio.json", JSON.stringify({
      ...DEFAULT_PORTFOLIO,
      lastUpdated: new Date().toISOString().split("T")[0],
    }, null, 2));

    // 4. Clear in-memory state
    lastRound = null;
    lastPriceMap = null;
    lastPlaybookBefore = null;

    emitActivity("file_written", "Demo reset — portfolio, playbook, and history cleared");

    res.json({ ok: true });
  } catch (error) {
    console.error("Reset failed:", error);
    res.status(500).json({ error: "Reset failed" });
  }
});

apiRouter.get("/activity", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const events = await getMesa().getActivity(limit);
    res.json({ events });
  } catch (error) {
    res.status(500).json({ error: "Failed to load activity" });
  }
});

// ── Webhook Targets ────────────────────────────────────────────────

apiRouter.get("/webhooks/targets", async (_req, res) => {
  try {
    const targets = await getMesa().listWebhookTargets();
    res.json({ targets });
  } catch (error) {
    res.status(500).json({ error: "Failed to list webhook targets" });
  }
});

apiRouter.post("/webhooks/targets", async (req, res) => {
  try {
    const { url, name, events } = req.body as { url: string; name?: string; events?: string[] };
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }
    const target = await getMesa().createWebhookTarget(url, name, events);
    emitActivity("file_written", `Webhook target created: ${url}`);
    res.json({ ok: true, target });
  } catch (error) {
    res.status(500).json({ error: "Failed to create webhook target" });
  }
});

apiRouter.delete("/webhooks/targets/:id", async (req, res) => {
  try {
    await getMesa().deleteWebhookTarget(req.params.id);
    emitActivity("file_written", "Webhook target deleted");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete webhook target" });
  }
});

// ── Rich Change History ────────────────────────────────────────────

apiRouter.get("/changes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 30;
    const changes = await getMesa().listChanges(limit);
    res.json({ changes });
  } catch (error) {
    res.status(500).json({ error: "Failed to list changes" });
  }
});

// ── Repository Tags ────────────────────────────────────────────────

apiRouter.get("/repo/tags", async (_req, res) => {
  try {
    const tags = await getMesa().getRepoTags();
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: "Failed to get repo tags" });
  }
});

apiRouter.post("/repo/tags", async (req, res) => {
  try {
    const { tags } = req.body as { tags: Record<string, string | null> };
    if (!tags) {
      res.status(400).json({ error: "tags object required" });
      return;
    }
    const updated = await getMesa().setRepoTags(tags);
    emitActivity("file_written", `Repo tags updated: ${Object.keys(tags).join(", ")}`);
    res.json({ ok: true, tags: updated });
  } catch (error) {
    res.status(500).json({ error: "Failed to update repo tags" });
  }
});
