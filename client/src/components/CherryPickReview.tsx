import { useState } from "react";
import type { ReviewState, ClauseDecision, Department, Persona } from "../types.js";

function colorOf(personas: Persona[], d: Department) { return personas.find((p) => p.id === d)?.color ?? "#6b827a"; }
function labelOf(personas: Persona[], d: Department) { return personas.find((p) => p.id === d)?.label ?? d; }

export function CherryPickReview({ review, personas, onAccept, onSkip, onMerge, busy }: {
  review: ReviewState; personas: Persona[];
  onAccept: (decisionId: string, d: Department) => void;
  onSkip: (decisionId: string) => void;
  onMerge: () => void; busy: boolean;
}) {
  const decisions = review.decisions;
  const total = decisions.length;
  const done = decisions.filter((d) => d.decided).length;
  const firstUndecided = decisions.find((d) => !d.decided)?.id ?? decisions[0]?.id;
  const [focusId, setFocusId] = useState<string | undefined>(firstUndecided);
  const focus = decisions.find((d) => d.id === focusId) ?? decisions[0];

  const statusChip = (d: ClauseDecision) => {
    if (d.decided && d.acceptedDepartment) return <span className="pill" style={{ background: colorOf(personas, d.acceptedDepartment) + "22", color: colorOf(personas, d.acceptedDepartment) }}>✓ {labelOf(personas, d.acceptedDepartment)}</span>;
    if (d.decided) return <span className="pill pill-warn">kept original</span>;
    if (d.proposals.length > 1) return <span className="pill pill-bad">contested · {d.proposals.length}</span>;
    return <span className="pill" style={{ background: colorOf(personas, d.proposals[0].department) + "22", color: colorOf(personas, d.proposals[0].department) }}>{labelOf(personas, d.proposals[0].department)}</span>;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: document overview */}
      <div className="card p-5 max-h-[560px] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">{review.contract.meta.title}</div>
          <span className="font-mono text-xs text-mute">{done}/{total} decided</span>
        </div>
        <div className="h-1.5 bg-line/60 rounded-full overflow-hidden mb-4"><div className="h-full bg-mesa transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <div className="divide-y divide-line/60">
          {review.contract.clauses.map((c) => {
            const d = decisions.find((x) => x.kind === "modify" && x.targetClauseId === c.id);
            return (
              <button key={c.id} onClick={() => d && setFocusId(d.id)} className={`w-full text-left py-3 ${d ? "hover:bg-ink/[0.02]" : ""} ${focusId === d?.id ? "bg-ink/[0.03]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-ink">{c.heading}</span>
                  {d ? statusChip(d) : <span className="pill" style={{ color: "#9fb3aa" }}>unchanged</span>}
                </div>
              </button>
            );
          })}
          {decisions.filter((d) => d.kind === "insert").map((d) => (
            <button key={d.id} onClick={() => setFocusId(d.id)} className={`w-full text-left py-3 ${focusId === d.id ? "bg-ink/[0.03]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-up">+ {d.heading}</span>
                {statusChip(d)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: decision panel */}
      <div className="card p-5">
        {focus ? (
          <>
            <div className="font-mono text-xs text-mesa mb-1">{focus.kind === "insert" ? "PROPOSED NEW CLAUSE" : "REVISE"} · {focus.heading}</div>
            {focus.originalText && (
              <div className="diff-deleted text-down rounded-md px-3 py-2 text-sm mb-3 line-through">{focus.originalText}</div>
            )}
            <div className="space-y-3">
              {focus.proposals.map((p) => (
                <div key={p.department} className="border rounded-lg p-3" style={{ borderColor: colorOf(personas, p.department) + "55" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px]" style={{ color: colorOf(personas, p.department) }}>{labelOf(personas, p.department)}</span>
                    <button onClick={() => onAccept(focus.id, p.department)} disabled={busy}
                      className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: colorOf(personas, p.department) }}>
                      {focus.acceptedDepartment === p.department ? "✓ Accepted" : "Accept"}
                    </button>
                  </div>
                  <div className="diff-added text-up rounded-md px-3 py-2 text-sm">{p.edit.proposedText}</div>
                  <div className="text-xs text-mute italic mt-1">{p.edit.justification}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => onSkip(focus.id)} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-lg border border-line hover:border-ink transition-colors disabled:opacity-40">
                {focus.decided && !focus.acceptedDepartment ? "✓ Kept original" : "Keep original"}
              </button>
            </div>
          </>
        ) : <p className="serif-quote text-mute">No decisions.</p>}

        <div className="mt-6 pt-4 border-t border-line">
          <button onClick={onMerge} disabled={busy || done < total} className="w-full font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-xl bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {done < total ? `Decide all clauses to merge (${done}/${total})` : "Merge to main → v" + (review.contract.meta.version + 1)}
          </button>
        </div>
      </div>
    </div>
  );
}
