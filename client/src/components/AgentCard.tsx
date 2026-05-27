import type { AgentResult, MesaDiffEntry } from "../types.js";

interface AgentCardProps {
  result: AgentResult;
  onAccept: () => void;
  diff?: MesaDiffEntry[];
  readOnly?: boolean;
  wasChosen?: boolean;
}

const AGENT_META: Record<string, { color: string; label: string; sigil: string }> = {
  Fundamentals: { color: "text-fundamentals", label: "Fundamental analysis", sigil: "◆" },
  Sentiment:    { color: "text-sentiment",    label: "Market sentiment",     sigil: "●" },
  Technical:    { color: "text-technical",     label: "Technical analysis",   sigil: "▲" },
};

function fmtCash(n: number) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AgentCard({ result, onAccept, readOnly, wasChosen }: AgentCardProps) {
  const meta = AGENT_META[result.agentName] ?? { color: "text-mute", label: "Agent", sigil: "◇" };

  if (result.status === "error") {
    return (
      <article className="bg-canvas border border-line p-6 flex flex-col w-full">
        <header className="flex items-center gap-3 mb-4">
          <span className={`text-xl ${meta.color}`}>{meta.sigil}</span>
          <h3 className="font-mono text-sm tracking-wide uppercase">{result.agentName}</h3>
        </header>
        <div className="border border-down/30 bg-down/5 p-3 text-down text-xs font-mono">
          {result.error}
        </div>
      </article>
    );
  }

  const proposal = result.proposal!;

  return (
    <article className={`bg-canvas border p-6 flex flex-col w-full group transition-colors ${wasChosen ? "border-ink border-t-[3px]" : "border-line hover:border-ink/30"}`}>
      {/* Header */}
      <header className="flex items-center gap-3 mb-4">
        <span className={`text-xl ${meta.color}`}>{meta.sigil}</span>
        <div className="flex-1">
          <h3 className="font-mono text-sm tracking-wide uppercase text-ink">{result.agentName}</h3>
          <div className="section-label mt-0.5">{meta.label}</div>
        </div>
        {wasChosen && (
          <span className="font-mono text-[10px] tracking-widest uppercase text-up border border-up/30 px-2 py-0.5">
            Chosen
          </span>
        )}
      </header>

      {/* Trade bullets */}
      <ul className="space-y-2 mb-5 flex-1">
        {proposal.actions.map((a, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span
              className={`font-mono text-[10px] tracking-widest uppercase mt-0.5 shrink-0 w-8 ${
                a.action === "buy" ? "text-up" : a.action === "sell" ? "text-down" : "text-mute"
              }`}
            >
              {a.action}
            </span>
            <span className="text-ink-2 leading-snug">
              <span className="font-mono text-ink">{a.ticker}</span>
              {a.action !== "hold" && (
                <span className="font-mono text-mute"> ×{a.shares}</span>
              )}
              {a.reason && <span className="text-mute"> — {a.reason}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* Cash summary */}
      <div className="border-t border-line pt-3 mb-4">
        <div className="flex items-baseline justify-between text-xs font-mono">
          <span className="text-mute">Portfolio</span>
          <span className="text-ink tabular">{fmtCash(proposal.newMarketValue)}</span>
        </div>
        {proposal.cashDelta !== 0 && (
          <div className="flex items-baseline justify-between text-xs font-mono mt-1">
            <span className="text-mute">Cash delta</span>
            <span className={`tabular ${proposal.cashDelta > 0 ? "text-up" : "text-down"}`}>
              {proposal.cashDelta > 0 ? "+" : ""}{fmtCash(proposal.cashDelta)}
            </span>
          </div>
        )}
      </div>

      {/* Choose button */}
      {!readOnly && (
        <button
          onClick={onAccept}
          className="group/btn mt-auto w-full flex items-center justify-between gap-3 px-5 py-3 bg-ink text-canvas hover:bg-mesa transition-colors"
        >
          <span className="font-mono text-xs tracking-widest uppercase">Choose strategy</span>
          <span className="font-mono text-base group-hover/btn:translate-x-1 transition-transform">→</span>
        </button>
      )}
    </article>
  );
}
