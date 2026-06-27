import type { RedlineStrategy, Posture } from "../types.js";

const POSTURE_META: Record<Posture, { color: string; label: string; sigil: string }> = {
  aggressive: { color: "text-down",          label: "Aggressive", sigil: "▲" },
  balanced:   { color: "text-fundamentals",  label: "Balanced",   sigil: "◆" },
  minimal:    { color: "text-mute",          label: "Minimal",    sigil: "●" },
};

export function StrategyCard({ strategy, onPick, busy }: { strategy: RedlineStrategy; onPick: () => void; busy: boolean }) {
  const meta = POSTURE_META[strategy.posture];
  return (
    <article className="card p-6 hover:shadow-[0_6px_18px_rgba(6,78,59,0.10)] transition-shadow flex flex-col w-full">
      <header className="flex items-center gap-3 mb-4">
        <span className={`text-xl ${meta.color}`}>{meta.sigil}</span>
        <div className="flex-1">
          <h3 className="font-mono text-sm tracking-wide uppercase text-ink">{meta.label}</h3>
          <div className="section-label mt-0.5">{strategy.summary}</div>
        </div>
      </header>
      <ul className="space-y-3 mb-5 flex-1">
        {strategy.edits.map((e) => (
          <li key={e.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-[10px] tracking-widest uppercase mt-0.5 shrink-0 w-12 ${e.type === "delete" ? "text-down" : e.type === "insert" ? "text-up" : "text-mute"}`}>
                {e.type === "replace" ? "revise" : e.type}
              </span>
              <span className="text-ink-2 leading-snug">
                <span className="font-mono text-ink">{e.heading ?? e.targetClauseId}</span>
                <span className="text-mute"> — {e.justification}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={onPick}
        disabled={busy}
        className="group/btn mt-auto w-full flex items-center justify-between gap-3 px-5 py-3 bg-mesa text-white rounded-lg hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40"
      >
        <span className="font-mono text-xs tracking-widest uppercase">Take to approval</span>
        <span className="font-mono text-base group-hover/btn:translate-x-1 transition-transform">→</span>
      </button>
    </article>
  );
}
