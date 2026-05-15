import { Router } from "express";
import { mesa } from "../services/mesa.js";
import { getQuotes } from "../services/market.js";
import { runAgent } from "../agents/base.js";
import { fundamentalsAgent } from "../agents/fundamentals.js";
import { sentimentAgent } from "../agents/sentiment.js";
import { technicalAgent } from "../agents/technical.js";
import { saveRoundSnapshot, listHistoryRounds } from "../services/memory.js";
import type { Portfolio, AnalysisRound, StorageBackend } from "../../shared/types.js";

export const apiRouter = Router();

// In-memory cache of the most recent round so /merge and /dismiss can record the outcome
let lastRound: AnalysisRound | null = null;
let lastPriceMap: Map<string, number> | null = null;

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

apiRouter.post("/analyze", async (_req, res) => {
  try {
    const raw = await mesa.readFile("main", "portfolio.json");
    const portfolio: Portfolio = JSON.parse(raw);
    const tickers = portfolio.portfolio.map((h) => h.ticker);
    const quotes = await getQuotes(tickers);
    const currentPrices = new Map<string, number>();
    for (const [ticker, quote] of quotes) {
      currentPrices.set(ticker, quote.price);
    }

    const timestamp = Date.now();
    const agents = [
      { config: fundamentalsAgent, branch: `agent/fundamentals-${timestamp}` },
      { config: sentimentAgent, branch: `agent/sentiment-${timestamp}` },
      { config: technicalAgent, branch: `agent/technical-${timestamp}` },
    ];

    for (const a of agents) {
      await mesa.createBranch(a.branch, "main");
    }

    const results = await Promise.all(
      agents.map((a) => runAgent(a.config, a.branch, currentPrices))
    );

    const round: AnalysisRound = {
      timestamp,
      branches: agents.map((a) => a.branch),
      results,
    };

    // Save snapshot immediately so even dismissed rounds are part of the agent's memory.
    await saveRoundSnapshot(round, currentPrices);

    lastRound = round;
    lastPriceMap = currentPrices;

    res.json({ timestamp, results });
  } catch (error) {
    console.error("Analysis failed:", error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

apiRouter.post("/merge", async (req, res) => {
  try {
    const { branch, allBranches } = req.body as { branch: string; allBranches: string[] };
    if (!branch || !allBranches) {
      res.status(400).json({ error: "branch and allBranches required" });
      return;
    }

    await mesa.mergeBranch(branch, "main");

    // Update the saved snapshot to record which agent's branch was merged.
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
    res.status(500).json({ error: "Merge failed" });
  }
});

apiRouter.post("/dismiss", async (req, res) => {
  try {
    const { allBranches } = req.body as { allBranches: string[] };
    for (const b of allBranches) {
      try {
        await mesa.deleteBranch(b);
      } catch {
        // branch may already be deleted
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
