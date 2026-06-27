# Contract Review Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the contract-redline demo into a product-shaped platform: upload (or pick a sample) → choose 2–4 department reviewers → run them in parallel on Mesa → cherry-pick the best edit per clause → merge into a clean v2, with a department audit trail.

**Architecture:** Three stages on the existing stack. **A** replaces the pick-one + single-queue gate with a durable, `decisions.json`-sourced cherry-pick model (`buildDecisions` pure fn; per-clause accept/skip; merge derived from decisions). **B** generalizes runs + the branch animation from a fixed three to a 2–4 persona roster. **C** adds real upload (PDF/DOCX/TXT) + LLM clause segmentation + a sample library. Frontend follows: an `IntakePanel` (upload/sample + persona selection) and a `CherryPickReview` (hybrid document + decision panel).

**Tech Stack:** TypeScript ESM (NodeNext), Express 5, React 19 + Vite + Tailwind v4, `@mesadev/sdk`, `@anthropic-ai/sdk`, Vitest, plus `pdf-parse` + `mammoth` + `multer` (added in Stage C).

## Global Constraints

- TypeScript, ESM, NodeNext — all relative imports use `.js` extensions even for `.ts` files.
- **Backend-agnostic durability:** all workflow state lives in Mesa files via `getMesa()`; never depend on Mesa history APIs. The working contract is always `applyEdits(base, applied)` where `applied` is derived from `decisions`.
- **`Department = "legal" | "finance" | "security" | "commercial" | "privacy"`** (renames the old `Posture` and its values everywhere).
- **Offline path:** the default SaaS MSA reviewed by a subset of the three *core* personas (legal/finance/security) runs with no Anthropic key via canned redlines; every other path (other personas, other samples, uploads) requires a key. Canned redlines exist only for the default MSA's clauses.
- **Ownership is domain-driven (prompt-scoped)**, not a fixed clause list — generalizes to uploaded contracts. The shared/contested clause in the canned MSA set is **Liability** (both legal & finance propose a *different* edit).
- **Decisions:** document order; `decisions.json` is the single source of truth; merge is enabled only when **every** decision is `decided`; audit is immutable/append-only (re-decide appends an event; contract reflects the latest accepted edit).
- **Animation:** `BranchVisualization` supports 2–4 branches and a multi-branch **merge-all** mode (never the single-winner or "Discarding…" dismiss path).
- **Upload limits:** accept `.pdf`/`.docx`/`.txt`, ≤ 2 MB; require ≥ ~200 chars extracted; clear error otherwise.
- **Testing:** Vitest for backend/pure logic (TDD). No UI test runner (do not add React Testing Library) — UI verified by `npm run build` (zero TS errors) + manual smoke. Run a single suite with `npm test -- <name>`; full suite `npm test`.
- Commit at the end of every task.
- Spec: `docs/superpowers/specs/2026-06-27-contract-review-platform-design.md`.

---

### Task A1: Types + `buildDecisions` pure engine

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/services/contract-engine.ts`
- Test: `server/services/contract-engine.test.ts` (append)

**Interfaces:**
- Produces: `Department`, `Persona`, `ClauseProposal`, `ClauseDecision`; updated `ReviewState`; `buildDecisions(base, contributions): ClauseDecision[]` and `decisionsToApplied(decisions): RedlineEdit[]`.

- [ ] **Step 1: Add/replace types in `shared/types.ts`**

Replace the `Posture` type and the `ReviewState`/`RedlineStrategy` interfaces (the redline block) with:
```ts
export type Department = "legal" | "finance" | "security" | "commercial" | "privacy";

export interface Persona {
  id: Department;
  label: string;
  domain: string;        // what this reviewer redlines (used in the agent prompt + UI)
  color: string;         // hex, for cards / branches / audit
  cannedAvailable: boolean;
}

export interface ClauseProposal {
  department: Department;
  edit: RedlineEdit;
}

export interface ClauseDecision {
  id: string;                          // stable: "dec-{clauseId}" or "dec-ins-{department}-{editId}"
  kind: "modify" | "insert";
  targetClauseId?: string;
  heading: string;
  originalText: string | null;         // null for insert
  proposals: ClauseProposal[];
  acceptedDepartment: Department | null;
  decided: boolean;
}

export interface ReviewState {
  id: number;
  status: "merging" | "merged";
  base: Contract;
  contract: Contract;                  // base ⊕ accepted
  decisions: ClauseDecision[];
  departments: Department[];           // who reviewed
  audit: AuditEvent[];
}
```
Keep `Clause`, `ContractMeta`, `Contract`, `RedlineEdit`, `AuditEvent`. Delete `Posture`, `RedlineStrategy`, and the old `ReviewState` fields (`posture`/`pending`/`applied`/`rejected`/`strategies`). Update `AuditEvent` if needed — it already has `kind: "proposed" | "approved" | "rejected" | "rolled_back" | "merged"`; keep those (we reuse `approved`/`rejected`/`merged`).

- [ ] **Step 2: Write the failing test (append to `contract-engine.test.ts`)**

```ts
import { buildDecisions, decisionsToApplied } from "./contract-engine.js";
import type { Contract, Department, RedlineEdit } from "../../shared/types.js";

const base2: Contract = {
  meta: { title: "MSA", parties: ["A", "B"], version: 1, lastApproved: null },
  clauses: [
    { id: "fees", heading: "1. Fees", text: "Net 30." },
    { id: "liability", heading: "2. Liability", text: "Unlimited." },
    { id: "data", heading: "3. Data", text: "Vendor owns data." },
  ],
};
const contribs = [
  { department: "legal" as Department, edits: [
    { id: "l1", type: "replace", targetClauseId: "liability", heading: "2. Liability", proposedText: "Capped, with carve-outs.", justification: "legal cap" } as RedlineEdit ] },
  { department: "finance" as Department, edits: [
    { id: "f1", type: "replace", targetClauseId: "fees", proposedText: "Net 45.", justification: "cashflow" } as RedlineEdit,
    { id: "f2", type: "replace", targetClauseId: "liability", proposedText: "Capped at fees paid.", justification: "finance cap" } as RedlineEdit ] },
  { department: "security" as Department, edits: [
    { id: "s1", type: "replace", targetClauseId: "data", proposedText: "Customer owns data.", justification: "data" } as RedlineEdit,
    { id: "s2", type: "insert", afterClauseId: "data", heading: "3a. Breach Notice", proposedText: "72h notice.", justification: "breach" } as RedlineEdit ] },
];

describe("buildDecisions", () => {
  it("groups modify edits by clause; liability has 2 proposals, others 1", () => {
    const ds = buildDecisions(base2, contribs);
    const liab = ds.find((d) => d.targetClauseId === "liability")!;
    expect(liab.proposals.map((p) => p.department).sort()).toEqual(["finance", "legal"]);
    expect(ds.find((d) => d.targetClauseId === "fees")!.proposals).toHaveLength(1);
  });
  it("returns decisions in document order with inserts after their anchor", () => {
    const ds = buildDecisions(base2, contribs);
    expect(ds.map((d) => d.id)).toEqual(["dec-fees", "dec-liability", "dec-data", "dec-ins-security-s2"]);
  });
  it("inserts become their own undecided decision", () => {
    const ds = buildDecisions(base2, contribs);
    const ins = ds.find((d) => d.kind === "insert")!;
    expect(ins.originalText).toBeNull();
    expect(ins.decided).toBe(false);
  });
  it("decisionsToApplied picks the accepted department's edit, in document order", () => {
    const ds = buildDecisions(base2, contribs).map((d) =>
      d.targetClauseId === "liability" ? { ...d, decided: true, acceptedDepartment: "finance" as Department }
      : d.targetClauseId === "fees" ? { ...d, decided: true, acceptedDepartment: "finance" as Department }
      : { ...d, decided: true, acceptedDepartment: null });
    const applied = decisionsToApplied(ds);
    expect(applied.map((e) => e.id)).toEqual(["f1", "f2"]);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test -- contract-engine`
Expected: FAIL — `buildDecisions`/`decisionsToApplied` not exported.

- [ ] **Step 4: Implement in `contract-engine.ts`**

Append:
```ts
import type { Contract, Department, RedlineEdit, ClauseProposal, ClauseDecision } from "../../shared/types.js";

/**
 * Group competing department edits into ordered per-clause decisions.
 * modify/delete edits group by targetClauseId; each insert is its own decision.
 * Decisions are ordered to match the base document (inserts after their anchor).
 */
export function buildDecisions(
  base: Contract,
  contributions: { department: Department; edits: RedlineEdit[] }[]
): ClauseDecision[] {
  const order = new Map<string, number>();
  base.clauses.forEach((c, i) => order.set(c.id, i));

  // modify/delete grouped by clause
  const byClause = new Map<string, ClauseProposal[]>();
  const inserts: { anchorIdx: number; proposal: ClauseProposal }[] = [];

  for (const { department, edits } of contributions) {
    for (const edit of edits) {
      if (edit.type === "insert") {
        const anchorIdx = edit.afterClauseId != null && order.has(edit.afterClauseId)
          ? order.get(edit.afterClauseId)! : -1;
        inserts.push({ anchorIdx, proposal: { department, edit } });
      } else if (edit.targetClauseId) {
        const list = byClause.get(edit.targetClauseId) ?? [];
        list.push({ department, edit });
        byClause.set(edit.targetClauseId, list);
      }
    }
  }

  const modifyDecisions: { idx: number; decision: ClauseDecision }[] = [];
  for (const [clauseId, proposals] of byClause) {
    const clause = base.clauses.find((c) => c.id === clauseId);
    modifyDecisions.push({
      idx: order.get(clauseId) ?? base.clauses.length,
      decision: {
        id: `dec-${clauseId}`,
        kind: "modify",
        targetClauseId: clauseId,
        heading: clause?.heading ?? proposals[0].edit.heading ?? clauseId,
        originalText: clause?.text ?? null,
        proposals,
        acceptedDepartment: null,
        decided: false,
      },
    });
  }

  const insertDecisions = inserts.map(({ anchorIdx, proposal }) => ({
    idx: anchorIdx + 0.5, // sort right after the anchor clause
    decision: {
      id: `dec-ins-${proposal.department}-${proposal.edit.id}`,
      kind: "insert" as const,
      heading: proposal.edit.heading ?? "New clause",
      originalText: null,
      proposals: [proposal],
      acceptedDepartment: null,
      decided: false,
    },
  }));

  return [...modifyDecisions, ...insertDecisions]
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.decision);
}

/** Derive the ordered edit list to apply from decided decisions. */
export function decisionsToApplied(decisions: ClauseDecision[]): RedlineEdit[] {
  const out: RedlineEdit[] = [];
  for (const d of decisions) {
    if (d.decided && d.acceptedDepartment) {
      const p = d.proposals.find((p) => p.department === d.acceptedDepartment);
      if (p) out.push(p.edit);
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- contract-engine`
Expected: PASS (all engine tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/services/contract-engine.ts server/services/contract-engine.test.ts
git commit -m "feat: department types + buildDecisions cherry-pick engine"
```

---

### Task A2: Persona roster + canned redlines + domain-scoped redline agent

**Files:**
- Modify: `server/data/sample-contract.ts` (rekey canned redlines by department)
- Create: `server/data/personas.ts` (the roster)
- Modify: `server/agents/redline.ts` (department + domain prompt + N-run)
- Modify: `server/services/claude.ts` (`runRedlinePrompt` takes a domain)
- Test: `server/data/personas.test.ts`, `server/agents/redline.test.ts` (rewrite)

**Interfaces:**
- Consumes: `Department`, `Persona`, `Contract`, `RedlineEdit` (types); `SAMPLE_CONTRACT`.
- Produces: `PERSONAS: Persona[]`, `getPersona(id)`, `CORE_DEPARTMENTS: Department[]`; `CANNED_REDLINES: Record<"legal"|"finance"|"security", RedlineEdit[]>`; `runRedlineAgent(contract, department): Promise<RedlineEdit[]>`.

- [ ] **Step 1: Create `server/data/personas.ts`**

```ts
import type { Persona, Department } from "../../shared/types.js";

export const PERSONAS: Persona[] = [
  { id: "legal", label: "Legal Counsel", color: "#047857", cannedAvailable: true,
    domain: "liability, indemnification, governing law, warranties, and termination" },
  { id: "finance", label: "Finance", color: "#b45309", cannedAvailable: true,
    domain: "fees, payment terms, term & renewal, late fees, and spend caps" },
  { id: "security", label: "Security & Data", color: "#4f46e5", cannedAvailable: true,
    domain: "data ownership, security obligations, breach notification, and confidentiality" },
  { id: "commercial", label: "Commercial", color: "#0891b2", cannedAvailable: false,
    domain: "scope of services, SLAs, deliverables, and support" },
  { id: "privacy", label: "Privacy", color: "#7c3aed", cannedAvailable: false,
    domain: "personal data, processing, subprocessors, and retention (GDPR/CCPA)" },
];

export const CORE_DEPARTMENTS: Department[] = ["legal", "finance", "security"];

export function getPersona(id: Department): Persona {
  const p = PERSONAS.find((p) => p.id === id);
  if (!p) throw new Error(`Unknown persona ${id}`);
  return p;
}
```

- [ ] **Step 2: Rekey `CANNED_REDLINES` in `sample-contract.ts` by department**

Replace the `CANNED_REDLINES` export with department-keyed sets scoped to each domain. **Legal and Finance both edit `liability` with different framings** (the contested clause). Keep `SAMPLE_CONTRACT` unchanged.
```ts
import type { Contract, RedlineEdit, Department } from "../../shared/types.js";

export const CANNED_REDLINES: Record<"legal" | "finance" | "security", RedlineEdit[]> = {
  legal: [
    { id: "le1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the fees paid in the prior twelve (12) months, except for breaches of confidentiality or indemnification obligations.", justification: "Mutual cap with standard carve-outs for confidentiality and indemnity." },
    { id: "le2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims arising from its breach. Provider will indemnify Customer against IP-infringement claims relating to the platform.", justification: "Make indemnity mutual and shift platform IP risk to Provider." },
    { id: "le3", type: "replace", targetClauseId: "law", heading: "8. Governing Law", proposedText: "This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws principles.", justification: "Neutral, well-trodden governing law." },
  ],
  finance: [
    { id: "fi1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Neither party's aggregate liability will exceed the total fees paid by Customer in the three (3) months preceding the claim; neither party is liable for indirect or consequential damages.", justification: "Tie the cap to recent spend and exclude consequential damages." },
    { id: "fi2", type: "replace", targetClauseId: "fees", heading: "2. Fees & Payment", proposedText: "Customer will pay undisputed fees within forty-five (45) days of invoice. Late amounts accrue interest at 0.5% per month.", justification: "Extend the payment window and reduce penalty interest." },
    { id: "fi3", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement runs for twelve (12) months and does not auto-renew; renewal requires written agreement of both parties.", justification: "Remove auto-renewal to control spend." },
  ],
  security: [
    { id: "se1", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer retains ownership of its data. Provider may use aggregated, de-identified data solely to improve the services.", justification: "Customer owns data; Provider keeps narrow de-identified rights." },
    { id: "se2", type: "replace", targetClauseId: "confidentiality", heading: "7. Confidentiality", proposedText: "Each party will protect the other's Confidential Information for five (5) years following disclosure, and for trade secrets, for as long as they remain trade secrets.", justification: "Extend confidentiality term and protect trade secrets." },
    { id: "se3", type: "insert", afterClauseId: "confidentiality", heading: "7a. Data Security", proposedText: "Provider will maintain SOC 2 Type II-aligned safeguards and notify Customer of any data breach within seventy-two (72) hours.", justification: "Add a baseline security and breach-notice obligation." },
  ],
};
```

- [ ] **Step 3: Update `runRedlinePrompt` in `claude.ts` to take a domain**

Change the signature from `runRedlinePrompt(contract, role)` to `runRedlinePrompt(contract, domain: string)`, and update the prompt body so the attorney redlines **only** clauses in `domain`:
```ts
export async function runRedlinePrompt(contract: Contract, domain: string): Promise<RedlineEdit[]> {
  const clauseList = contract.clauses
    .map((c) => `[id: ${c.id}] ${c.heading}\n${c.text}`)
    .join("\n\n");
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a contract reviewer for the Customer, responsible for: ${domain}.

Read the whole ${contract.meta.title}, but propose redlines ONLY to clauses that fall within your responsibility (${domain}). Leave all other clauses untouched. The clauses, each with a stable [id], are:

${clauseList}

${REDLINE_SCHEMA_HINT}`,
      },
    ],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseRedlineEdits(text);
}
```

- [ ] **Step 4: Rewrite `redline.ts` to run by department**

```ts
import type { Contract, RedlineEdit, Department } from "../../shared/types.js";
import { hasAnthropicKey, runRedlinePrompt } from "../services/claude.js";
import { CANNED_REDLINES } from "../data/sample-contract.js";
import { getPersona } from "../data/personas.js";

/**
 * Structured clause edits for one department. Real Claude when a key is set,
 * scoped to the persona's domain; otherwise canned (only the three core
 * personas have canned redlines). Retries once on parse failure.
 */
export async function runRedlineAgent(contract: Contract, department: Department): Promise<RedlineEdit[]> {
  const persona = getPersona(department);
  const canned = (CANNED_REDLINES as Record<string, RedlineEdit[]>)[department];
  if (!hasAnthropicKey()) {
    return canned ?? [];
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const edits = await runRedlinePrompt(contract, persona.domain);
      if (edits.length > 0) return edits;
    } catch {
      // retry once, then fall through
    }
  }
  return canned ?? [];
}
```

- [ ] **Step 5: Write tests**

Create `server/data/personas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PERSONAS, CORE_DEPARTMENTS, getPersona } from "./personas.js";

describe("personas", () => {
  it("has 5 personas; the 3 core are cannedAvailable", () => {
    expect(PERSONAS).toHaveLength(5);
    expect(PERSONAS.filter((p) => p.cannedAvailable).map((p) => p.id).sort()).toEqual(["finance", "legal", "security"]);
    expect(CORE_DEPARTMENTS.sort()).toEqual(["finance", "legal", "security"]);
  });
  it("getPersona returns label/color/domain", () => {
    expect(getPersona("legal").label).toBe("Legal Counsel");
    expect(getPersona("legal").color).toMatch(/^#/);
  });
});
```

Rewrite `server/agents/redline.test.ts`:
```ts
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
```

- [ ] **Step 6: Run tests + remove the now-broken `POSTURES` import sites later**

Run: `npm test -- personas redline sample-contract`
Expected: PASS. (The old `sample-contract.test.ts` referenced posture keys — update its assertions to the new department keys: `CANNED_REDLINES.legal/finance/security`, and that every replace/delete edit targets a real clause id.)

- [ ] **Step 7: Commit**

```bash
git add server/data/personas.ts server/data/personas.test.ts server/data/sample-contract.ts server/data/sample-contract.test.ts server/agents/redline.ts server/agents/redline.test.ts server/services/claude.ts
git commit -m "feat: persona roster, department-keyed canned redlines, domain-scoped agent"
```

---

### Task A3: `review.ts` — cherry-pick rewrite

**Files:**
- Modify: `server/services/review.ts` (replace pick/gate with decisions)
- Test: `server/services/review.test.ts` + `server/services/review-gate.test.ts` (rewrite both)

**Interfaces:**
- Consumes: `buildDecisions`, `decisionsToApplied`, `applyEdits`; `runRedlineAgent`; `PERSONAS`/`getPersona`; `emitActivity`.
- Produces: `seedContract`, `getContract`, `setContract(c)`, `startReview(id, departments)`, `acceptEdit(id, decisionId, department)`, `skipDecision(id, decisionId)`, `getActiveReview()`, `getAuditTrail()`, `mergeReview(id)`, `clearActiveReview()`.

> **Context:** This replaces the entire `posture`/pickStrategy/approveNext/rejectNext/loadGate/saveGate machinery. The working branch `review/{id}` now stores `decisions.json` (source of truth) + `audit.json`; the contract is derived. `review/{id}/{department}` branches still hold each reviewer's `redlines.json` (the visible parallel artifact). Department branch helper: `departmentBranch(id, d) = review/{id}/{d}`.

- [ ] **Step 1: Rewrite `review.ts`**

```ts
import { getMesa } from "./mesa.js";
import { applyEdits, buildDecisions, decisionsToApplied } from "./contract-engine.js";
import { SAMPLE_CONTRACT } from "../data/sample-contract.js";
import { runRedlineAgent } from "../agents/redline.js";
import { getPersona } from "../data/personas.js";
import { emitActivity } from "../routes/events.js";
import type { Contract, Department, ClauseDecision, ReviewState, AuditEvent } from "../../shared/types.js";

const MAIN = "main";
const CONTRACT_FILE = "contract.json";
const ACTIVE_FILE = "active-review.json";
const AUDIT_LOG_FILE = "audit-log.json";
const DECISIONS_FILE = "decisions.json";
const AUDIT_WORK_FILE = "audit.json";

export const reviewBranch = (id: number) => `review/${id}`;
export const departmentBranch = (id: number, d: Department) => `review/${id}/${d}`;

interface ActivePointer { id: number; status: "merging" | "merged"; departments: Department[]; }

async function readJson<T>(branch: string, path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await getMesa().readFile(branch, path)) as T; } catch { return fallback; }
}
async function writeJson(branch: string, path: string, value: unknown): Promise<void> {
  await getMesa().writeFile(branch, path, JSON.stringify(value, null, 2));
}

export async function seedContract(): Promise<void> {
  try { await getMesa().readFile(MAIN, CONTRACT_FILE); }
  catch { await writeJson(MAIN, CONTRACT_FILE, SAMPLE_CONTRACT); }
}
export async function getContract(): Promise<Contract> {
  return readJson<Contract>(MAIN, CONTRACT_FILE, SAMPLE_CONTRACT);
}
export async function setContract(c: Contract): Promise<void> {
  await writeJson(MAIN, CONTRACT_FILE, c);
}
export function newAuditEvent(e: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
  return { ...e, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now() };
}

export async function clearActiveReview(): Promise<void> {
  const ptr = await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null);
  if (ptr) {
    for (const d of ptr.departments) await getMesa().deleteBranch(departmentBranch(ptr.id, d));
    await getMesa().deleteBranch(reviewBranch(ptr.id));
  }
  await writeJson(MAIN, ACTIVE_FILE, null);
}

/** Fork a branch per department, run agents, build decisions on the working branch. */
export async function startReview(id: number, departments: Department[]): Promise<ReviewState> {
  await clearActiveReview();
  const base = await getContract();

  const contributions: { department: Department; edits: import("../../shared/types.js").RedlineEdit[] }[] = [];
  for (const d of departments) {
    const persona = getPersona(d);
    const branch = departmentBranch(id, d);
    await getMesa().createBranch(branch, MAIN);
    emitActivity("branch_created", `Forked ${branch} for ${persona.label}`, { branch });
    emitActivity("analysis_started", `${persona.label} reviewing contract`, { agent: persona.label, branch });
    const edits = await runRedlineAgent(base, d);
    await writeJson(branch, "redlines.json", edits);
    emitActivity("agent_complete", `${persona.label}: ${edits.length} edit(s)`, { agent: persona.label, branch });
    contributions.push({ department: d, edits });
  }

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
  await writeJson(branch, DECISIONS_FILE, decisions);
  await writeJson(branch, AUDIT_WORK_FILE, audit);
  return { id, status: "merging", base, contract: applyEdits(base, decisionsToApplied(decisions)), decisions, departments, audit };
}
async function departmentsOf(id: number): Promise<Department[]> {
  return (await readJson<ActivePointer | null>(MAIN, ACTIVE_FILE, null))?.departments ?? [];
}

export async function acceptEdit(id: number, decisionId: string, department: Department): Promise<ReviewState> {
  const { base, decisions, audit } = await load(id);
  const next = decisions.map((d) => d.id === decisionId ? { ...d, acceptedDepartment: department, decided: true } : d);
  const d = next.find((x) => x.id === decisionId);
  const ev = newAuditEvent({ kind: "approved", editId: decisionId, clauseHeading: d?.heading, author: getPersona(department).label, approver: "you", justification: d?.proposals.find((p) => p.department === department)?.edit.justification });
  emitActivity("file_written", `Accepted ${getPersona(department).label} · ${d?.heading}`, { branch: reviewBranch(id) });
  return save(id, base, next, [...audit, ev], await departmentsOf(id));
}

export async function skipDecision(id: number, decisionId: string): Promise<ReviewState> {
  const { base, decisions, audit } = await load(id);
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
```

- [ ] **Step 2: Rewrite the tests** (`review.test.ts` for start/active/setContract; `review-gate.test.ts` for accept/skip/merge)

`review-gate.test.ts`:
```ts
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
```
Update `review.test.ts` to: seed/getContract, `startReview(id, ["legal","finance","security"])` returns status `"merging"` with `decisions.length > 0`, and `getActiveReview` rehydrates. Remove all pick/posture assertions.

- [ ] **Step 3: Run tests**

Run: `npm test -- review`
Expected: PASS (`review.test.ts` + `review-gate.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add server/services/review.ts server/services/review.test.ts server/services/review-gate.test.ts
git commit -m "feat: cherry-pick review service (decisions.json source of truth)"
```

---

### Task A4: API routes for the cherry-pick flow

**Files:**
- Modify: `server/routes/api.ts`

**Interfaces:**
- Produces routes: `POST /api/review/start {departments}`, `POST /api/review/accept {id, decisionId, department}`, `POST /api/review/skip {id, decisionId}`, `POST /api/review/merge {id}`, `GET /api/review/active`, `GET /api/audit`, `GET /api/contract`, `GET /api/personas`. Removes `/review/pick`, `/review/approve`, `/review/reject`, `/review/rollback`.

- [ ] **Step 1: Replace the review routes in `api.ts`**

Update the import from `../services/review.js` to `{ getContract, startReview, acceptEdit, skipDecision, mergeReview, getActiveReview, getAuditTrail }` and add `import { PERSONAS } from "../data/personas.js"; import type { Department } from "../../shared/types.js";`. Remove the old `pickStrategy`/`approveNext`/`rejectNext`/`rollbackLast` imports and their routes. Add:
```ts
apiRouter.get("/personas", (_req, res) => res.json({ personas: PERSONAS }));

apiRouter.post("/review/start", async (req, res) => {
  try {
    const { departments } = req.body as { departments: Department[] };
    if (!Array.isArray(departments) || departments.length < 2 || departments.length > 4) {
      res.status(400).json({ error: "Select 2–4 departments" }); return;
    }
    res.json(await startReview(Date.now(), departments));
  } catch (error) { console.error("Review start failed:", error); res.status(500).json({ error: "Failed to start review" }); }
});

apiRouter.post("/review/accept", async (req, res) => {
  try {
    const { id, decisionId, department } = req.body as { id: number; decisionId: string; department: Department };
    res.json(await acceptEdit(id, decisionId, department));
  } catch (error) { console.error("Accept failed:", error); res.status(500).json({ error: "Accept failed" }); }
});

apiRouter.post("/review/skip", async (req, res) => {
  try {
    const { id, decisionId } = req.body as { id: number; decisionId: string };
    res.json(await skipDecision(id, decisionId));
  } catch (error) { console.error("Skip failed:", error); res.status(500).json({ error: "Skip failed" }); }
});

apiRouter.post("/review/merge", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json({ contract: await mergeReview(id) });
  } catch (error) { console.error("Merge failed:", error); res.status(400).json({ error: error instanceof Error ? error.message : "Merge failed" }); }
});

apiRouter.get("/review/active", async (_req, res) => {
  try { res.json({ review: await getActiveReview() }); }
  catch { res.status(500).json({ error: "Failed to load active review" }); }
});
```
Keep the existing `GET /contract`, `GET /audit`, `/settings*`, `/activity`, `/changes`, `/webhooks/*`, `/repo/tags`, `/reset`, `/diff`.

- [ ] **Step 2: Verify build + curl smoke (local-fs, no key)**

Run: `npx tsc -p tsconfig.server.json --noEmit` → PASS.
```bash
rm -rf mesa-repo && (npm run dev:server &) && sleep 3
curl -s localhost:3001/api/personas | head -c 120; echo
ID=$(curl -s -X POST localhost:3001/api/review/start -H 'content-type: application/json' -d '{"departments":["legal","finance","security"]}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST localhost:3001/api/review/accept -H 'content-type: application/json' -d "{\"id\":$ID,\"decisionId\":\"dec-liability\",\"department\":\"finance\"}" | python3 -c "import sys,json;d=json.load(sys.stdin);print('decided',[x for x in d['decisions'] if x['id']=='dec-liability'][0]['acceptedDepartment'])"
curl -s localhost:3001/api/review/active | head -c 120; echo
pkill -f "tsx watch server/index.ts" || true
```
Expected: personas list; start returns an id + `status:"merging"` + decisions; accept sets `dec-liability` → finance; active rehydrates.

- [ ] **Step 3: Commit**

```bash
git add server/routes/api.ts
git commit -m "feat: cherry-pick review API routes + personas endpoint"
```

---

### Task B1: Variable-N branch visualization + merge-all mode

**Files:**
- Modify: `client/src/components/BranchVisualization.tsx`
- Modify: `client/src/types.ts` (re-export new types)

**Interfaces:**
- Consumes: `Department`, `Persona`, `ClauseDecision`, `ReviewState` (re-exported).
- Produces: a `BranchVisualization` that accepts `departments: {id, label, color}[]` (2–4) and renders that many branches, with a `mergeAll` mode.

- [ ] **Step 1: Re-export the new types in `client/src/types.ts`**

Add `Department`, `Persona`, `ClauseProposal`, `ClauseDecision` to the `export type { … } from "@shared/types.js"` block; remove `Posture`, `RedlineStrategy`. Remove the now-dead `PortfolioWithPrices`/`AnalysisState`/`HistoryRoundSummary` if still present.

- [ ] **Step 2: Generalize `BranchVisualization` to N branches**

Replace the hardcoded 3-entry `AGENTS` array with a prop-driven layout. New props:
```tsx
export type VizPhase = "fork" | "analyze" | "done" | "merge" | "complete";
interface BranchVisualizationProps {
  phase: VizPhase;
  departments: { id: string; label: string; color: string }[]; // 2–4
  events: import("../types.js").MesaActivityEvent[];
  mergeAll?: boolean; // multi-branch merge (no single winner)
}
```
Compute each branch's vertical position from the count: for `n` departments, lay them at `y = 40 + i * (180 / Math.max(1, n - 1))` (single branch → centered at 130). Build each branch `path` from `M 68,130` curving to `(432, y)` and `mergePath` from `(448, y)` to `(692,130)`. Keep the existing draw/pulse/node animations and the dark-panel colors (`#34d399` main nodes, `#cbd5e1`/`#7fb8a4` text). Node status keys off `events` by the department `label` (as today). For the merge: when `mergeAll`, draw **every** branch's `mergePath` into the main node and show the caption "merging to v2" — never the `isDismiss` "Discarding…" branch. Remove the single-`winnerAgent` logic.

- [ ] **Step 3: Build + visual self-check**

Run: `npm run build`
Expected: zero TS errors. (App still passes the old props until Task B handoff — if App references `winnerAgent`, that line is updated in Task F4; for now ensure the component itself compiles. If App.tsx fails to build because it passes removed props, leave App as-is and note it — Task F4 rewires App; this task's deliverable is the component compiling on its own, so temporarily keep a back-compat optional `winnerAgent?` prop ignored by the body to keep the build green.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BranchVisualization.tsx client/src/types.ts
git commit -m "feat: variable-N branch visualization with merge-all mode"
```

---

### Task C1: Intake service — text extraction + sample library

**Files:**
- Create: `server/services/intake.ts`
- Create: `server/data/sample-nda.ts`
- Modify: `package.json` (deps), `server/routes/api.ts` (samples routes)
- Test: `server/services/intake.test.ts`

**Interfaces:**
- Produces: `extractText(buffer, filename): Promise<string>`, `SAMPLES: { id: string; title: string; contract: Contract }[]`, `getSample(id)`; routes `GET /api/samples`, `POST /api/contract/sample {id}`.

- [ ] **Step 1: Add deps**

```bash
npm install pdf-parse mammoth multer
npm install -D @types/multer
```

- [ ] **Step 2: Create a second sample `server/data/sample-nda.ts`**

```ts
import type { Contract } from "../../shared/types.js";
export const SAMPLE_NDA: Contract = {
  meta: { title: "Mutual Non-Disclosure Agreement", parties: ["Discloser", "Recipient"], version: 1, lastApproved: null },
  clauses: [
    { id: "purpose", heading: "1. Purpose", text: "The parties wish to explore a business relationship and may share confidential information." },
    { id: "definition", heading: "2. Definition of Confidential Information", text: "Confidential Information means any non-public information disclosed by one party to the other, in any form." },
    { id: "obligations", heading: "3. Obligations", text: "The Recipient will use Confidential Information solely for the Purpose and protect it with reasonable care." },
    { id: "term", heading: "4. Term", text: "This Agreement remains in effect for two (2) years from the Effective Date." },
    { id: "return", heading: "5. Return of Materials", text: "Upon request, the Recipient will return or destroy all Confidential Information." },
    { id: "law", heading: "6. Governing Law", text: "This Agreement is governed by the laws of the State of New York." },
  ],
};
```

- [ ] **Step 3: Write the failing test (`intake.test.ts`)**

```ts
import { describe, it, expect } from "vitest";
import { extractText, SAMPLES, getSample } from "./intake.js";

describe("intake", () => {
  it("extracts text from a .txt buffer", async () => {
    const t = await extractText(Buffer.from("Hello clause text", "utf-8"), "a.txt");
    expect(t).toContain("Hello clause");
  });
  it("rejects an unsupported extension", async () => {
    await expect(extractText(Buffer.from("x"), "a.png")).rejects.toThrow(/Unsupported/);
  });
  it("lists samples including the MSA and NDA", () => {
    expect(SAMPLES.map((s) => s.id).sort()).toEqual(["msa", "nda"]);
    expect(getSample("msa").contract.meta.title).toContain("Master Services Agreement");
  });
});
```

- [ ] **Step 4: Implement `intake.ts`**

```ts
import mammoth from "mammoth";
import { SAMPLE_CONTRACT } from "../data/sample-contract.js";
import { SAMPLE_NDA } from "../data/sample-nda.js";
import type { Contract } from "../../shared/types.js";

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) return buffer.toString("utf-8");
  if (lower.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    return (await pdfParse(buffer)).text;
  }
  throw new Error("Unsupported file type — use .pdf, .docx, or .txt");
}

export const SAMPLES: { id: string; title: string; contract: Contract }[] = [
  { id: "msa", title: SAMPLE_CONTRACT.meta.title, contract: SAMPLE_CONTRACT },
  { id: "nda", title: SAMPLE_NDA.meta.title, contract: SAMPLE_NDA },
];
export function getSample(id: string): { id: string; title: string; contract: Contract } {
  const s = SAMPLES.find((s) => s.id === id);
  if (!s) throw new Error(`Unknown sample ${id}`);
  return s;
}
```

- [ ] **Step 5: Add sample routes in `api.ts`**

```ts
import { SAMPLES, getSample } from "../services/intake.js";
import { setContract } from "../services/review.js";

apiRouter.get("/samples", (_req, res) => res.json({ samples: SAMPLES.map((s) => ({ id: s.id, title: s.title })) }));
apiRouter.post("/contract/sample", async (req, res) => {
  try {
    const { id } = req.body as { id: string };
    const sample = getSample(id);
    await setContract(sample.contract);
    res.json({ contract: sample.contract });
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Failed to load sample" }); }
});
```

- [ ] **Step 6: Run tests + build**

Run: `npm test -- intake` → PASS. `npx tsc -p tsconfig.server.json --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/services/intake.ts server/services/intake.test.ts server/data/sample-nda.ts server/routes/api.ts
git commit -m "feat: intake service — text extraction + sample library routes"
```

---

### Task C2: Upload route + LLM segmentation

**Files:**
- Modify: `server/services/claude.ts` (`segmentContract`)
- Modify: `server/routes/api.ts` (upload route)
- Test: `server/services/claude-segment.test.ts`

**Interfaces:**
- Produces: `segmentContract(rawText): Promise<Contract>`; `POST /api/contract/upload` (multipart, field `file`).

- [ ] **Step 1: Add `segmentContract` + a pure parser to `claude.ts`**

```ts
import type { Contract, Clause } from "../../shared/types.js";

export function parseSegmentedContract(text: string): Contract {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Segmentation returned no JSON");
  const parsed = JSON.parse(match[0]);
  const clauses: Clause[] = (parsed.clauses ?? []).map((c: any, i: number) => ({
    id: typeof c.id === "string" && c.id.trim() ? c.id.trim() : `clause-${i + 1}`,
    heading: c.heading ?? `Clause ${i + 1}`,
    text: c.text ?? "",
  }));
  if (clauses.length < 2) throw new Error("Could not segment into clauses");
  // dedupe ids
  const seen = new Set<string>();
  for (const c of clauses) { let id = c.id, n = 1; while (seen.has(id)) id = `${c.id}-${++n}`; c.id = id; seen.add(id); }
  return {
    meta: { title: parsed.title ?? "Uploaded Contract", parties: Array.isArray(parsed.parties) ? parsed.parties : [], version: 1, lastApproved: null },
    clauses,
  };
}

export async function segmentContract(rawText: string): Promise<Contract> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: `Split this contract into its numbered clauses. Respond with ONLY JSON:
{"title": "...", "parties": ["...","..."], "clauses": [{"id":"short-slug","heading":"1. Heading","text":"full clause text"}]}
Use a short lowercase slug for each id. Keep clause text verbatim. Contract:

${rawText.slice(0, 24000)}` }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseSegmentedContract(text);
}
```

- [ ] **Step 2: Test the pure parser (`claude-segment.test.ts`)**

```ts
import { describe, it, expect } from "vitest";
import { parseSegmentedContract } from "./claude.js";

describe("parseSegmentedContract", () => {
  it("parses prose-wrapped JSON and dedupes ids", () => {
    const c = parseSegmentedContract('ok: {"title":"X","parties":["A"],"clauses":[{"id":"a","heading":"1","text":"t1"},{"id":"a","heading":"2","text":"t2"}]} done');
    expect(c.clauses.map((x) => x.id)).toEqual(["a", "a-2"]);
    expect(c.meta.title).toBe("X");
  });
  it("rejects < 2 clauses", () => {
    expect(() => parseSegmentedContract('{"clauses":[{"id":"a","heading":"1","text":"t"}]}')).toThrow();
  });
});
```

- [ ] **Step 3: Add the multipart upload route in `api.ts`**

```ts
import multer from "multer";
import { extractText } from "../services/intake.js";
import { segmentContract, hasAnthropicKey } from "../services/claude.js";
const upload = multer({ limits: { fileSize: 2 * 1024 * 1024 } });

apiRouter.post("/contract/upload", upload.single("file"), async (req, res) => {
  try {
    if (!hasAnthropicKey()) { res.status(400).json({ error: "An Anthropic key is required to read an uploaded contract — add one in Settings, or use a sample." }); return; }
    const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
    if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const text = await extractText(file.buffer, file.originalname);
    if (text.replace(/\s/g, "").length < 200) { res.status(400).json({ error: "Couldn't extract text — this may be a scanned/image PDF. Paste the text or use a sample." }); return; }
    const contract = await segmentContract(text);
    await (await import("../services/review.js")).setContract(contract);
    res.json({ contract });
  } catch (error) { console.error("Upload failed:", error); res.status(400).json({ error: error instanceof Error ? error.message : "Failed to read contract" }); }
});
```
(Add `hasAnthropicKey` to the existing `claude.js` import if not already imported.)

- [ ] **Step 4: Run tests + build**

Run: `npm test -- claude-segment` → PASS. `npx tsc -p tsconfig.server.json --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/claude.ts server/services/claude-segment.test.ts server/routes/api.ts
git commit -m "feat: contract upload route + LLM clause segmentation"
```

---

### Task F1: Client hooks

**Files:**
- Modify: `client/src/hooks/useApi.ts`

**Interfaces:**
- Produces: `usePersonas()` → `{ personas }`; `useSamples()` → `{ samples }`; `useContract()` gains `uploadFile(file)`, `loadSample(id)`; `useReview(onChange)` → `{ review, busy, start(departments), accept(decisionId, department), skip(decisionId), merge, refreshActive }`; `useAuditTrail` unchanged.

- [ ] **Step 1: Replace the review/contract hooks**

Remove the old `useReview` pick/approve/reject internals and the `strategies` state. Implement:
```tsx
import type { Persona, ReviewState, Department, Contract, AuditEvent } from "../types.js";

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => { fetch("/api/personas").then((r) => r.json()).then((d) => setPersonas(d.personas ?? [])).catch(() => {}); }, []);
  return { personas };
}

export function useSamples() {
  const [samples, setSamples] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => { fetch("/api/samples").then((r) => r.json()).then((d) => setSamples(d.samples ?? [])).catch(() => {}); }, []);
  return { samples };
}

export function useContract(refreshKey?: unknown) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setContract(await (await fetch("/api/contract")).json()); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  const loadSample = useCallback(async (id: string) => {
    const r = await fetch("/api/contract/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json(); if (r.ok) setContract(d.contract); return d;
  }, []);
  const uploadFile = useCallback(async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/contract/upload", { method: "POST", body: fd });
    const d = await r.json(); if (r.ok) setContract(d.contract); return r.ok ? { ok: true, contract: d.contract } : { ok: false, error: d.error };
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { contract, loading, refresh, loadSample, uploadFile };
}

export function useReview(onChange?: () => void) {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshActive = useCallback(async () => {
    try { const d = await (await fetch("/api/review/active")).json(); setReview(d.review); } catch { /* */ }
  }, []);
  useEffect(() => { refreshActive(); }, [refreshActive]);
  const post = useCallback(async (path: string, body: object) => {
    setBusy(true);
    try { const d = await (await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(); onChange?.(); return d; }
    finally { setBusy(false); }
  }, [onChange]);
  const start = useCallback(async (departments: Department[]) => { setBusy(true); try { const r = await fetch("/api/review/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departments }) }); const d = await r.json(); if (r.ok) setReview(d); onChange?.(); return d; } finally { setBusy(false); } }, [onChange]);
  const accept = useCallback(async (decisionId: string, department: Department) => { if (!review) return; setReview(await post("/api/review/accept", { id: review.id, decisionId, department })); }, [review, post]);
  const skip = useCallback(async (decisionId: string) => { if (!review) return; setReview(await post("/api/review/skip", { id: review.id, decisionId })); }, [review, post]);
  const merge = useCallback(async () => { if (!review) return; await post("/api/review/merge", { id: review.id }); setReview(null); onChange?.(); }, [review, post, onChange]);
  return { review, busy, start, accept, skip, merge, refreshActive };
}
```
Keep `useAuditTrail` (unchanged) and the settings/webhook/tags hooks.

- [ ] **Step 2: Build (App.tsx will error until F4 — that's expected)**

Run: `npm run build 2>&1 | tail -30`
Expected: errors only in `client/src/App.tsx` (and removed-component refs). Hooks file must not error on its own.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useApi.ts
git commit -m "feat: hooks for personas, samples, upload, cherry-pick review"
```

---

### Task F2: IntakePanel component

**Files:**
- Create: `client/src/components/IntakePanel.tsx`
- Create: `client/src/components/personaMeta.ts` (shared label/color map)

**Interfaces:**
- Consumes: `Persona`, `Department`. Produces `<IntakePanel personas contract samples onUpload onLoadSample selected onToggle hasKey onRun busy />`.

- [ ] **Step 1: Shared persona meta**

```ts
// personaMeta.ts
import type { Persona } from "../types.js";
export function personaStyle(p: Persona) { return { color: p.color }; }
```

- [ ] **Step 2: `IntakePanel.tsx`**

```tsx
import { useRef } from "react";
import type { Persona, Department } from "../types.js";

interface Props {
  personas: Persona[];
  contractTitle: string | null;
  samples: { id: string; title: string }[];
  onUpload: (file: File) => void;
  onLoadSample: (id: string) => void;
  selected: Department[];
  onToggle: (id: Department) => void;
  hasKey: boolean;
  onRun: () => void;
  busy: boolean;
}

export function IntakePanel({ personas, contractTitle, samples, onUpload, onLoadSample, selected, onToggle, hasKey, onRun, busy }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDefaultMsa = contractTitle?.includes("Master Services Agreement");
  const allCore = selected.every((d) => ["legal", "finance", "security"].includes(d));
  const offlineOk = isDefaultMsa && allCore;
  const needsKey = !offlineOk;
  const canRun = !!contractTitle && selected.length >= 2 && selected.length <= 4 && (hasKey || offlineOk);

  return (
    <div className="card p-6">
      <div className="section-label mb-4">Set up a review</div>

      {/* Document */}
      <div className="mb-6">
        <div className="text-sm font-semibold mb-2">1 · Choose a contract</div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-lg bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors">Upload PDF / DOCX / TXT</button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          <span className="text-mute text-sm">or sample:</span>
          {samples.map((s) => (
            <button key={s.id} onClick={() => onLoadSample(s.id)} className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-line hover:border-mesa transition-colors">{s.title}</button>
          ))}
        </div>
        {contractTitle && <div className="text-xs text-mute mt-2">Loaded: <span className="text-ink">{contractTitle}</span></div>}
        {!hasKey && <div className="text-xs text-mute mt-1">Upload and non-default contracts need an Anthropic key (Settings).</div>}
      </div>

      {/* Reviewers */}
      <div className="mb-6">
        <div className="text-sm font-semibold mb-2">2 · Choose reviewers <span className="text-mute font-normal">(2–4)</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {personas.map((p) => {
            const on = selected.includes(p.id);
            const locked = !p.cannedAvailable && !hasKey && !on;
            return (
              <button key={p.id} disabled={locked} onClick={() => onToggle(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${on ? "border-ink bg-ink/[0.03]" : "border-line hover:border-ink/30"} ${locked ? "opacity-40 cursor-not-allowed" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: p.color }} />
                <span>
                  <span className="text-sm font-semibold block">{p.label}{!p.cannedAvailable && <span className="text-mute font-normal"> · needs key</span>}</span>
                  <span className="text-xs text-mute">{p.domain}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={onRun} disabled={!canRun || busy} className="font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-xl bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "Running…" : `Run review · ${selected.length} reviewer${selected.length === 1 ? "" : "s"}`}
      </button>
      {needsKey && !hasKey && <span className="ml-3 text-xs text-mute">This combination needs an Anthropic key.</span>}
    </div>
  );
}
```

- [ ] **Step 3: Build (App still errors until F4)** — `npm run build 2>&1 | grep IntakePanel || echo "no IntakePanel errors"` → `no IntakePanel errors`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/IntakePanel.tsx client/src/components/personaMeta.ts
git commit -m "feat: IntakePanel — upload, sample, and reviewer selection"
```

---

### Task F3: CherryPickReview component

**Files:**
- Create: `client/src/components/CherryPickReview.tsx`

**Interfaces:**
- Consumes: `ReviewState`, `ClauseDecision`, `Department`, `Persona`. Produces `<CherryPickReview review personas onAccept onSkip onMerge busy />`.

- [ ] **Step 1: `CherryPickReview.tsx`**

```tsx
import { useState } from "react";
import type { ReviewState, ClauseDecision, Department, Persona } from "../types.js";

function colorOf(personas: Persona[], d: Department) { return personas.find((p) => p.id === d)?.color ?? "#6b827a"; }
function labelOf(personas: Persona[], d: Department) { return personas.find((p) => p.id === d)?.label ?? d; }

export function CherryPickReview({ review, personas, onAccept, onSkip, onMerge, busy }: {
  review: ReviewState; personas: Persona[];
  onAccept: (decisionId: string, d: Department) => void;
  onSkip: (decisionId: string) => void;
  onMerge: () => void; busy: boolean;
}) {
  const decisions = review.decisions;
  const total = decisions.length;
  const done = decisions.filter((d) => d.decided).length;
  const firstUndecided = decisions.find((d) => !d.decided)?.id ?? decisions[0]?.id;
  const [focusId, setFocusId] = useState<string | undefined>(firstUndecided);
  const focus = decisions.find((d) => d.id === focusId) ?? decisions[0];

  const statusChip = (d: ClauseDecision) => {
    if (d.decided && d.acceptedDepartment) return <span className="pill" style={{ background: colorOf(personas, d.acceptedDepartment) + "22", color: colorOf(personas, d.acceptedDepartment) }}>✓ {labelOf(personas, d.acceptedDepartment)}</span>;
    if (d.decided) return <span className="pill pill-warn">kept original</span>;
    if (d.proposals.length > 1) return <span className="pill pill-bad">contested · {d.proposals.length}</span>;
    return <span className="pill" style={{ background: colorOf(personas, d.proposals[0].department) + "22", color: colorOf(personas, d.proposals[0].department) }}>{labelOf(personas, d.proposals[0].department)}</span>;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: document overview */}
      <div className="card p-5 max-h-[560px] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="section-label">{review.contract.meta.title}</div>
          <span className="font-mono text-xs text-mute">{done}/{total} decided</span>
        </div>
        <div className="h-1.5 bg-line/60 rounded-full overflow-hidden mb-4"><div className="h-full bg-mesa transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <div className="divide-y divide-line/60">
          {review.contract.clauses.map((c) => {
            const d = decisions.find((x) => x.kind === "modify" && x.targetClauseId === c.id);
            return (
              <button key={c.id} onClick={() => d && setFocusId(d.id)} className={`w-full text-left py-3 ${d ? "hover:bg-ink/[0.02]" : ""} ${focusId === d?.id ? "bg-ink/[0.03]" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-ink">{c.heading}</span>
                  {d ? statusChip(d) : <span className="pill" style={{ color: "#9fb3aa" }}>unchanged</span>}
                </div>
              </button>
            );
          })}
          {decisions.filter((d) => d.kind === "insert").map((d) => (
            <button key={d.id} onClick={() => setFocusId(d.id)} className={`w-full text-left py-3 ${focusId === d.id ? "bg-ink/[0.03]" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-up">+ {d.heading}</span>
                {statusChip(d)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: decision panel */}
      <div className="card p-5">
        {focus ? (
          <>
            <div className="font-mono text-xs text-mesa mb-1">{focus.kind === "insert" ? "PROPOSED NEW CLAUSE" : "REVISE"} · {focus.heading}</div>
            {focus.originalText && (
              <div className="diff-deleted text-down rounded-md px-3 py-2 text-sm mb-3 line-through">{focus.originalText}</div>
            )}
            <div className="space-y-3">
              {focus.proposals.map((p) => (
                <div key={p.department} className="border rounded-lg p-3" style={{ borderColor: colorOf(personas, p.department) + "55" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[11px]" style={{ color: colorOf(personas, p.department) }}>{labelOf(personas, p.department)}</span>
                    <button onClick={() => onAccept(focus.id, p.department)} disabled={busy}
                      className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: colorOf(personas, p.department) }}>
                      {focus.acceptedDepartment === p.department ? "✓ Accepted" : "Accept"}
                    </button>
                  </div>
                  <div className="diff-added text-up rounded-md px-3 py-2 text-sm">{p.edit.proposedText}</div>
                  <div className="text-xs text-mute italic mt-1">{p.edit.justification}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={() => onSkip(focus.id)} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-lg border border-line hover:border-ink transition-colors disabled:opacity-40">
                {focus.decided && !focus.acceptedDepartment ? "✓ Kept original" : "Keep original"}
              </button>
            </div>
          </>
        ) : <p className="serif-quote text-mute">No decisions.</p>}

        <div className="mt-6 pt-4 border-t border-line">
          <button onClick={onMerge} disabled={busy || done < total} className="w-full font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-xl bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {done < total ? `Decide all clauses to merge (${done}/${total})` : "Merge to main → v" + (review.contract.meta.version + 1)}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build** — `npm run build 2>&1 | grep CherryPickReview || echo "no CherryPickReview errors"` → `no CherryPickReview errors`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CherryPickReview.tsx
git commit -m "feat: CherryPickReview — hybrid document + decision panel"
```

---

### Task F4: App rewire

**Files:**
- Modify: `client/src/App.tsx`

**Interfaces:** Consumes the F1 hooks + IntakePanel + CherryPickReview + BranchVisualization.

- [ ] **Step 1: Rewire `App.tsx`**

Replace the imports of `RedlineComparison`/`ApprovalGate` with `IntakePanel` and `CherryPickReview`; import `usePersonas`, `useSamples`. Hook setup:
```tsx
const { personas } = usePersonas();
const { samples } = useSamples();
const { contract, refresh: refreshContract, loadSample, uploadFile } = useContract(refreshKey);
const onReviewChange = useCallback(() => { refreshContract(); bump(); }, [refreshContract, bump]);
const { review, busy, start, accept, skip, merge } = useReview(onReviewChange);
const [selected, setSelected] = useState<Department[]>(["legal", "finance", "security"]);
const toggle = (id: Department) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s);
```
Lifecycle/viz: keep the `vizPhase`/`mergeViz` state machine but drop the single-winner snapshot. The viz `departments` prop = the selected (or `review.departments`) mapped to `{id,label,color}` via `personas`; pass `mergeAll` during the merge window. `handleMerge`:
```tsx
const handleMerge = useCallback(async () => {
  setMergeViz(true); setVizPhase("merge");
  setTimeout(() => setVizPhase("complete"), 700);
  try { await merge(); } finally { setTimeout(() => { setMergeViz(false); setVizPhase(null); }, 1700); }
}, [merge]);
```
Sections in `<main>`:
- **Intake** (when `!review`): `<IntakePanel personas={personas} contractTitle={contract?.meta.title ?? null} samples={samples} onUpload={uploadFile} onLoadSample={loadSample} selected={selected} onToggle={toggle} hasKey={keys.anthropic} onRun={() => start(selected)} busy={busy} />`.
- **Pipeline** (when `vizPhase`): the dark panel with `<BranchVisualization phase={vizPhase} departments={(review?.departments ?? selected).map((id) => { const p = personas.find((x) => x.id === id)!; return { id, label: p?.label ?? id, color: p?.color ?? "#34d399" }; })} events={mesaEvents} mergeAll={mergeViz} />`.
- **Review** (when `review` && `review.status === "merging"`): `<CherryPickReview review={review} personas={personas} onAccept={accept} onSkip={skip} onMerge={handleMerge} busy={busy} />`.
- **Audit** + **Activity**: unchanged.
Update the hero "Run review" button to scroll to / focus the IntakePanel (or simply remove the hero CTA and let IntakePanel be the entry — keep the hero headline + how-it-works strip). Keep header/clear-keys/settings.

- [ ] **Step 2: Lifecycle effect** — set `vizPhase` from `busy`/`review` as before, but with the single `"merging"` status: `busy && !review` → fork/analyze; `review` (merging) with all branches reported done → `done`; merge window handled by `handleMerge`.

- [ ] **Step 3: Build + manual smoke**

Run: `npm run build` → zero errors.
```bash
rm -rf mesa-repo && (npm run dev:server &) && sleep 3 && (npm run dev:client &) && sleep 3
echo "Open http://localhost:5173 — sample MSA + Legal/Finance/Security → Run → cherry-pick (Liability shows 2 options) → decide all → Merge. Confirm audit shows per-department accepts."
```
Stop servers afterward.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire intake + cherry-pick review into App"
```

---

### Task F5: Cleanup + README

**Files:**
- Delete: `client/src/components/RedlineComparison.tsx`, `client/src/components/StrategyCard.tsx`, `client/src/components/ApprovalGate.tsx`
- Modify: `README.md`

- [ ] **Step 1: Remove dead components**

```bash
git rm client/src/components/RedlineComparison.tsx client/src/components/StrategyCard.tsx client/src/components/ApprovalGate.tsx
```
Grep to confirm nothing imports them: `grep -rn "RedlineComparison\|StrategyCard\|ApprovalGate" client/src` → no matches. Fix any straggler.

- [ ] **Step 2: Full build + test**

Run: `npm run build && npm test`
Expected: build green; all Vitest suites pass.

- [ ] **Step 3: README**

Update `README.md` to describe the platform flow (upload/sample → choose reviewers → parallel redline → cherry-pick → merge), the persona roster, the offline/key matrix, and the new dependencies (pdf-parse, mammoth, multer). Remove references to the pick-one/single-gate flow.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove pick-one components, update README for the review platform"
```

---

## Self-Review

**Spec coverage:** Intake upload+segmentation (C1/C2) ✓ · sample library (C1) ✓ · persona roster + 2–4 selection (A2 data, A4 route, F2 UI) ✓ · domain-driven parallel redline (A2) ✓ · `buildDecisions`/decisions.json single source (A1/A3) ✓ · accept/skip/merge-gated/durable (A3) ✓ · variable-N + merge-all animation (B1) ✓ · CherryPickReview hybrid (F3) ✓ · IntakePanel (F2) ✓ · App rewire + removals (F4/F5) ✓ · offline matrix (A2 canned + F2 gating) ✓ · `Department` rename (A1 + ripple) ✓ · audit append-only (A3) ✓ · tests incl. ownership/contested/segmentation (A1/A2/C2/A3) ✓.

**Placeholder scan:** every code step has concrete code; the two UI verification steps name exact grep/build checks. No TBD/TODO.

**Type/name consistency:** `Department`, `ClauseDecision`, `buildDecisions`/`decisionsToApplied`, `runRedlineAgent(contract, department)`, `runRedlinePrompt(contract, domain)`, `startReview(id, departments)`, `acceptEdit(id, decisionId, department)`, `skipDecision(id, decisionId)`, `mergeReview(id)`, `getActiveReview()`, `setContract`, `extractText`, `SAMPLES`/`getSample`, `segmentContract`/`parseSegmentedContract`, `PERSONAS`/`getPersona`/`CORE_DEPARTMENTS` — used consistently across tasks. `BranchVisualization` props (`departments`, `mergeAll`) match F4's usage. Decision ids (`dec-{clauseId}`, `dec-ins-{department}-{editId}`) consistent between A1 and the F3 status logic.
