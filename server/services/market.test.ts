import { getQuotes, getHistoricalPrices, getStockSummary } from "./market.js";

async function smoke() {
  const quotes = await getQuotes(["AAPL", "MSFT"]);
  console.log("Quotes:", Object.fromEntries(quotes));
  console.assert(quotes.size > 0, "should return at least sample data");

  const history = await getHistoricalPrices("AAPL", 30);
  console.log("Historical data points:", history.length);

  const summary = await getStockSummary("AAPL");
  console.log("Stock summary:", summary);

  console.log("Market service smoke test passed");
}

smoke().catch(console.error);
