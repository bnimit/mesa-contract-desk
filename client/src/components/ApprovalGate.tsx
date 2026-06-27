import type { ReviewState, RedlineEdit } from "../types.js";

function clauseBefore(review: ReviewState, edit: RedlineEdit): string | null {
  if (edit.type === "insert") return null;
  return review.base.clauses.find((c) => c.id === edit.targetClauseId)?.text ?? null;
}

export function ApprovalGate({
  review, onApprove, onReject, onRollback, onMerge, busy,
}: {
  review: ReviewState;
  onApprove: () => void;
  onReject: () => void;
  onRollback: () => void;
  onMerge: () => void;
  busy: boolean;
}) {
  const total = review.pending.length + review.applied.length + review.rejected.length;
  const done = review.applied.length + review.rejected.length;
  const current = review.pending[0];

  return (
    <div className="border border-line">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div>
          <div className="section-label">Approval gate</div>
          <div className="font-mono text-[10px] text-mute mt-0.5">
            Paused on Mesa · resumes from exact state — close the tab, it's still here
          </div>
        </div>
        <div className="font-mono text-xs text-mute">{done}/{total} reviewed</div>
      </header>

      {current ? (
        <div className="px-6 py-6 reveal">
          <div className="font-mono text-xs text-mesa mb-2">
            {current.type === "replace" ? "REVISE" : current.type.toUpperCase()} · {current.heading ?? current.targetClauseId}
          </div>
          {clauseBefore(review, current) && (
            <div className="diff-deleted px-3 py-2 text-sm text-ink-2 line-through mb-2 font-serif">
              {clauseBefore(review, current)}
            </div>
          )}
          {current.type !== "delete" && (
            <div className="diff-added px-3 py-2 text-sm text-ink mb-3 font-serif">{current.proposedText}</div>
          )}
          <p className="serif-quote text-sm text-mute mb-5">Why: {current.justification}</p>

          <div className="flex gap-3">
            <button onClick={onApprove} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 bg-ink text-canvas hover:bg-up transition-colors disabled:opacity-40">Approve</button>
            <button onClick={onReject} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 border border-line text-ink hover:border-down hover:text-down transition-colors disabled:opacity-40">Reject</button>
            {review.applied.length > 0 && (
              <button onClick={onRollback} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 border border-line text-mute hover:text-ink ml-auto transition-colors disabled:opacity-40">↶ Roll back last</button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-6 py-8 text-center reveal">
          <p className="serif-quote text-lg text-ink-2 mb-1">All clauses reviewed.</p>
          <p className="font-mono text-xs text-mute mb-5">{review.applied.length} approved · {review.rejected.length} rejected</p>
          <button onClick={onMerge} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-6 py-3 bg-mesa text-canvas hover:bg-ink transition-colors disabled:opacity-40">
            Merge approved edits → main
          </button>
        </div>
      )}
    </div>
  );
}
