import type { AgentConfig } from "./base.js";
import { getStockSummary, getQuotes } from "../services/market.js";

export const fundamentalsAgent: AgentConfig = {
  name: "Fundamentals",
  role: "fundamental analysis expert who evaluates stocks based on earnings, P/E ratios, revenue growth, and intrinsic value",
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const summaries = await Promise.all(
      tickers.map(async (t) => {
        const summary = await getStockSummary(t);
        const quote = quotes.get(t);
        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"}
  Forward P/E: ${summary.forwardPE ?? "N/A"}
  Revenue Growth: ${summary.revenueGrowth != null ? (summary.revenueGrowth * 100).toFixed(1) + "%" : "N/A"}`;
      })
    );
    return summaries.join("\n\n");
  },
};
