import { describe, it, expect } from "vitest";
import { runRedlineAgent } from "./redline.js";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";

describe("runRedlineAgent (no key → canned for core, empty for non-core)", () => {
  it("returns canned redlines for each core department", async () => {
    for (const d of ["legal", "finance", "security"] as const) {
      expect(await runRedlineAgent(SAMPLE_CONTRACT, d)).toEqual(CANNED_REDLINES[d]);
    }
  });
  it("returns [] for a non-core department with no key", async () => {
    expect(await runRedlineAgent(SAMPLE_CONTRACT, "commercial")).toEqual([]);
  });
  it("legal and finance both propose a (different) liability edit", () => {
    const legalLiab = CANNED_REDLINES.legal.find((e) => e.targetClauseId === "liability")!;
    const finLiab = CANNED_REDLINES.finance.find((e) => e.targetClauseId === "liability")!;
    expect(legalLiab.proposedText).not.toEqual(finLiab.proposedText);
  });
});
