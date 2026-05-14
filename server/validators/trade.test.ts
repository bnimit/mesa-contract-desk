import { validateProposal, applyActions } from "./trade.js";
import type { Portfolio, TradeAction } from "../../shared/types.js";

const portfolio: Portfolio = {
  portfolio: [
    { ticker: "AAPL", shares: 10, avgCost: 185 },
    { ticker: "NVDA", shares: 5, avgCost: 890 },
  ],
  cash: 5000,
  lastUpdated: "2026-05-14",
};

const prices = new Map([["AAPL", 195], ["NVDA", 950]]);

// Valid actions
const valid: TradeAction[] = [
  { ticker: "AAPL", action: "buy", shares: 5, reason: "undervalued", confidence: "high" },
  { ticker: "NVDA", action: "sell", shares: 2, reason: "overvalued", confidence: "medium" },
];
let errors = validateProposal(portfolio, valid, prices);
console.assert(errors.length === 0, `Expected no errors, got: ${JSON.stringify(errors)}`);

// Sell too many shares (>50%)
const oversell: TradeAction[] = [
  { ticker: "AAPL", action: "sell", shares: 8, reason: "panic", confidence: "low" },
];
errors = validateProposal(portfolio, oversell, prices);
console.assert(errors.length === 1, "Should reject selling >50%");

// Buy exceeds 30% of cash
const overbuy: TradeAction[] = [
  { ticker: "AAPL", action: "buy", shares: 100, reason: "yolo", confidence: "high" },
];
errors = validateProposal(portfolio, overbuy, prices);
console.assert(errors.length > 0, "Should reject buy exceeding 30% cash");

// Unknown ticker
const unknownTicker: TradeAction[] = [
  { ticker: "TSLA", action: "buy", shares: 1, reason: "hype", confidence: "low" },
];
errors = validateProposal(portfolio, unknownTicker, prices);
console.assert(errors.length === 1, "Should reject unknown ticker");

// Apply valid actions
const result = applyActions(portfolio, valid, prices);
console.assert(result.portfolio.find((h) => h.ticker === "AAPL")?.shares === 15, "AAPL should be 15 shares");
console.assert(result.portfolio.find((h) => h.ticker === "NVDA")?.shares === 3, "NVDA should be 3 shares");

console.log("All trade validator tests passed");
