import { getMesa, reinitializeMesa, type BackendChoice } from "./mesa.js";
import { applyEdits, buildDecisions, decisionsToApplied } from "./contract-engine.js";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";
import { runRedlineAgent } from "../agents/redline.js";
import { getPersona } from "../data/personas.js";
import { emitActivity } from "../routes/events.js";
import type { Contract, Department, ClauseDecision, ReviewState, AuditEvent, RedlineEdit } from "../../shared/types.js";

const MAIN = "main";
const CONTRACT_FILE = "contract.json";
const ACTIVE_FILE = "active-review.json";
const AUDIT_LOG_FILE = "audit-log.json";
const DECISIONS_FILE = "decisions.json";
const AUDIT_WORK_FILE = "audit.json";
const CANNED_FILE = "canned.json"; // canned redlines for the current contract (offline path), or null

type CannedSet = Record<"legal" | "finance" | "security", RedlineEdit[]>;

export const reviewBranch = (id: number) => `review/${id}`;
export const departmentBranch = (id: number, d: Department) => `review/${id}/${d}`;

interface ActivePointer { id: number; status: "merging" | "merged"; departments: Department[]; }

async function readJson<T>(branch: string, path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await getMesa().readFile(branch, path)) as T; } catch { return fallback; }
}
async function writeJson(branch: string, path: string, value: unknown): Promise<void> {
  await getMesa().writeFile(branch, path, JSON.stringify(value, null, 2));
}
/** Write several JSON files to a branch in one shot (single change on the cloud backend). */
async function writeJsonFiles(branch: string, entries: { path: string; value: unknown }[]): Promise<void> {
  await getMesa().writeFiles(branch, entries.map((e) => ({ path: e.path, content: JSON.stringify(e.value, null, 2) })));
}

export async function seedContract(): Promise<void> {
  try { await getMesa().readFile(MAIN, CONTRACT_FILE); }
  catch {
    await writeJsonFiles(MAIN, [
      { path: CONTRACT_FILE, value: SAMPLE_CONTRACT },
      { path: CANNED_FILE, value: CANNED_REDLINES },
    ]);
  }
}
export async function getContract(): Promise<Contract> {
  return readJson<Contract>(MAIN, CONTRACT_FILE, SAMPLE_CONTRACT);
}

/**
 * Point the app at a storage backend and make sure the demo contract is
 * seeded on it. Two robustness guarantees the demo depends on:
 *
 *  1. **Never bricked by the cloud.** If the Mesa backend can't initialize
 *     (invalid/expired key, org resolution, network), we fall back to the
 *     always-working local filesystem backend instead of throwing.
 *  2. **Never empty on a fresh repo.** Switching to a Mesa cloud backend
 *     creates a brand-new empty repo; seeding here writes the contract +
 *     canned redlines so a review isn't empty. `seedContract` is idempotent
 *     (it no-ops when a contract already exists), so re-seeding is safe.
 */
export async function activateBackend(mesaKey?: string, backend?: BackendChoice): Promise<{ backend: string; fellBack: boolean }> {
  let fellBack = false;
  try {
    await reinitializeMesa(mesaKey && mesaKey.length > 0 ? mesaKey : undefined, backend);
  } catch (err) {
    console.error("Mesa backend init failed — falling back to local filesystem:", err);
    await reinitializeMesa(undefined);
    fellBack = true;
  }
  await seedContract();
  return { backend: getMesa().backendName(), fellBack };
}
/** Set the current contract on main, and the canned redlines for the offline path (null for uploads). */
export async function setContract(c: Contract, canned: CannedSet | null = null): Promise<void> {
  await writeJsonFiles(MAIN, [
    { path: CONTRACT_FILE, value: c },
    { path: CANNED_FILE, value: canned },
  ]);
}
export function newAuditEvent(e: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  return { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
}

export async function clearActiveReview(): Promise<void> {
  const ptr = await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null);
  if (ptr) {
    // `departments` may be absent on a stale/old-format pointer — guard against it.
    for (const d of ptr.departments ?? []) await getMesa().deleteBranch(departmentBranch(ptr.id, d));
    if (typeof ptr.id === "number") await getMesa().deleteBranch(reviewBranch(ptr.id));
  }
  await writeJson(MAIN, ACTIVE_FILE, null);
}

/** Fork a branch per department, run agents, build decisions on the working branch. */
export async function startReview(id: number, departments: Department[]): Promise<ReviewState> {
  await clearActiveReview();
  const base = await getContract();
  const canned = await readJson<CannedSet | null>(MAIN, CANNED_FILE, null);

  // Run every department reviewer in parallel — each on its own isolated Mesa
  // branch, the way Mesa is meant to be used. Promise.all preserves the
  // departments[] order, so decisions/proposals stay deterministic.
  const contributions: { department: Department; edits: RedlineEdit[] }[] = await Promise.all(
    departments.map(async (d) => {
      const persona = getPersona(d);
      const branch = departmentBranch(id, d);
      await getMesa().createBranch(branch, MAIN);
      emitActivity("branch_created", `Forked ${branch} for ${persona.label}`, { branch });
      emitActivity("analysis_started", `${persona.label} reviewing contract`, { agent: persona.label, branch });
      const cannedForDept = canned && (d === "legal" || d === "finance" || d === "security") ? canned[d] : undefined;
      const edits = await runRedlineAgent(base, d, cannedForDept);
      await writeJson(branch, "redlines.json", edits);
      emitActivity("agent_complete", `${persona.label}: ${edits.length} edit(s)`, { agent: persona.label, branch });
      return { department: d, edits };
    })
  );

  const decisions = buildDecisions(base, contributions);
  const branch = reviewBranch(id);
  await getMesa().createBranch(branch, MAIN);
  await writeJson(branch, CONTRACT_FILE, base);
  await writeJson(branch, DECISIONS_FILE, decisions);
  const audit: AuditEvent[] = [newAuditEvent({ kind: "proposed", author: "review", justification: `${departments.length} departments proposed ${decisions.length} decisions` })];
  await writeJson(branch, AUDIT_WORK_FILE, audit);
  await writeJson(MAIN, ACTIVE_FILE, { id, status: "merging", departments } satisfies ActivePointer);

  return { id, status: "merging", base, contract: applyEdits(base, []), decisions, departments, audit };
}

async function load(id: number) {
  const branch = reviewBranch(id);
  const base = await readJson<Contract>(branch, CONTRACT_FILE, await getContract());
  const decisions = await readJson<ClauseDecision[]>(branch, DECISIONS_FILE, []);
  const audit = await readJson<AuditEvent[]>(branch, AUDIT_WORK_FILE, []);
  return { branch, base, decisions, audit };
}
async function save(id: number, base: Contract, decisions: ClauseDecision[], audit: AuditEvent[], departments: Department[]): Promise<ReviewState> {
  const branch = reviewBranch(id);
  await writeJsonFiles(branch, [
    { path: DECISIONS_FILE, value: decisions },
    { path: AUDIT_WORK_FILE, value: audit },
  ]);
  return { id, status: "merging", base, contract: applyEdits(base, decisionsToApplied(decisions)), decisions, departments, audit };
}
async function departmentsOf(id: number): Promise<Department[]> {
  return (await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null))?.departments ?? [];
}

export async function acceptEdit(id: number, decisionId: string, department: Department): Promise<ReviewState> {
  const { base, decisions, audit } = await load(id);
  if (!decisions.find((d) => d.id === decisionId)) throw new Error(`Decision ${decisionId} not found`);
  const next = decisions.map((d) => d.id === decisionId ? { ...d, acceptedDepartment: department, decided: true } : d);
  const d = next.find((x) => x.id === decisionId);
  const ev = newAuditEvent({ kind: "approved", editId: decisionId, clauseHeading: d?.heading, author: getPersona(department).label, approver: "you", justification: d?.proposals.find((p) => p.department === department)?.edit.justification });
  emitActivity("file_written", `Accepted ${getPersona(department).label} · ${d?.heading}`, { branch: reviewBranch(id) });
  return save(id, base, next, [...audit, ev], await departmentsOf(id));
}

export async function skipDecision(id: number, decisionId: string): Promise<ReviewState> {
  const { base, decisions, audit } = await load(id);
  if (!decisions.find((d) => d.id === decisionId)) throw new Error(`Decision ${decisionId} not found`);
  const next = decisions.map((d) => d.id === decisionId ? { ...d, acceptedDepartment: null, decided: true } : d);
  const d = next.find((x) => x.id === decisionId);
  const ev = newAuditEvent({ kind: "rejected", editId: decisionId, clauseHeading: d?.heading, author: "human reviewer", approver: "you", justification: "Kept original" });
  emitActivity("file_written", `Kept original · ${d?.heading}`, { branch: reviewBranch(id) });
  return save(id, base, next, [...audit, ev], await departmentsOf(id));
}

export async function getActiveReview(): Promise<ReviewState | null> {
  const ptr = await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null);
  if (!ptr) return null;
  const { base, decisions, audit } = await load(ptr.id);
  return { id: ptr.id, status: "merging", base, contract: applyEdits(base, decisionsToApplied(decisions)), decisions, departments: ptr.departments, audit };
}

export async function getAuditTrail(): Promise<AuditEvent[]> {
  const accumulated = await readJson<AuditEvent[]>(MAIN, AUDIT_LOG_FILE, []);
  const active = await getActiveReview();
  return [...(active?.audit ?? []), ...accumulated].sort((a, b) => b.timestamp - a.timestamp);
}

/** Merge accepted edits into main — only when every decision is decided. */
export async function mergeReview(id: number): Promise<Contract> {
  const { base, decisions, audit } = await load(id);
  if (!decisions.every((d) => d.decided)) throw new Error("All decisions must be decided before merge");
  const applied = decisionsToApplied(decisions);
  const finalContract: Contract = {
    clauses: applyEdits(base, applied).clauses,
    meta: { ...base.meta, version: base.meta.version + 1, lastApproved: new Date().toISOString() },
  };
  await writeJson(MAIN, CONTRACT_FILE, finalContract);
  const accumulated = await readJson<AuditEvent[]>(MAIN, AUDIT_LOG_FILE, []);
  const mergedEvent = newAuditEvent({ kind: "merged", author: "human reviewer", justification: `Merged ${applied.length} accepted edits into v${finalContract.meta.version}` });
  await writeJson(MAIN, AUDIT_LOG_FILE, [...audit, mergedEvent, ...accumulated]);
  emitActivity("branch_merged", `Merged review/${id} → main (v${finalContract.meta.version})`, { branch: reviewBranch(id) });
  const ptr = await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null);
  for (const d of ptr?.departments ?? []) await getMesa().deleteBranch(departmentBranch(id, d));
  await getMesa().deleteBranch(reviewBranch(id));
  await writeJson(MAIN, ACTIVE_FILE, null);
  return finalContract;
}
