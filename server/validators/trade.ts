import type { Portfolio, TradeAction } from "../../shared/types.js";

export interface ValidationError {
  action: TradeAction;
  reason: string;
}

export function validateProposal(
  original: Portfolio,
  actions: TradeAction[],
  currentPrices: Map<string, number>
): ValidationError[] {
  const errors: ValidationError[] = [];
  let remainingCash = original.cash;
  const holdingsMap = new Map(original.portfolio.map((h) => [h.ticker, h.shares]));

  for (const action of actions) {
    if (action.action === "hold") continue;

    const currentShares = holdingsMap.get(action.ticker);
    if (currentShares === undefined) {
      errors.push({ action, reason: `Ticker ${action.ticker} is not in the portfolio` });
      continue;
    }

    const price = currentPrices.get(action.ticker);
    if (!price) {
      errors.push({ action, reason: `No price available for ${action.ticker}` });
      continue;
    }

    if (action.action === "sell") {
      const maxSellable = Math.floor(currentShares * 0.5);
      if (action.shares > maxSellable) {
        errors.push({
          action,
          reason: `Cannot sell ${action.shares} shares of ${action.ticker}. Max is ${maxSellable} (50% of ${currentShares})`,
        });
      } else {
        remainingCash += action.shares * price;
        holdingsMap.set(action.ticker, currentShares - action.shares);
      }
    }

    if (action.action === "buy") {
      const cost = action.shares * price;
      const maxSpend = original.cash * 0.3;
      if (cost > maxSpend) {
        errors.push({
          action,
          reason: `Buy cost $${cost.toFixed(2)} exceeds 30% of cash ($${maxSpend.toFixed(2)})`,
        });
      } else {
        remainingCash -= cost;
        holdingsMap.set(action.ticker, currentShares + action.shares);
      }
    }
  }

  if (remainingCash < 500) {
    errors.push({
      action: { ticker: "", action: "buy", shares: 0, reason: "", confidence: "low" },
      reason: `Cash would drop to $${remainingCash.toFixed(2)}, below $500 floor`,
    });
  }

  return errors;
}

export function applyActions(original: Portfolio, actions: TradeAction[], currentPrices: Map<string, number>): Portfolio {
  const holdingsMap = new Map(original.portfolio.map((h) => [h.ticker, { ...h }]));
  let cash = original.cash;

  for (const action of actions) {
    if (action.action === "hold") continue;
    const holding = holdingsMap.get(action.ticker);
    if (!holding) continue;
    const price = currentPrices.get(action.ticker) ?? 0;

    if (action.action === "buy") {
      holding.shares += action.shares;
      cash -= action.shares * price;
    } else if (action.action === "sell") {
      holding.shares -= action.shares;
      cash += action.shares * price;
    }
  }

  return {
    portfolio: Array.from(holdingsMap.values()),
    cash,
    lastUpdated: new Date().toISOString().split("T")[0],
  };
}
