import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "fs/promises";
import { resolve } from "path";
import { getMesa } from "./mesa.js";
import { seedContract, getContract, startReview, pickStrategy, getActiveReview } from "./review.js";

async function resetRepo() {
  await rm(resolve("mesa-repo"), { recursive: true, force: true });
  await getMesa().init();
  await seedContract();
}

describe("review start & pick (local-fs)", () => {
  beforeEach(resetRepo);

  it("seeds the contract on main", async () => {
    const c = await getContract();
    expect(c.clauses.length).toBeGreaterThanOrEqual(7);
    expect(c.meta.title).toContain("Master Services Agreement");
  });

  it("startReview returns three strategies with edits", async () => {
    const strategies = await startReview(1000);
    expect(strategies.map((s) => s.posture).sort()).toEqual(["aggressive", "balanced", "minimal"]);
    for (const s of strategies) {
      expect(s.edits.length).toBeGreaterThan(0);
      expect(s.summary).toMatch(/change/i);
    }
  });

  it("pickStrategy seeds a review branch with pending = chosen edits, applied = []", async () => {
    const strategies = await startReview(2000);
    const chosen = strategies.find((s) => s.posture === "balanced")!;
    const state = await pickStrategy(2000, "balanced");
    expect(state.status).toBe("gating");
    expect(state.posture).toBe("balanced");
    expect(state.pending).toEqual(chosen.edits);
    expect(state.applied).toEqual([]);
    // base ⊕ applied with empty applied === base
    expect(state.contract.clauses.length).toBe(state.base.clauses.length);
  });

  it("getActiveReview rehydrates after pick", async () => {
    await startReview(3000);
    await pickStrategy(3000, "aggressive");
    const active = await getActiveReview();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(3000);
    expect(active!.status).toBe("gating");
    expect(active!.posture).toBe("aggressive");
  });

  it("getActiveReview returns picking state before a pick", async () => {
    await startReview(4000);
    const active = await getActiveReview();
    expect(active!.status).toBe("picking");
    expect(active!.strategies).toHaveLength(3);
  });
});
