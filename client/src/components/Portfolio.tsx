import type { PortfolioWithPrices } from "../types.js";

export function Portfolio({ data }: { data: PortfolioWithPrices }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Current Portfolio</h2>
        <div className="text-right">
          <div className="text-sm text-gray-500">Total Market Value</div>
          <div className="text-2xl font-bold">${data.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pb-2">Ticker</th>
            <th className="pb-2">Name</th>
            <th className="pb-2 text-right">Shares</th>
            <th className="pb-2 text-right">Avg Cost</th>
            <th className="pb-2 text-right">Price</th>
            <th className="pb-2 text-right">Value</th>
            <th className="pb-2 text-right">P/L</th>
          </tr>
        </thead>
        <tbody>
          {data.portfolio.map((h) => {
            const value = h.shares * h.currentPrice;
            const cost = h.shares * h.avgCost;
            const pl = value - cost;
            const plPct = ((pl / cost) * 100).toFixed(1);
            return (
              <tr key={h.ticker} className="border-b last:border-0">
                <td className="py-2 font-mono font-semibold">{h.ticker}</td>
                <td className="py-2 text-gray-600">{h.name}</td>
                <td className="py-2 text-right">{h.shares}</td>
                <td className="py-2 text-right">${h.avgCost.toFixed(2)}</td>
                <td className="py-2 text-right">${h.currentPrice.toFixed(2)}</td>
                <td className="py-2 text-right">${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className={`py-2 text-right font-medium ${pl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {pl >= 0 ? "+" : ""}${pl.toFixed(2)} ({plPct}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 text-sm text-gray-500">
        Cash: ${data.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
