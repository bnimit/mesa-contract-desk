import type { AgentResult } from "../types.js";

interface AgentCardProps {
  result: AgentResult;
  onAccept: () => void;
}

const AGENT_COLORS: Record<string, string> = {
  Fundamentals: "border-blue-500",
  Sentiment: "border-purple-500",
  Technical: "border-amber-500",
};

const AGENT_ICONS: Record<string, string> = {
  Fundamentals: "📊",
  Sentiment: "📰",
  Technical: "📈",
};

export function AgentCard({ result, onAccept }: AgentCardProps) {
  const color = AGENT_COLORS[result.agentName] ?? "border-gray-300";
  const icon = AGENT_ICONS[result.agentName] ?? "🤖";

  if (result.status === "error") {
    return (
      <div className={`border-t-4 ${color} bg-white rounded-lg shadow p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{icon}</span>
          <h3 className="text-lg font-semibold">{result.agentName}</h3>
        </div>
        <div className="bg-red-50 text-red-700 p-3 rounded text-sm">
          {result.error}
        </div>
      </div>
    );
  }

  const proposal = result.proposal!;

  return (
    <div className={`border-t-4 ${color} bg-white rounded-lg shadow p-6 flex flex-col`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-semibold">{result.agentName}</h3>
      </div>
      <p className="text-sm text-gray-600 mb-4 italic">{proposal.strategy}</p>

      <div className="flex-1">
        <h4 className="text-sm font-medium text-gray-500 mb-2">Proposed Trades</h4>
        <div className="space-y-2 mb-4">
          {proposal.actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  a.action === "buy"
                    ? "bg-green-100 text-green-700"
                    : a.action === "sell"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {a.action.toUpperCase()}
              </span>
              <span className="font-mono">{a.ticker}</span>
              {a.action !== "hold" && <span>×{a.shares}</span>}
              <span
                className={`ml-auto text-xs px-1.5 py-0.5 rounded ${
                  a.confidence === "high"
                    ? "bg-green-50 text-green-600"
                    : a.confidence === "medium"
                    ? "bg-yellow-50 text-yellow-600"
                    : "bg-gray-50 text-gray-500"
                }`}
              >
                {a.confidence}
              </span>
            </div>
          ))}
        </div>

        <div className="text-sm text-gray-500 mb-4">
          <div className="flex justify-between">
            <span>New Market Value</span>
            <span className="font-semibold text-gray-900">
              ${proposal.newMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <details className="text-sm mb-4">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Full Reasoning</summary>
          <p className="mt-2 text-gray-600 whitespace-pre-wrap">{proposal.reasoning}</p>
        </details>
      </div>

      <button
        onClick={onAccept}
        className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
      >
        Accept This Strategy
      </button>
    </div>
  );
}
