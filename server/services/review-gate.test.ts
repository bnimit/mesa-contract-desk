import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "fs/promises";
import { resolve } from "path";
import { getMesa } from "./mesa.js";
import {
  seedContract, getContract, startReview, pickStrategy,
  approveNext, rejectNext, rollbackLast, mergeReview, getActiveReview, getAuditTrail,
} from "./review.js";

async function resetRepo() {
  await rm(resolve("mesa-repo"), { recursive: true, force: true });
  await getMesa().init();
  await seedContract();
}

async function setupGate(id: number) {
  await startReview(id);
  return pickStrategy(id, "minimal"); // minimal = 2 edits
}

describe("approval gate (local-fs)", () => {
  beforeEach(resetRepo);

  it("approve applies the next edit and pops the queue", async () => {
    const before = await setupGate(1000);
    const pendingCount = before.pending.length;
    const after = await approveNext(1000, "you");
    expect(after.applied).toHaveLength(1);
    expect(after.pending).toHaveLength(pendingCount - 1);
    expect(after.audit.some((a) => a.kind === "approved")).toBe(true);
  });

  it("reject pops the queue without applying", async () => {
    await setupGate(1100);
    const after = await rejectNext(1100, "you");
    expect(after.applied).toHaveLength(0);
    expect(after.rejected).toHaveLength(1);
    expect(after.audit.some((a) => a.kind === "rejected")).toBe(true);
  });

  it("approving all then merging updates main and strips working files", async () => {
    const start = await setupGate(1200);
    for (let i = 0; i < start.pending.length; i++) await approveNext(1200, "you");
    const active = await getActiveReview();
    expect(active!.pending).toHaveLength(0);

    const merged = await mergeReview(1200);
    expect(merged.meta.version).toBe(2);
    expect(merged.meta.lastApproved).not.toBeNull();

    // main has the new contract, no working files
    const mainFiles = await getMesa().listFiles("main", "");
    expect(mainFiles).not.toContain("pending.json");
    expect(mainFiles).not.toContain("applied.json");

    // active review cleared
    expect(await getActiveReview()).toBeNull();
  });

  it("rollback removes the last applied edit and recomputes", async () => {
    const start = await setupGate(1300);
    await approveNext(1300, "you");
    await approveNext(1300, "you");
    const twoApplied = await getActiveReview();
    expect(twoApplied!.applied).toHaveLength(2);

    const after = await rollbackLast(1300, "you");
    expect(after.applied).toHaveLength(1);
    expect(after.audit.some((a) => a.kind === "rolled_back")).toBe(true);
  });

  it("audit trail accumulates across a merged review", async () => {
    const start = await setupGate(1400);
    for (let i = 0; i < start.pending.length; i++) await approveNext(1400, "you");
    await mergeReview(1400);
    const trail = await getAuditTrail();
    expect(trail.some((a) => a.kind === "merged")).toBe(true);
    expect(trail.some((a) => a.kind === "approved")).toBe(true);
  });
});
