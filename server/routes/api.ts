import { Router } from "express";
import { mesa } from "../services/mesa.js";
import { getQuotes } from "../services/market.js";
import { runAgent } from "../agents/base.js";
import { fundamentalsAgent } from "../agents/fundamentals.js";
import { sentimentAgent } from "../agents/sentiment.js";
import { technicalAgent } from "../agents/technical.js";
import type { Portfolio } from "../../shared/types.js";

export const apiRouter = Router();

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

    res.json({ timestamp, results });
  } catch (error) {
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
