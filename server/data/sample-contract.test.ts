import { describe, it, expect } from "vitest";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "./sample-contract.js";
import { applyEdits } from "../services/contract-engine.js";

describe("sample contract", () => {
  it("has at least 7 clauses with unique ids", () => {
    expect(SAMPLE_CONTRACT.clauses.length).toBeGreaterThanOrEqual(7);
    const ids = SAMPLE_CONTRACT.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("canned redlines exist for all three postures", () => {
    expect(CANNED_REDLINES.aggressive.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.balanced.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.minimal.length).toBeGreaterThan(0);
  });

  it("every replace/delete edit targets a real clause id", () => {
    const ids = new Set(SAMPLE_CONTRACT.clauses.map((c) => c.id));
    for (const posture of ["aggressive", "balanced", "minimal"] as const) {
      for (const e of CANNED_REDLINES[posture]) {
        if (e.type === "replace" || e.type === "delete") {
          expect(ids.has(e.targetClauseId!), `${posture}/${e.id} -> ${e.targetClauseId}`).toBe(true);
        }
      }
    }
  });

  it("applying any posture's canned redlines yields a valid contract", () => {
    for (const posture of ["aggressive", "balanced", "minimal"] as const) {
      const out = applyEdits(SAMPLE_CONTRACT, CANNED_REDLINES[posture]);
      expect(out.clauses.length).toBeGreaterThan(0);
    }
  });
});
