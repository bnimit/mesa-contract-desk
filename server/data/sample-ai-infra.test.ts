import { describe, it, expect } from "vitest";
import { AI_INFRA, AI_INFRA_CANNED } from "./sample-ai-infra.js";
import { applyEdits, buildDecisions } from "../services/contract-engine.js";

describe("AI infrastructure usage agreement sample", () => {
  it("has clauses with unique ids", () => {
    const ids = AI_INFRA.clauses.map((c) => c.id);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every canned replace/delete edit targets a real clause id", () => {
    const ids = new Set(AI_INFRA.clauses.map((c) => c.id));
    for (const dept of ["legal", "finance", "security"] as const) {
      for (const e of AI_INFRA_CANNED[dept]) {
        if (e.type === "replace" || e.type === "delete") {
          expect(ids.has(e.targetClauseId!), `${dept}/${e.id} -> ${e.targetClauseId}`).toBe(true);
        }
      }
    }
  });

  it("legal and finance both contest the liability clause with different edits", () => {
    const legalLiab = AI_INFRA_CANNED.legal.find((e) => e.targetClauseId === "liability")!;
    const finLiab = AI_INFRA_CANNED.finance.find((e) => e.targetClauseId === "liability")!;
    expect(legalLiab).toBeTruthy();
    expect(finLiab).toBeTruthy();
    expect(legalLiab.proposedText).not.toEqual(finLiab.proposedText);
    const decisions = buildDecisions(AI_INFRA, [
      { department: "legal", edits: AI_INFRA_CANNED.legal },
      { department: "finance", edits: AI_INFRA_CANNED.finance },
      { department: "security", edits: AI_INFRA_CANNED.security },
    ]);
    const liab = decisions.find((d) => d.targetClauseId === "liability")!;
    expect(liab.proposals.map((p) => p.department).sort()).toEqual(["finance", "legal"]);
  });

  it("applying each department's canned edits yields a valid contract", () => {
    for (const dept of ["legal", "finance", "security"] as const) {
      expect(applyEdits(AI_INFRA, AI_INFRA_CANNED[dept]).clauses.length).toBeGreaterThan(0);
    }
  });
});
