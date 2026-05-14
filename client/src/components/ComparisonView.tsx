import type { AgentResult } from "../types.js";
import { AgentCard } from "./AgentCard.js";

interface ComparisonViewProps {
  results: AgentResult[];
  onAccept: (branch: string) => void;
  onDismiss: () => void;
}

export function ComparisonView({ results, onAccept, onDismiss }: ComparisonViewProps) {
  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Agent Proposals</h2>
        <button
          onClick={onDismiss}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Dismiss All
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {results.map((r) => (
          <AgentCard key={r.agentName} result={r} onAccept={() => onAccept(r.branch)} />
        ))}
      </div>
    </div>
  );
}
