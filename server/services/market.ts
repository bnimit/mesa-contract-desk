import yahooFinance from "yahoo-finance2";
import fs from "fs/promises";
import path from "path";
import type { MarketQuote } from "../../shared/types.js";

const SAMPLE_DATA_PATH = path.resolve("data/sample-market.json");

let cachedQuotes: Map<string, MarketQuote> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

export async function getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const now = Date.now();
  if (now - cacheTimestamp < CACHE_TTL_MS && tickers.every((t) => cachedQuotes.has(t))) {
    return cachedQuotes;
  }

  try {
    return await fetchFromYahoo(tickers);
  } catch {
    console.warn("Yahoo Finance unavailable, using sample data");
    return await fetchFromSampleData(tickers);
  }
}

async function fetchFromYahoo(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const results = new Map<string, MarketQuote>();
  const quotes = await yahooFinance.quote(tickers);
  const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

  for (const q of quoteArray) {
    if (!q.symbol) continue;
    results.set(q.symbol, {
      ticker: q.symbol,
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      name: q.shortName ?? q.symbol,
    });
  }

  cachedQuotes = results;
  cacheTimestamp = Date.now();
  return results;
}

async function fetchFromSampleData(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const raw = JSON.parse(await fs.readFile(SAMPLE_DATA_PATH, "utf-8"));
  const results = new Map<string, MarketQuote>();
  for (const ticker of tickers) {
    if (raw[ticker]) {
      results.set(ticker, { ticker, ...raw[ticker] });
    }
  }
  return results;
}

export async function getHistoricalPrices(
  ticker: string,
  days: number
): Promise<{ date: string; close: number }[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await yahooFinance.chart(ticker, {
      period1: startDate.toISOString().split("T")[0],
      period2: endDate.toISOString().split("T")[0],
      interval: "1d",
    });

    return (result.quotes ?? []).map((q) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      close: q.close ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getStockSummary(
  ticker: string
): Promise<{ peRatio: number | null; forwardPE: number | null; revenueGrowth: number | null; marketCap: number | null }> {
  try {
    const summary = await yahooFinance.quoteSummary(ticker, { modules: ["defaultKeyStatistics", "financialData"] });
    return {
      peRatio: summary.defaultKeyStatistics?.trailingEps ?? null,
      forwardPE: summary.defaultKeyStatistics?.forwardPE ?? null,
      revenueGrowth: summary.financialData?.revenueGrowth ?? null,
      marketCap: summary.financialData?.totalRevenue ?? null,
    };
  } catch {
    return { peRatio: null, forwardPE: null, revenueGrowth: null, marketCap: null };
  }
}
