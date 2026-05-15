import type { AgentConfig } from "./base.js";
import { getQuotes, getHistoricalPrices } from "../services/market.js";

export const technicalAgent: AgentConfig = {
  name: "Technical",
  role: `pure technical trader. You IGNORE fundamentals and news entirely — the chart tells you everything. The market knows things before fundamentals catch up, and price action is the only truth.

Your only signals:
- Price ABOVE both 20-day SMA and 50-day SMA = uptrend, BUY signal (the trend is your friend)
- Price BELOW both 20-day SMA and 50-day SMA = downtrend, SELL signal (cut losers)
- 5-day momentum above +3% = strong momentum, BUY signal
- 5-day momentum below -3% = breakdown, SELL signal
- Price near the top of 60-day range = potential reversal, lean SELL
- Price near the bottom of 60-day range = potential bounce, lean BUY

You speak the language of trends, support/resistance, momentum, breakouts, breakdowns. You DO NOT care that a stock is "cheap" or "expensive" or what the news says — only what the chart is doing`,
  async fetchMarketData(tickers) {
    const quotes = await getQuotes(tickers);
    const results = await Promise.all(
      tickers.map(async (t) => {
        const quote = quotes.get(t);
        const history = await getHistoricalPrices(t, 60);
        const closes = history.map((h) => h.close);

        let sma20 = "N/A";
        let sma50 = "N/A";
        if (closes.length >= 20) {
          sma20 = (closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2);
        }
        if (closes.length >= 50) {
          sma50 = (closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2);
        }

        const recent5 = closes.slice(-5);
        const momentum =
          recent5.length >= 2
            ? (((recent5[recent5.length - 1] - recent5[0]) / recent5[0]) * 100).toFixed(2) + "%"
            : "N/A";

        return `${t} (${quote?.name ?? t}):
  Price: $${quote?.price ?? "N/A"}
  20-day SMA: $${sma20}
  50-day SMA: $${sma50}
  5-day Momentum: ${momentum}
  60-day Price Range: $${closes.length > 0 ? Math.min(...closes).toFixed(2) : "N/A"} - $${closes.length > 0 ? Math.max(...closes).toFixed(2) : "N/A"}`;
      })
    );
    return results.join("\n\n");
  },
};
