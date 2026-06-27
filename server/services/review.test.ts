import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "fs/promises";
import { resolve } from "path";
import { getMesa } from "./mesa.js";
import { seedContract, getContract, setContract, startReview, getActiveReview } from "./review.js";

async function resetRepo() {
  await rm(resolve("mesa-repo"), { recursive: true, force: true });
  await getMesa().init();
  await seedContract();
}

describe("review start & active (local-fs)", () => {
  beforeEach(resetRepo);

  it("seeds the contract on main", async () => {
    const c = await getContract();
    expect(c.clauses.length).toBeGreaterThanOrEqual(7);
    expect(c.meta.title).toContain("Master Services Agreement");
  });

  it("setContract persists a modified contract", async () => {
    const c = await getContract();
    const modified = { ...c, meta: { ...c.meta, title: "Modified Agreement" } };
    await setContract(modified);
    const loaded = await getContract();
    expect(loaded.meta.title).toBe("Modified Agreement");
  });

  it("startReview returns status merging with decisions", async () => {
    const state = await startReview(1000, ["legal", "finance", "security"]);
    expect(state.status).toBe("merging");
    expect(state.decisions.length).toBeGreaterThan(0);
    expect(state.departments).toEqual(["legal", "finance", "security"]);
  });

  it("getActiveReview rehydrates after startReview", async () => {
    await startReview(2000, ["legal", "finance", "security"]);
    const active = await getActiveReview();
    expect(active).not.toBeNull();
    expect(active!.id).toBe(2000);
    expect(active!.status).toBe("merging");
    expect(active!.decisions.length).toBeGreaterThan(0);
  });
});
