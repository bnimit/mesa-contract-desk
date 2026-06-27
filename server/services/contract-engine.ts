import type { Contract, Clause, RedlineEdit } from "../../shared/types.js";

/**
 * Pure, deterministic. Applies an ordered list of clause edits to a base
 * contract and returns a new Contract. Never mutates `base`. Edits that
 * reference a missing clause are skipped (defensive — agents occasionally
 * hallucinate ids).
 */
export function applyEdits(base: Contract, edits: RedlineEdit[]): Contract {
  let clauses: Clause[] = base.clauses.map((c) => ({ ...c }));

  for (const edit of edits) {
    if (edit.type === "replace") {
      clauses = clauses.map((c) =>
        c.id === edit.targetClauseId
          ? { ...c, text: edit.proposedText ?? c.text, heading: edit.heading ?? c.heading }
          : c
      );
    } else if (edit.type === "delete") {
      clauses = clauses.filter((c) => c.id !== edit.targetClauseId);
    } else if (edit.type === "insert") {
      const newClause: Clause = {
        id: `ins-${edit.id}`,
        heading: edit.heading ?? "New clause",
        text: edit.proposedText ?? "",
      };
      if (edit.afterClauseId == null) {
        clauses = [newClause, ...clauses];
      } else {
        const idx = clauses.findIndex((c) => c.id === edit.afterClauseId);
        if (idx === -1) {
          clauses = [...clauses, newClause];
        } else {
          clauses = [...clauses.slice(0, idx + 1), newClause, ...clauses.slice(idx + 1)];
        }
      }
    }
  }

  return { meta: { ...base.meta }, clauses };
}

export function editSummary(edits: RedlineEdit[]): string {
  if (edits.length === 0) return "No changes proposed";
  const revised = edits.filter((e) => e.type === "replace").length;
  const added = edits.filter((e) => e.type === "insert").length;
  const struck = edits.filter((e) => e.type === "delete").length;
  const parts = [`${revised} revised`, `${added} added`, `${struck} struck`];
  return `${edits.length} change${edits.length === 1 ? "" : "s"} · ${parts.join(", ")}`;
}
