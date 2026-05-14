import type { AgentConfig } from "./base.js";
import { getQuotes } from "../services/market.js";
import yahooFinance from "yahoo-finance2";

export const sentimentAgent: AgentConfig = {
  name: "Sentiment",
  role: "market sentiment analyst who evaluates stocks based on recent news, market buzz, and momentum indicators",
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const results = await Promise.all(
      tickers.map(async (t) => {
        const quote = quotes.get(t);
        let newsSection = "No recent news available";
        try {
          const search = await yahooFinance.search(t, { newsCount: 3 });
          if (search.news && search.news.length > 0) {
            newsSection = search.news.map((n) => `- ${n.title}`).join("\n");
          }
        } catch {
          // news unavailable
        }
        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"} (${quote?.changePercent?.toFixed(2) ?? 0}% today)
  Recent News:
${newsSection}`;
      })
    );
    return results.join("\n\n");
  },
};
