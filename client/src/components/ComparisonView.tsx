import type { AgentResult } from "../types.js";
import { AgentCard } from "./AgentCard.js";

interface ComparisonViewProps {
  results: AgentResult[];
  onAccept: (branch: string) => void;
  onDismiss: () => void;
  isReplay?: boolean;
  mergedAgent?: string;
}

export function ComparisonView({ results, onAccept, onDismiss, isReplay, mergedAgent }: ComparisonViewProps) {
  return (
    <section className="reveal">
      <header className="flex items-end justify-between mb-6 pb-4 border-b border-line">
        <div>
          <h2 className="display-heading text-2xl">
            {isReplay ? "Past proposals" : "Pick a strategy"}
          </h2>
          {isReplay && (
            <p className="text-sm text-mute mt-1 font-mono">Read-only replay of a previous round</p>
          )}
        </div>
        {!isReplay && (
          <button
            onClick={onDismiss}
            className="group flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-mute hover:text-ink transition-colors"
          >
            <span>Discard all</span>
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
        {isReplay && (
          <button
            onClick={onDismiss}
            className="group flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-mute hover:text-ink transition-colors"
          >
            <span>Close</span>
            <span className="group-hover:translate-x-0.5 transition-transform">→</span>
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-line items-stretch">
        {results.map((r, i) => (
          <div
            key={r.agentName}
            className="border-b border-r last:border-r-0 border-line reveal lg:border-b-0 flex"
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            <AgentCard result={r} onAccept={() => onAccept(r.branch)} readOnly={isReplay} wasChosen={mergedAgent === r.agentName} />
          </div>
        ))}
      </div>
    </section>
  );
}
