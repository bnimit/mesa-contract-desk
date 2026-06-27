import { describe, it, expect } from "vitest";
import { applyEdits, editSummary } from "./contract-engine.js";
import type { Contract, RedlineEdit } from "../../shared/types.js";

const base: Contract = {
  meta: { title: "MSA", parties: ["A", "B"], version: 1, lastApproved: null },
  clauses: [
    { id: "term", heading: "1. Term", text: "One year." },
    { id: "liability", heading: "2. Liability", text: "Unlimited." },
    { id: "law", heading: "3. Governing Law", text: "Delaware." },
  ],
};

describe("applyEdits", () => {
  it("replaces a clause's text and heading by id", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "replace", targetClauseId: "liability", heading: "2. Limitation of Liability", proposedText: "Capped at fees paid.", justification: "cap risk" },
    ];
    const out = applyEdits(base, edits);
    const c = out.clauses.find((x) => x.id === "liability")!;
    expect(c.text).toBe("Capped at fees paid.");
    expect(c.heading).toBe("2. Limitation of Liability");
    expect(base.clauses[1].text).toBe("Unlimited."); // base not mutated
  });

  it("deletes a clause by id", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "delete", targetClauseId: "law", justification: "remove" },
    ];
    const out = applyEdits(base, edits);
    expect(out.clauses.find((x) => x.id === "law")).toBeUndefined();
    expect(out.clauses).toHaveLength(2);
  });

  it("inserts a clause after a given id", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "insert", afterClauseId: "term", heading: "1a. Renewal", proposedText: "Auto-renews.", justification: "add renewal" },
    ];
    const out = applyEdits(base, edits);
    const idx = out.clauses.findIndex((x) => x.heading === "1a. Renewal");
    expect(idx).toBe(1);
    expect(out.clauses[idx].text).toBe("Auto-renews.");
    expect(out.clauses[idx].id).toBeTruthy();
  });

  it("inserts at the front when afterClauseId is null", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "insert", afterClauseId: null, heading: "0. Preamble", proposedText: "Intro.", justification: "preamble" },
    ];
    const out = applyEdits(base, edits);
    expect(out.clauses[0].heading).toBe("0. Preamble");
  });

  it("applies edits in order (base ⊕ applied is deterministic)", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "replace", targetClauseId: "term", proposedText: "Two years.", justification: "extend" },
      { id: "e2", type: "delete", targetClauseId: "term", justification: "actually drop" },
    ];
    const out = applyEdits(base, edits);
    expect(out.clauses.find((x) => x.id === "term")).toBeUndefined();
  });

  it("ignores edits that target a missing clause", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "replace", targetClauseId: "nope", proposedText: "x", justification: "y" },
    ];
    const out = applyEdits(base, edits);
    expect(out.clauses).toHaveLength(3);
  });

  it("does not alias base.meta.parties (deep purity)", () => {
    const out = applyEdits(base, []);
    out.meta.parties.push("C");
    expect(base.meta.parties).toHaveLength(2);
  });
});

describe("editSummary", () => {
  it("summarizes counts by type", () => {
    const edits: RedlineEdit[] = [
      { id: "e1", type: "replace", targetClauseId: "term", proposedText: "x", justification: "" },
      { id: "e2", type: "insert", afterClauseId: "term", heading: "h", proposedText: "y", justification: "" },
      { id: "e3", type: "delete", targetClauseId: "law", justification: "" },
    ];
    expect(editSummary(edits)).toBe("3 changes · 1 revised, 1 added, 1 struck");
  });

  it("handles zero edits", () => {
    expect(editSummary([])).toBe("No changes proposed");
  });
});
