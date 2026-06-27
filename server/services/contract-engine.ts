import type { Contract, Clause, RedlineEdit, Department, ClauseProposal, ClauseDecision } from "../../shared/types.js";

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

  return { meta: { ...base.meta, parties: [...base.meta.parties] }, clauses };
}

export function editSummary(edits: RedlineEdit[]): string {
  if (edits.length === 0) return "No changes proposed";
  const revised = edits.filter((e) => e.type === "replace").length;
  const added = edits.filter((e) => e.type === "insert").length;
  const struck = edits.filter((e) => e.type === "delete").length;
  const parts = [`${revised} revised`, `${added} added`, `${struck} struck`];
  return `${edits.length} change${edits.length === 1 ? "" : "s"} · ${parts.join(", ")}`;
}

/**
 * Group competing department edits into ordered per-clause decisions.
 * modify/delete edits group by targetClauseId; each insert is its own decision.
 * Decisions are ordered to match the base document (inserts after their anchor).
 */
export function buildDecisions(
  base: Contract,
  contributions: { department: Department; edits: RedlineEdit[] }[]
): ClauseDecision[] {
  const order = new Map<string, number>();
  base.clauses.forEach((c, i) => order.set(c.id, i));

  // modify/delete grouped by clause
  const byClause = new Map<string, ClauseProposal[]>();
  const inserts: { anchorIdx: number; proposal: ClauseProposal }[] = [];

  for (const { department, edits } of contributions) {
    for (const edit of edits) {
      if (edit.type === "insert") {
        const anchorIdx = edit.afterClauseId != null && order.has(edit.afterClauseId)
          ? order.get(edit.afterClauseId)! : -1;
        inserts.push({ anchorIdx, proposal: { department, edit } });
      } else if (edit.targetClauseId) {
        const list = byClause.get(edit.targetClauseId) ?? [];
        list.push({ department, edit });
        byClause.set(edit.targetClauseId, list);
      }
    }
  }

  const modifyDecisions: { idx: number; decision: ClauseDecision }[] = [];
  for (const [clauseId, proposals] of byClause) {
    const clause = base.clauses.find((c) => c.id === clauseId);
    modifyDecisions.push({
      idx: order.get(clauseId) ?? base.clauses.length,
      decision: {
        id: `dec-${clauseId}`,
        kind: "modify",
        targetClauseId: clauseId,
        heading: clause?.heading ?? proposals[0].edit.heading ?? clauseId,
        originalText: clause?.text ?? null,
        proposals,
        acceptedDepartment: null,
        decided: false,
      },
    });
  }

  const insertDecisions = inserts.map(({ anchorIdx, proposal }) => ({
    idx: anchorIdx + 0.5, // sort right after the anchor clause
    decision: {
      id: `dec-ins-${proposal.department}-${proposal.edit.id}`,
      kind: "insert" as const,
      heading: proposal.edit.heading ?? "New clause",
      originalText: null,
      proposals: [proposal],
      acceptedDepartment: null,
      decided: false,
    },
  }));

  return [...modifyDecisions, ...insertDecisions]
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.decision);
}

/** Derive the ordered edit list to apply from decided decisions. */
export function decisionsToApplied(decisions: ClauseDecision[]): RedlineEdit[] {
  const out: RedlineEdit[] = [];
  for (const d of decisions) {
    if (d.decided && d.acceptedDepartment) {
      const p = d.proposals.find((p) => p.department === d.acceptedDepartment);
      if (p) out.push(p.edit);
    }
  }
  return out;
}
