import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "fs/promises";
import { resolve } from "path";
import { getMesa } from "./mesa.js";
import { seedContract, startReview, acceptEdit, skipDecision, mergeReview, getActiveReview } from "./review.js";

async function reset() { await rm(resolve("mesa-repo"), { recursive: true, force: true }); await getMesa().init(); await seedContract(); }

describe("cherry-pick gate (local-fs)", () => {
  beforeEach(reset);
  it("liability decision has two proposals (legal + finance)", async () => {
    const s = await startReview(1000, ["legal", "finance", "security"]);
    const liab = s.decisions.find((d) => d.targetClauseId === "liability")!;
    expect(liab.proposals.map((p) => p.department).sort()).toEqual(["finance", "legal"]);
  });
  it("accept picks a department's edit; contract reflects it", async () => {
    await startReview(1100, ["legal", "finance", "security"]);
    const s = await acceptEdit(1100, "dec-liability", "finance");
    const liab = s.decisions.find((d) => d.id === "dec-liability")!;
    expect(liab.acceptedDepartment).toBe("finance");
    expect(s.contract.clauses.find((c) => c.id === "liability")!.text).toContain("three (3) months");
  });
  it("merge is blocked until every decision is decided, then applies accepted edits", async () => {
    const s = await startReview(1200, ["legal", "finance", "security"]);
    await expect(mergeReview(1200)).rejects.toThrow(/decided/);
    for (const d of s.decisions) {
      if (d.id === "dec-liability") await acceptEdit(1200, d.id, "legal");
      else await acceptEdit(1200, d.id, d.proposals[0].department);
    }
    const merged = await mergeReview(1200);
    expect(merged.meta.version).toBe(2);
    expect(await getActiveReview()).toBeNull();
  });
  it("skip keeps original; getActiveReview rehydrates decisions", async () => {
    await startReview(1300, ["legal", "finance", "security"]);
    await skipDecision(1300, "dec-liability");
    const active = await getActiveReview();
    const liab = active!.decisions.find((d) => d.id === "dec-liability")!;
    expect(liab.decided).toBe(true);
    expect(liab.acceptedDepartment).toBeNull();
  });
});
