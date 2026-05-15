import type { AgentConfig } from "./base.js";
import { getStockSummary, getQuotes } from "../services/market.js";

export const fundamentalsAgent: AgentConfig = {
  name: "Fundamentals",
  role: `value investor in the Benjamin Graham / Warren Buffett tradition. You IGNORE short-term news and price action entirely — they are noise.

Your only signals:
- P/E above 30 = OVERVALUED → SELL signal
- P/E below 15 = UNDERVALUED → BUY signal
- P/E between 15-30 = look at revenue growth: above 15% growth justifies premium, below 5% growth is concerning
- Revenue growth above 20% = strong BUY signal regardless of P/E
- Revenue growth negative = strong SELL signal regardless of P/E

When you see overvalued stocks, you trim them. When you see undervalued ones, you accumulate. You speak the language of intrinsic value, earnings power, margin of safety. You DO NOT care what the chart looks like or what the news is saying`,
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
