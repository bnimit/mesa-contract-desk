import type { PortfolioWithPrices } from "../types.js";

export function Portfolio({ data }: { data: PortfolioWithPrices }) {
  const totalCost = data.portfolio.reduce((sum, h) => sum + h.shares * h.avgCost, 0);
  const totalPL = data.marketValue - data.cash - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <section className="reveal">
      <header className="flex items-end justify-between mb-8 pb-6 border-b border-line">
        <div>
          <div className="section-label mb-2">Holdings · Mesa branch: main</div>
          <h2 className="display-heading text-3xl">
            Current position
          </h2>
        </div>
        <div className="text-right">
          <div className="section-label mb-2">Net market value</div>
          <div className="tabular font-mono text-4xl font-light tracking-tight text-ink">
            ${data.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            className={`tabular font-mono text-sm mt-1 ${
              totalPL >= 0 ? "text-up" : "text-down"
            }`}
          >
            {totalPL >= 0 ? "▲" : "▼"} ${Math.abs(totalPL).toFixed(2)} ({totalPLPct >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}%)
          </div>
        </div>
      </header>

      <table className="w-full">
        <thead>
          <tr className="section-label">
            <th className="text-left pb-3 font-medium">Symbol</th>
            <th className="text-left pb-3 font-medium">Company</th>
            <th className="text-right pb-3 font-medium">Qty</th>
            <th className="text-right pb-3 font-medium">Avg cost</th>
            <th className="text-right pb-3 font-medium">Market</th>
            <th className="text-right pb-3 font-medium">Value</th>
            <th className="text-right pb-3 font-medium">P/L</th>
          </tr>
        </thead>
        <tbody>
          {data.portfolio.map((h, i) => {
            const value = h.shares * h.currentPrice;
            const cost = h.shares * h.avgCost;
            const pl = value - cost;
            const plPct = ((pl / cost) * 100).toFixed(2);
            return (
              <tr
                key={h.ticker}
                className="border-t border-line group hover:bg-canvas-2/60 transition-colors reveal"
                style={{ animationDelay: `${0.1 + i * 0.05}s` }}
              >
                <td className="py-4">
                  <span className="font-mono text-base tracking-tight text-ink">
                    {h.ticker}
                  </span>
                </td>
                <td className="py-4 text-ink-2 text-sm">{h.name}</td>
                <td className="py-4 text-right font-mono tabular text-ink">{h.shares}</td>
                <td className="py-4 text-right font-mono tabular text-ink-2">
                  ${h.avgCost.toFixed(2)}
                </td>
                <td className="py-4 text-right font-mono tabular text-ink">
                  ${h.currentPrice.toFixed(2)}
                </td>
                <td className="py-4 text-right font-mono tabular text-ink">
                  ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-4 text-right">
                  <div className={`font-mono tabular text-sm ${pl >= 0 ? "text-up" : "text-down"}`}>
                    {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                  </div>
                  <div className={`font-mono tabular text-xs mt-0.5 ${pl >= 0 ? "text-up/70" : "text-down/70"}`}>
                    {pl >= 0 ? "+" : ""}{plPct}%
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-6 pt-6 border-t border-line flex justify-between items-baseline">
        <div className="section-label">Available cash</div>
        <div className="font-mono tabular text-lg text-ink">
          ${data.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </section>
  );
}
