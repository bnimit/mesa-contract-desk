import { getMesa } from "./mesa.js";
import { applyEdits, editSummary } from "./contract-engine.js";
import { SAMPLE_CONTRACT } from "../data/sample-contract.js";
import { runRedlineAgent, POSTURES } from "../agents/redline.js";
import { emitActivity } from "../routes/events.js";
import type { Contract, RedlineStrategy, ReviewState, Posture, AuditEvent } from "../../shared/types.js";

const MAIN = "main";
const CONTRACT_FILE = "contract.json";
const ACTIVE_FILE = "active-review.json";
const AUDIT_LOG_FILE = "audit-log.json"; // accumulated, on main

export const reviewBranch = (id: number) => `review/${id}`;
export const postureBranch = (id: number, p: Posture) => `review/${id}/${p}`;
export const snapshotBranch = (id: number) => `snapshot/${id}`;

interface ActivePointer {
  id: number;
  status: "picking" | "gating" | "merged";
  posture: Posture | null;
}

async function readJson<T>(branch: string, path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await getMesa().readFile(branch, path)) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(branch: string, path: string, value: unknown): Promise<void> {
  await getMesa().writeFile(branch, path, JSON.stringify(value, null, 2));
}

export async function seedContract(): Promise<void> {
  try {
    await getMesa().readFile(MAIN, CONTRACT_FILE);
  } catch {
    await writeJson(MAIN, CONTRACT_FILE, SAMPLE_CONTRACT);
  }
}

export async function getContract(): Promise<Contract> {
  return readJson<Contract>(MAIN, CONTRACT_FILE, SAMPLE_CONTRACT);
}

export function newAuditEvent(e: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  return { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
}

/** Fork three posture branches, run agents, persist redlines.json on each. */
export async function startReview(id: number): Promise<RedlineStrategy[]> {
  const base = await getContract();

  // Snapshot main as the rollback baseline.
  await getMesa().createBranch(snapshotBranch(id), MAIN);

  const strategies: RedlineStrategy[] = [];
  for (const cfg of POSTURES) {
    const branch = postureBranch(id, cfg.posture);
    await getMesa().createBranch(branch, MAIN);
    emitActivity("branch_created", `Forked ${branch} for ${cfg.label} redline`, { branch });
    emitActivity("analysis_started", `${cfg.label} attorney reviewing contract`, { agent: cfg.label, branch });
    const edits = await runRedlineAgent(base, cfg.posture);
    await writeJson(branch, "redlines.json", edits);
    emitActivity("agent_complete", `${cfg.label}: ${editSummary(edits)}`, { agent: cfg.label, branch });
    strategies.push({ posture: cfg.posture, branch, edits, summary: editSummary(edits) });
  }

  await writeJson(MAIN, ACTIVE_FILE, { id, status: "picking", posture: null } satisfies ActivePointer);
  return strategies;
}

async function readStrategies(id: number): Promise<RedlineStrategy[]> {
  const out: RedlineStrategy[] = [];
  for (const cfg of POSTURES) {
    const branch = postureBranch(id, cfg.posture);
    const edits = await readJson(branch, "redlines.json", []);
    out.push({ posture: cfg.posture, branch, edits, summary: editSummary(edits) });
  }
  return out;
}

/** Create the working review branch seeded with the chosen edits as pending. */
export async function pickStrategy(id: number, posture: Posture): Promise<ReviewState> {
  const base = await getContract();
  const strategies = await readStrategies(id);
  const chosen = strategies.find((s) => s.posture === posture);
  if (!chosen) throw new Error(`No ${posture} strategy for review ${id}`);

  const branch = reviewBranch(id);
  await getMesa().createBranch(branch, MAIN);
  await writeJson(branch, CONTRACT_FILE, base);
  await writeJson(branch, "pending.json", chosen.edits);
  await writeJson(branch, "applied.json", []);
  await writeJson(branch, "rejected.json", []);
  const audit: AuditEvent[] = [
    newAuditEvent({ kind: "proposed", author: POSTURES.find((p) => p.posture === posture)!.label, justification: `${posture} strategy chosen — ${chosen.edits.length} edits queued` }),
  ];
  await writeJson(branch, "audit.json", audit);

  await writeJson(MAIN, ACTIVE_FILE, { id, status: "gating", posture } satisfies ActivePointer);
  emitActivity("branch_created", `Opened review branch ${branch} (${posture})`, { branch });

  return {
    id, status: "gating", posture, branch,
    base, contract: applyEdits(base, []),
    pending: chosen.edits, applied: [], rejected: [], audit,
  };
}

export async function getActiveReview(): Promise<ReviewState | null> {
  const ptr = await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null);
  if (!ptr) return null;
  const base = await getContract();

  if (ptr.status === "picking") {
    return {
      id: ptr.id, status: "picking", posture: null, branch: null,
      base, contract: base, pending: [], applied: [], rejected: [], audit: [],
      strategies: await readStrategies(ptr.id),
    };
  }

  // gating
  const branch = reviewBranch(ptr.id);
  const snapBase = await readJson<Contract>(branch, CONTRACT_FILE, base);
  const pending = await readJson(branch, "pending.json", []);
  const applied = await readJson(branch, "applied.json", []);
  const rejected = await readJson(branch, "rejected.json", []);
  const audit = await readJson<AuditEvent[]>(branch, "audit.json", []);
  return {
    id: ptr.id, status: "gating", posture: ptr.posture, branch,
    base: snapBase, contract: applyEdits(snapBase, applied),
    pending, applied, rejected, audit,
  };
}
