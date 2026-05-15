import type { AgentResult } from "../types.js";
import { PlaybookDiff } from "./PlaybookDiff.js";

interface AgentCardProps {
  result: AgentResult;
  onAccept: () => void;
}

const AGENT_META: Record<string, { color: string; bg: string; label: string; sigil: string }> = {
  Fundamentals: {
    color: "text-fundamentals",
    bg: "bg-fundamentals",
    label: "Fundamental analysis",
    sigil: "◆",
  },
  Sentiment: {
    color: "text-sentiment",
    bg: "bg-sentiment",
    label: "Market sentiment",
    sigil: "●",
  },
  Technical: {
    color: "text-technical",
    bg: "bg-technical",
    label: "Technical analysis",
    sigil: "▲",
  },
};

export function AgentCard({ result, onAccept }: AgentCardProps) {
  const meta = AGENT_META[result.agentName] ?? {
    color: "text-mute",
    bg: "bg-mute",
    label: "Agent",
    sigil: "◇",
  };

  if (result.status === "error") {
    return (
      <article className="bg-canvas border border-line p-8 flex flex-col w-full">
        <header className="flex items-center gap-3 mb-6">
          <span className={`text-2xl ${meta.color}`}>{meta.sigil}</span>
          <div>
            <h3 className="font-mono text-sm tracking-wide uppercase">{result.agentName}</h3>
            <div className="section-label mt-0.5">{meta.label}</div>
          </div>
        </header>
        <div className="border border-down/30 bg-down/5 p-4 text-down text-sm font-mono">
          {result.error}
        </div>
      </article>
    );
  }

  const proposal = result.proposal!;
  const branchLabel = result.branch.replace(/^agent\//, "");

  return (
    <article className="bg-canvas border border-line p-8 flex flex-col w-full group hover:border-ink/30 transition-colors">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${meta.color}`}>{meta.sigil}</span>
            <div>
              <h3 className="font-mono text-sm tracking-wide uppercase text-ink">
                {result.agentName}
              </h3>
              <div className="section-label mt-0.5">{meta.label}</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-mute">
          <span>branch</span>
          <span className="text-ink-2">/</span>
          <span className={meta.color}>{branchLabel}</span>
        </div>
      </header>

      <blockquote className="serif-quote text-lg leading-snug text-ink-2 mb-6 pl-4 border-l-2 border-line-2">
        "{proposal.strategy}"
      </blockquote>

      {proposal.memory && proposal.memory.reviewed > 0 && (
        <div className="mb-6 border border-line p-3 bg-canvas-2/40">
          <div className="section-label mb-1.5 flex items-center gap-2">
            <span className="text-mesa">◇</span>
            <span>Memory · Mesa history</span>
          </div>
          <div className="font-mono text-xs text-ink-2 leading-relaxed">
            Reviewed{" "}
            <span className="text-ink">{proposal.memory.reviewed}</span> past prediction
            {proposal.memory.reviewed === 1 ? "" : "s"}
            {proposal.memory.correct + proposal.memory.wrong > 0 && (
              <>
                {" · "}
                <span className="text-up">{proposal.memory.correct} correct</span>
                {" · "}
                <span className="text-down">{proposal.memory.wrong} wrong</span>
              </>
            )}
          </div>
        </div>
      )}

      {proposal.playbookEntry && (
        <div className="mb-6">
          <PlaybookDiff entry={proposal.playbookEntry} agentColor={meta.color} />
        </div>
      )}

      <div className="flex-1 mb-8">
        <div className="section-label mb-4">Proposed trades</div>
        <div className="space-y-3">
          {proposal.actions.map((a, i) => (
            <div key={i} className="border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-mono text-xs tracking-widest uppercase ${
                      a.action === "buy"
                        ? "text-up"
                        : a.action === "sell"
                        ? "text-down"
                        : "text-mute"
                    }`}
                  >
                    {a.action}
                  </span>
                  <span className="font-mono text-base text-ink tracking-tight">
                    {a.ticker}
                  </span>
                  {a.action !== "hold" && (
                    <span className="font-mono tabular text-sm text-ink-2">
                      × {a.shares}
                    </span>
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] tracking-widest uppercase ${
                    a.confidence === "high"
                      ? "text-up"
                      : a.confidence === "medium"
                      ? "text-ink-2"
                      : "text-mute"
                  }`}
                >
                  {a.confidence}
                </span>
              </div>
              {a.reason && (
                <p className="text-xs text-mute leading-relaxed mt-1">{a.reason}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <div className="border-t border-line pt-4 mb-6 flex items-baseline justify-between">
          <div className="section-label">Projected value</div>
          <div className="font-mono tabular text-xl text-ink">
            ${proposal.newMarketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <details className="mb-6 group/details">
          <summary className="section-label cursor-pointer hover:text-ink transition-colors flex items-center gap-2">
            <span>Reasoning</span>
            <span className="text-mute-2 group-open/details:rotate-90 transition-transform">›</span>
          </summary>
          <p className="serif-quote text-sm text-ink-2 leading-relaxed mt-3 pl-4 border-l border-line">
            {proposal.reasoning}
          </p>
        </details>

        <button
          onClick={onAccept}
          className="group/btn w-full flex items-center justify-between gap-3 px-5 py-4 bg-ink text-canvas hover:bg-mesa transition-colors"
        >
          <span className="font-mono text-xs tracking-widest uppercase">
            Choose strategy
          </span>
          <span className="font-mono text-base group-hover/btn:translate-x-1 transition-transform">
            →
          </span>
        </button>
      </div>
    </article>
  );
}
