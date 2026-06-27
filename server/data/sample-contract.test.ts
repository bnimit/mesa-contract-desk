import { describe, it, expect } from "vitest";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "./sample-contract.js";
import { applyEdits } from "../services/contract-engine.js";

describe("sample contract", () => {
  it("has at least 7 clauses with unique ids", () => {
    expect(SAMPLE_CONTRACT.clauses.length).toBeGreaterThanOrEqual(7);
    const ids = SAMPLE_CONTRACT.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("canned redlines exist for all three core departments", () => {
    expect(CANNED_REDLINES.legal.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.finance.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.security.length).toBeGreaterThan(0);
  });

  it("every replace/delete edit targets a real clause id", () => {
    const ids = new Set(SAMPLE_CONTRACT.clauses.map((c) => c.id));
    for (const dept of ["legal", "finance", "security"] as const) {
      for (const e of CANNED_REDLINES[dept]) {
        if (e.type === "replace" || e.type === "delete") {
          expect(ids.has(e.targetClauseId!), `${dept}/${e.id} -> ${e.targetClauseId}`).toBe(true);
        }
      }
    }
  });

  it("applying any department's canned redlines yields a valid contract", () => {
    for (const dept of ["legal", "finance", "security"] as const) {
      const out = applyEdits(SAMPLE_CONTRACT, CANNED_REDLINES[dept]);
      expect(out.clauses.length).toBeGreaterThan(0);
    }
  });
});
