import type { AgentResult } from "../types.js";
import { AgentCard } from "./AgentCard.js";

interface ComparisonViewProps {
  results: AgentResult[];
  onAccept: (branch: string) => void;
  onDismiss: () => void;
}

export function ComparisonView({ results, onAccept, onDismiss }: ComparisonViewProps) {
  return (
    <section className="reveal">
      <header className="flex items-end justify-between mb-8 pb-6 border-b border-line">
        <div>
          <div className="section-label mb-2">Three branches · independent agents</div>
          <h2 className="display-heading text-3xl">
            Strategy proposals
          </h2>
          <p className="serif-quote text-lg text-mute mt-3 max-w-xl">
            Each agent worked on an isolated Mesa branch. Choose one to merge into <span className="font-mono not-italic text-ink-2">main</span>.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="group flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-mute hover:text-ink transition-colors"
        >
          <span>Discard all</span>
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-line">
        {results.map((r, i) => (
          <div
            key={r.agentName}
            className="border-b border-r last:border-r-0 border-line reveal lg:border-b-0"
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            <AgentCard result={r} onAccept={() => onAccept(r.branch)} />
          </div>
        ))}
      </div>
    </section>
  );
}
