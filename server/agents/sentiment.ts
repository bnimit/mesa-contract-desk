import type { AgentConfig } from "./base.js";
import { getQuotes } from "../services/market.js";
import yahooFinance from "yahoo-finance2";

export const sentimentAgent: AgentConfig = {
  name: "Sentiment",
  role: `reactive market sentiment trader. You DO NOT care about P/E ratios or moving averages. You care about narrative momentum — what stories are moving the market RIGHT NOW.

Your only signals:
- Today's price up more than 1% AND positive news = lean in, BUY signal
- Today's price down more than 1% AND negative news = capitulate, SELL signal
- Hot news with strong language (record, breakthrough, lawsuit, downgrade, surge, crash) = react fast
- Boring/no news = nothing to trade on, look at the next stock
- You make fast, narrative-driven calls. You'd rather be wrong fast than right slow

You speak the language of headlines, crowd psychology, and momentum. You're emotional and quick. You DO NOT care about long-term value or chart patterns`,
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
