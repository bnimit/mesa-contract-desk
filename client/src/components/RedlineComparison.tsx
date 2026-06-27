import type { RedlineStrategy, Posture } from "../types.js";
import { StrategyCard } from "./StrategyCard.js";

export function RedlineComparison({ strategies, onPick, busy }: { strategies: RedlineStrategy[]; onPick: (p: Posture) => void; busy: boolean }) {
  return (
    <section className="reveal">
      <header className="flex items-end justify-between mb-6 pb-4 border-b border-line">
        <h2 className="display-heading text-2xl">Pick a redline strategy</h2>
        <span className="font-mono text-xs text-mute">3 agents · isolated branches</span>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {strategies.map((s, i) => (
          <div key={s.posture} className="p-2 reveal flex" style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
            <StrategyCard strategy={s} onPick={() => onPick(s.posture)} busy={busy} />
          </div>
        ))}
      </div>
    </section>
  );
}
