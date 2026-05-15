import { Router } from "express";
import { mesa } from "../services/mesa.js";
import { getQuotes } from "../services/market.js";
import { runAgent } from "../agents/base.js";
import { fundamentalsAgent } from "../agents/fundamentals.js";
import { sentimentAgent } from "../agents/sentiment.js";
import { technicalAgent } from "../agents/technical.js";
import { saveRoundSnapshot, listHistoryRounds } from "../services/memory.js";
import { readPlaybook, appendEntry, diffAppended } from "../services/playbook.js";
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
  await mesa.createBranch(snapshotBranch, "main");
  return snapshotBranch;
}

apiRouter.get("/portfolio", async (_req, res) => {
  try {
    const raw = await mesa.readFile("main", "portfolio.json");
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
  const raw = await mesa.readFile("main", "portfolio.json");
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
    await mesa.createBranch(a.branch, "main");
  }

  const results = await Promise.all(
    agents.map((a) => runAgent(a.config, a.branch, currentPrices, { timestamp }))
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

  return { timestamp, results, replayedFrom };
}

apiRouter.post("/analyze", async (_req, res) => {
  try {
    const result = await runAnalysis(Date.now());
    res.json(result);
  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

apiRouter.post("/replay", async (req, res) => {
  try {
    const { from } = req.body as { from: number };
    if (!from) {
      res.status(400).json({ error: "'from' timestamp required" });
      return;
    }

    const snapshotBranch = `snapshot/${from}`;
    // Restore main to the snapshot state.
    await mesa.mergeBranch(snapshotBranch, "main");

    const result = await runAnalysis(Date.now(), from);
    res.json(result);
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
    const portfolioRaw = await mesa.readFile(winningBranch, "portfolio.json");
    await mesa.writeFile("main", "portfolio.json", portfolioRaw);
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

    if (lastRound && lastRound.branches.includes(branch) && lastPriceMap) {
      const mergedResult = lastRound.results.find((r) => r.branch === branch);
      lastRound.mergedAgent = mergedResult?.agentName;
      await saveRoundSnapshot(lastRound, lastPriceMap);
    }

    for (const b of allBranches) {
      try {
        await mesa.deleteBranch(b);
      } catch {
        // branch may already be deleted
      }
    }

    const raw = await mesa.readFile("main", "portfolio.json");
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
        await mesa.deleteBranch(b);
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
    const portfolioRaw = await mesa.readFile("main", "portfolio.json");
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
  const active = mesa.backendName();
  const hasMesaKey = !!process.env.MESA_API_KEY && process.env.MESA_API_KEY.length > 0;

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
        "Real branches on Mesa's versioned filesystem. Requires MESA_API_KEY in .env. Requested early access — not yet enabled.",
      available: hasMesaKey,
      active: active === "mesa-sdk",
    },
  ];

  res.json({ backends });
});
