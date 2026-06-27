import { Router } from "express";
import { getMesa, reinitializeMesa, type BackendChoice } from "../services/mesa.js";
import { hasKey, setKey, deleteKey, getKey } from "../services/config.js";
import { reinitializeAnthropic, clearAnthropic } from "../services/claude.js";
import { emitActivity } from "./events.js";
import {
  getContract, startReview, pickStrategy, approveNext, rejectNext,
  rollbackLast, mergeReview, getActiveReview, getAuditTrail, clearActiveReview,
} from "../services/review.js";
import type { StorageBackend, Posture } from "../../shared/types.js";

export const apiRouter = Router();

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

apiRouter.get("/contract", async (_req, res) => {
  try {
    res.json(await getContract());
  } catch {
    res.status(500).json({ error: "Failed to load contract" });
  }
});

apiRouter.post("/review/start", async (_req, res) => {
  try {
    const id = Date.now();
    const strategies = await startReview(id);
    res.json({ id, strategies });
  } catch (error) {
    console.error("Review start failed:", error);
    res.status(500).json({ error: "Failed to start review" });
  }
});

apiRouter.post("/review/pick", async (req, res) => {
  try {
    const { id, posture } = req.body as { id: number; posture: Posture };
    if (!id || !posture) { res.status(400).json({ error: "id and posture required" }); return; }
    res.json(await pickStrategy(id, posture));
  } catch (error) {
    console.error("Pick failed:", error);
    res.status(500).json({ error: "Failed to pick strategy" });
  }
});

apiRouter.post("/review/approve", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await approveNext(id, "you"));
  } catch (error) { console.error("Approve failed:", error); res.status(500).json({ error: "Approve failed" }); }
});

apiRouter.post("/review/reject", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await rejectNext(id, "you"));
  } catch (error) { console.error("Reject failed:", error); res.status(500).json({ error: "Reject failed" }); }
});

apiRouter.post("/review/rollback", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await rollbackLast(id, "you"));
  } catch (error) { console.error("Rollback failed:", error); res.status(500).json({ error: "Rollback failed" }); }
});

apiRouter.post("/review/merge", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json({ contract: await mergeReview(id) });
  } catch (error) {
    console.error("Merge failed:", error);
    res.status(500).json({ error: "Merge failed" });
  }
});

apiRouter.get("/review/active", async (_req, res) => {
  try {
    res.json({ review: await getActiveReview() });
  } catch (error) { console.error("Load active review failed:", error); res.status(500).json({ error: "Failed to load active review" }); }
});

apiRouter.get("/audit", async (_req, res) => {
  try {
    res.json({ events: await getAuditTrail() });
  } catch (error) { console.error("Load audit trail failed:", error); res.status(500).json({ error: "Failed to load audit trail" }); }
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
        const repo = await client.repos.get({ repo: "contract-redline" }).catch(() => null);
        mesaInfo = {
          org: who.org.slug,
          repo: "contract-redline",
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
    const { SAMPLE_CONTRACT } = await import("../data/sample-contract.js");
    await clearActiveReview();
    await getMesa().writeFile("main", "contract.json", JSON.stringify(SAMPLE_CONTRACT, null, 2));
    await getMesa().writeFile("main", "audit-log.json", JSON.stringify([]));
    emitActivity("file_written", "Demo reset — contract restored to v1, audit cleared");
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
