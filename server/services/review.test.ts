import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "fs/promises";
import { resolve } from "path";
import { getMesa } from "./mesa.js";
import { seedContract, getContract, setContract, startReview, getActiveReview, activateBackend } from "./review.js";

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
    expect(c.meta.title).toContain("IT Services Agreement");
  });

  it("setContract persists a modified contract", async () => {
    const c = await getContract();
    const modified = { ...c, meta: { ...c.meta, title: "Modified Agreement" } };
    await setContract(modified);
    const loaded = await getContract();
    expect(loaded.meta.title).toBe("Modified Agreement");
  });

  it("writeFiles writes every file in one call", async () => {
    await getMesa().writeFiles("main", [
      { path: "a.json", content: JSON.stringify({ a: 1 }) },
      { path: "b.json", content: JSON.stringify({ b: 2 }) },
    ]);
    expect(JSON.parse(await getMesa().readFile("main", "a.json"))).toEqual({ a: 1 });
    expect(JSON.parse(await getMesa().readFile("main", "b.json"))).toEqual({ b: 2 });
  });

  it("setContract persists BOTH the contract and its canned redlines", async () => {
    const c = await getContract();
    const canned = { legal: [], finance: [], security: [] };
    await setContract({ ...c, meta: { ...c.meta, title: "Two-file Agreement" } }, canned);
    expect((await getContract()).meta.title).toBe("Two-file Agreement");
    expect(JSON.parse(await getMesa().readFile("main", "canned.json"))).toEqual(canned);
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

describe("activateBackend seeding (fresh-backend safety net)", () => {
  beforeEach(async () => {
    await rm(resolve("mesa-repo"), { recursive: true, force: true });
  });

  it("seeds the contract + canned redlines on a fresh backend so reviews aren't empty", async () => {
    // Simulates switching to a brand-new (empty) repo, e.g. a fresh Mesa cloud
    // account. Without seeding here, a no-key review yields zero decisions.
    const { backend, fellBack } = await activateBackend(undefined);
    expect(backend).toBe("local-fs");
    expect(fellBack).toBe(false);

    const c = await getContract();
    expect(c.meta.title).toContain("IT Services Agreement");

    const state = await startReview(3000, ["legal", "finance", "security"]);
    expect(state.decisions.length).toBeGreaterThan(0); // NOT an empty review
  });

  it("re-seeds when the contract file is missing from the active branch", async () => {
    await activateBackend(undefined);
    // Wipe the seeded state to mimic an unseeded fresh repo, then re-activate.
    await getMesa().deleteFile("main", "contract.json");
    await getMesa().deleteFile("main", "canned.json");

    await activateBackend(undefined);
    const state = await startReview(3001, ["legal", "finance", "security"]);
    expect(state.decisions.length).toBeGreaterThan(0);
  });
});
