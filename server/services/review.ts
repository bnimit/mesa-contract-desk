import { getMesa } from "./mesa.js";
import { applyEdits, editSummary } from "./contract-engine.js";
import { SAMPLE_CONTRACT } from "../data/sample-contract.js";
import { runRedlineAgent, POSTURES } from "../agents/redline.js";
import { emitActivity } from "../routes/events.js";
import type { Contract, RedlineEdit, RedlineStrategy, ReviewState, Posture, AuditEvent } from "../../shared/types.js";

const MAIN = "main";
const CONTRACT_FILE = "contract.json";
const ACTIVE_FILE = "active-review.json";
const AUDIT_LOG_FILE = "audit-log.json"; // accumulated, on main
const AUDIT_WORK_FILE = "audit.json"; // per-review working audit, on the review branch

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
  const fallbackBase = await getContract();

  if (ptr.status === "picking") {
    return {
      id: ptr.id, status: "picking", posture: null, branch: null,
      base: fallbackBase, contract: fallbackBase, pending: [], applied: [], rejected: [], audit: [],
      strategies: await readStrategies(ptr.id),
    };
  }

  // gating
  const branch = reviewBranch(ptr.id);
  const base = await readJson<Contract>(branch, CONTRACT_FILE, fallbackBase);
  const pending = await readJson(branch, "pending.json", []);
  const applied = await readJson(branch, "applied.json", []);
  const rejected = await readJson(branch, "rejected.json", []);
  const audit = await readJson<AuditEvent[]>(branch, AUDIT_WORK_FILE, []);
  return {
    id: ptr.id, status: "gating", posture: ptr.posture, branch,
    base, contract: applyEdits(base, applied),
    pending, applied, rejected, audit,
  };
}

// ── Task 5: Approval Gate Operations ─────────────────────────────────────────

async function loadGate(id: number) {
  const branch = reviewBranch(id);
  const base = await readJson<Contract>(branch, CONTRACT_FILE, await getContract());
  const pending = await readJson<RedlineEdit[]>(branch, "pending.json", []);
  const applied = await readJson<RedlineEdit[]>(branch, "applied.json", []);
  const rejected = await readJson<RedlineEdit[]>(branch, "rejected.json", []);
  const audit = await readJson<AuditEvent[]>(branch, AUDIT_WORK_FILE, []);
  return { branch, base, pending, applied, rejected, audit };
}

async function saveGate(
  branch: string,
  base: Contract,
  pending: RedlineEdit[],
  applied: RedlineEdit[],
  rejected: RedlineEdit[],
  audit: AuditEvent[]
): Promise<ReviewState> {
  const contract = applyEdits(base, applied);
  await writeJson(branch, CONTRACT_FILE, base);
  await writeJson(branch, "pending.json", pending);
  await writeJson(branch, "applied.json", applied);
  await writeJson(branch, "rejected.json", rejected);
  await writeJson(branch, AUDIT_WORK_FILE, audit);
  const id = Number(branch.split("/")[1]);
  const posture = (await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null))?.posture ?? null;
  return { id, status: "gating", posture, branch, base, contract, pending, applied, rejected, audit };
}

function authorFor(posture: Posture | null): string {
  return POSTURES.find((p) => p.posture === posture)?.label ?? "agent";
}

export async function approveNext(id: number, approver: string): Promise<ReviewState> {
  const g = await loadGate(id);
  if (g.pending.length === 0) return saveGate(g.branch, g.base, g.pending, g.applied, g.rejected, g.audit);
  const [edit, ...rest] = g.pending;
  const applied = [...g.applied, edit];
  const posture = (await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null))?.posture ?? null;
  const audit = [...g.audit, newAuditEvent({ kind: "approved", editId: edit.id, clauseHeading: edit.heading, author: authorFor(posture), approver, justification: edit.justification })];
  emitActivity("file_written", `Approved: ${edit.heading ?? edit.targetClauseId}`, { branch: g.branch });
  return saveGate(g.branch, g.base, rest, applied, g.rejected, audit);
}

export async function rejectNext(id: number, approver: string): Promise<ReviewState> {
  const g = await loadGate(id);
  if (g.pending.length === 0) return saveGate(g.branch, g.base, g.pending, g.applied, g.rejected, g.audit);
  const [edit, ...rest] = g.pending;
  const rejected = [...g.rejected, edit];
  const posture = (await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null))?.posture ?? null;
  const audit = [...g.audit, newAuditEvent({ kind: "rejected", editId: edit.id, clauseHeading: edit.heading, author: authorFor(posture), approver, justification: edit.justification })];
  emitActivity("file_written", `Rejected: ${edit.heading ?? edit.targetClauseId}`, { branch: g.branch });
  return saveGate(g.branch, g.base, rest, g.applied, rejected, audit);
}

export async function rollbackLast(id: number, approver: string): Promise<ReviewState> {
  const g = await loadGate(id);
  if (g.applied.length === 0) return saveGate(g.branch, g.base, g.pending, g.applied, g.rejected, g.audit);
  const applied = g.applied.slice(0, -1);
  const undone = g.applied[g.applied.length - 1];
  const audit = [...g.audit, newAuditEvent({ kind: "rolled_back", editId: undone.id, clauseHeading: undone.heading, author: "human reviewer", approver, justification: `Rolled back: ${undone.heading ?? undone.targetClauseId}` })];
  emitActivity("file_written", `Rolled back: ${undone.heading ?? undone.targetClauseId}`, { branch: g.branch });
  return saveGate(g.branch, g.base, g.pending, applied, g.rejected, audit);
}

export async function getAuditTrail(): Promise<AuditEvent[]> {
  const accumulated = await readJson<AuditEvent[]>(MAIN, AUDIT_LOG_FILE, []);
  const active = await getActiveReview();
  const current = active?.status === "gating" ? active.audit : [];
  return [...current, ...accumulated].sort((a, b) => b.timestamp - a.timestamp);
}

/** Merge approved edits into main; strip working files; clean up branches. */
export async function mergeReview(id: number): Promise<Contract> {
  const g = await loadGate(id);
  const finalContract = applyEdits(g.base, g.applied);
  finalContract.meta = {
    ...finalContract.meta,
    version: g.base.meta.version + 1,
    lastApproved: new Date().toISOString(),
  };

  // Write the approved contract straight onto main (working files never leave the review branch).
  await writeJson(MAIN, CONTRACT_FILE, finalContract);

  // Accumulate audit onto main's permanent log.
  const accumulated = await readJson<AuditEvent[]>(MAIN, AUDIT_LOG_FILE, []);
  const mergedEvent = newAuditEvent({ kind: "merged", author: "human reviewer", justification: `Merged ${g.applied.length} approved edits into v${finalContract.meta.version}` });
  await writeJson(MAIN, AUDIT_LOG_FILE, [...g.audit, mergedEvent, ...accumulated]);

  emitActivity("branch_merged", `Merged review/${id} → main (v${finalContract.meta.version})`, { branch: reviewBranch(id) });

  // Clean up branches and the active pointer.
  for (const cfg of POSTURES) await getMesa().deleteBranch(postureBranch(id, cfg.posture));
  await getMesa().deleteBranch(reviewBranch(id));
  await getMesa().writeFile(MAIN, ACTIVE_FILE, JSON.stringify(null));

  return finalContract;
}
