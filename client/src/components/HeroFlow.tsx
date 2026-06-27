import type { Persona } from "../types.js";

/**
 * The visual "sentence" under the hero title:
 * 📄 Contract → [selected department icons] → ✅ You cherry-pick → 📑 Clean v2
 * Reflects the currently-selected reviewers so the hero tracks the user's choices.
 */
export function HeroFlow({ reviewers }: { reviewers: Persona[] }) {
  const Step = ({ glyph, caption }: { glyph: string; caption: string }) => (
    <div className="text-center shrink-0">
      <div className="text-2xl leading-none">{glyph}</div>
      <div className="text-[10px] text-mute mt-1 whitespace-nowrap">{caption}</div>
    </div>
  );
  const Arrow = () => <span className="text-mute-2 text-lg shrink-0">→</span>;

  return (
    <div className="flex items-center gap-3 flex-wrap mt-7">
      <Step glyph="📄" caption="A contract" />
      <Arrow />
      <div className="flex items-center gap-2">
        {(reviewers.length ? reviewers : []).map((p) => (
          <div key={p.id} className="text-center rounded-lg px-2.5 py-1.5" style={{ background: p.color + "14", border: `1px solid ${p.color}33` }}>
            <div className="text-xl leading-none">{p.icon}</div>
            <div className="text-[9px] font-semibold mt-0.5 whitespace-nowrap" style={{ color: p.color }}>{p.label}</div>
          </div>
        ))}
        {reviewers.length === 0 && <span className="text-xs text-mute">pick your reviewers…</span>}
      </div>
      <Arrow />
      <Step glyph="✅" caption="You keep the best" />
      <Arrow />
      <Step glyph="📑" caption="Clean v2" />
    </div>
  );
}
