# Contract Redline Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock-portfolio demo scenario with a contract-redlining workflow — an agent swarm proposes competing redlines, a human approves them clause-by-clause through a durable Mesa-backed approval gate, every change lands on an immutable audit trail, and bad edits roll back — while reusing the existing editorial UI, Mesa primitives, and three-backend architecture.

**Architecture:** A contract is stored as a clause-addressable `contract.json` on Mesa's `main`. A review run snapshots `main`, forks three posture branches (aggressive/balanced/minimal) where agents write structured `redlines.json`, the human picks one, and a `review/{id}` branch carries `pending.json` + `applied.json` so the contract is always recomputed as `base ⊕ applied` (deterministic replay → resume and rollback work identically on every backend). Approved edits merge to `main`.

**Tech Stack:** TypeScript (NodeNext ESM), Express 5, React 19 + Vite + Tailwind v4, `@mesadev/sdk`, `@anthropic-ai/sdk`, Vitest (added by this plan).

## Global Constraints

- **Language/module:** TypeScript, ESM, NodeNext resolution — all relative imports use `.js` extensions even for `.ts` files (e.g. `import { x } from "./contract-engine.js"`).
- **Backend-agnostic:** All workflow state (`pending.json`, `applied.json`, `contract.json`, `audit.json`, `active-review.json`) lives in Mesa files via `getMesa()`. Never depend on Mesa history APIs for correctness — `listChanges`/`getChangeId` return `[]`/`null` on local-fs. The contract is always `applyEdits(base, applied)`.
- **Single active review:** One review at a time; starting a new one supersedes any in-flight one.
- **Mesa repo name:** `"contract-redline"` (renamed from `"portfolio-advisor"`).
- **Testing strategy:** Pure/backend logic uses Vitest (TDD). UI components have no test runner in this repo (none exists) — verify them with `npx tsc -p tsconfig.server.json` type-checks where applicable, `npm run build`, and a manual run/click per the task's verification step. Do not introduce React Testing Library.
- **Sample contract:** one baked SaaS MSA excerpt (~7 clauses); no upload UI.
- **Posture type:** exactly `"aggressive" | "balanced" | "minimal"`.
- **Commit cadence:** commit at the end of every task.

---

### Task 1: Test runner + shared types + pure contract engine

**Files:**
- Modify: `package.json` (add vitest devDep + `test` script)
- Create: `vitest.config.ts`
- Modify: `shared/types.ts` (append new types)
- Create: `server/services/contract-engine.ts`
- Test: `server/services/contract-engine.test.ts`

**Interfaces:**
- Produces: types `Clause`, `ContractMeta`, `Contract`, `Posture`, `RedlineEdit`, `RedlineStrategy`, `AuditEvent`, `ReviewState` (in `shared/types.ts`); functions `applyEdits(base: Contract, edits: RedlineEdit[]): Contract` and `editSummary(edits: RedlineEdit[]): string` (in `contract-engine.ts`).

- [ ] **Step 1: Add Vitest and a test script**

Edit `package.json` — add to `devDependencies`: `"vitest": "^3.2.4"`, and add to `scripts`: `"test": "vitest run"`. Then install:

```bash
npm install
```

- [ ] **Step 2: Add a Vitest config that resolves `.js` specifiers to `.ts`**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Source uses NodeNext .js specifiers that point at .ts files.
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  test: {
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Append the new domain types to `shared/types.ts`**

Add at the end of `shared/types.ts`:

```ts
// ── Contract Redline Workflow ────────────────────────────────────────
export interface Clause {
  id: string;        // stable slug, e.g. "liability"
  heading: string;   // "8. Limitation of Liability"
  text: string;
}

export interface ContractMeta {
  title: string;
  parties: string[];
  version: number;
  lastApproved: string | null; // ISO timestamp
}

export interface Contract {
  meta: ContractMeta;
  clauses: Clause[];
}

export type Posture = "aggressive" | "balanced" | "minimal";

export interface RedlineEdit {
  id: string;                      // unique within a strategy, e.g. "e1"
  type: "replace" | "delete" | "insert";
  targetClauseId?: string;         // replace | delete
  afterClauseId?: string | null;   // insert position (null = prepend)
  heading?: string;                // insert | replace (new heading)
  proposedText?: string;           // replace | insert
  justification: string;
}

export interface RedlineStrategy {
  posture: Posture;
  branch: string;
  edits: RedlineEdit[];
  summary: string;
}

export interface AuditEvent {
  id: string;
  kind: "proposed" | "approved" | "rejected" | "rolled_back" | "merged";
  editId?: string;
  clauseHeading?: string;
  author: string;      // posture name or "human reviewer"
  approver?: string;
  justification?: string;
  timestamp: number;
}

export interface ReviewState {
  id: number;                              // timestamp
  status: "picking" | "gating" | "merged";
  posture: Posture | null;
  branch: string | null;                   // review/{id} once picked
  base: Contract;
  contract: Contract;                      // base ⊕ applied
  pending: RedlineEdit[];
  applied: RedlineEdit[];
  rejected: RedlineEdit[];
  audit: AuditEvent[];
  strategies?: RedlineStrategy[];          // present while status === "picking"
}
```

- [ ] **Step 4: Write the failing test for the pure engine**

Create `server/services/contract-engine.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the test, verify it fails**

Run: `npm test -- contract-engine`
Expected: FAIL — `Cannot find module './contract-engine.js'` / `applyEdits is not a function`.

- [ ] **Step 6: Implement the pure engine**

Create `server/services/contract-engine.ts`:

```ts
import type { Contract, Clause, RedlineEdit } from "../../shared/types.js";

/**
 * Pure, deterministic. Applies an ordered list of clause edits to a base
 * contract and returns a new Contract. Never mutates `base`. Edits that
 * reference a missing clause are skipped (defensive — agents occasionally
 * hallucinate ids).
 */
export function applyEdits(base: Contract, edits: RedlineEdit[]): Contract {
  let clauses: Clause[] = base.clauses.map((c) => ({ ...c }));

  for (const edit of edits) {
    if (edit.type === "replace") {
      clauses = clauses.map((c) =>
        c.id === edit.targetClauseId
          ? { ...c, text: edit.proposedText ?? c.text, heading: edit.heading ?? c.heading }
          : c
      );
    } else if (edit.type === "delete") {
      clauses = clauses.filter((c) => c.id !== edit.targetClauseId);
    } else if (edit.type === "insert") {
      const newClause: Clause = {
        id: `ins-${edit.id}`,
        heading: edit.heading ?? "New clause",
        text: edit.proposedText ?? "",
      };
      if (edit.afterClauseId == null) {
        clauses = [newClause, ...clauses];
      } else {
        const idx = clauses.findIndex((c) => c.id === edit.afterClauseId);
        if (idx === -1) {
          clauses = [...clauses, newClause];
        } else {
          clauses = [...clauses.slice(0, idx + 1), newClause, ...clauses.slice(idx + 1)];
        }
      }
    }
  }

  return { meta: { ...base.meta }, clauses };
}

export function editSummary(edits: RedlineEdit[]): string {
  if (edits.length === 0) return "No changes proposed";
  const revised = edits.filter((e) => e.type === "replace").length;
  const added = edits.filter((e) => e.type === "insert").length;
  const struck = edits.filter((e) => e.type === "delete").length;
  const parts = [`${revised} revised`, `${added} added`, `${struck} struck`];
  return `${edits.length} change${edits.length === 1 ? "" : "s"} · ${parts.join(", ")}`;
}
```

- [ ] **Step 7: Run the test, verify it passes**

Run: `npm test -- contract-engine`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts shared/types.ts server/services/contract-engine.ts server/services/contract-engine.test.ts
git commit -m "feat: contract engine, redline types, vitest setup"
```

---

### Task 2: Sample contract + canned redlines

**Files:**
- Create: `server/data/sample-contract.ts`
- Test: `server/data/sample-contract.test.ts`

**Interfaces:**
- Consumes: `Contract`, `RedlineEdit`, `Posture` (shared/types); `applyEdits` (contract-engine).
- Produces: `SAMPLE_CONTRACT: Contract`; `CANNED_REDLINES: Record<Posture, RedlineEdit[]>`.

- [ ] **Step 1: Write the failing test**

Create `server/data/sample-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "./sample-contract.js";
import { applyEdits } from "../services/contract-engine.js";

describe("sample contract", () => {
  it("has at least 7 clauses with unique ids", () => {
    expect(SAMPLE_CONTRACT.clauses.length).toBeGreaterThanOrEqual(7);
    const ids = SAMPLE_CONTRACT.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("canned redlines exist for all three postures", () => {
    expect(CANNED_REDLINES.aggressive.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.balanced.length).toBeGreaterThan(0);
    expect(CANNED_REDLINES.minimal.length).toBeGreaterThan(0);
  });

  it("every replace/delete edit targets a real clause id", () => {
    const ids = new Set(SAMPLE_CONTRACT.clauses.map((c) => c.id));
    for (const posture of ["aggressive", "balanced", "minimal"] as const) {
      for (const e of CANNED_REDLINES[posture]) {
        if (e.type === "replace" || e.type === "delete") {
          expect(ids.has(e.targetClauseId!), `${posture}/${e.id} -> ${e.targetClauseId}`).toBe(true);
        }
      }
    }
  });

  it("applying any posture's canned redlines yields a valid contract", () => {
    for (const posture of ["aggressive", "balanced", "minimal"] as const) {
      const out = applyEdits(SAMPLE_CONTRACT, CANNED_REDLINES[posture]);
      expect(out.clauses.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- sample-contract`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the sample contract + canned redlines**

Create `server/data/sample-contract.ts`:

```ts
import type { Contract, RedlineEdit, Posture } from "../../shared/types.js";

export const SAMPLE_CONTRACT: Contract = {
  meta: {
    title: "Master Services Agreement",
    parties: ["Northwind Software, Inc. (\"Provider\")", "Acme Corp. (\"Customer\")"],
    version: 1,
    lastApproved: null,
  },
  clauses: [
    { id: "services", heading: "1. Services", text: "Provider will make its cloud software platform available to Customer as a subscription service during the Term." },
    { id: "fees", heading: "2. Fees & Payment", text: "Customer will pay all fees within thirty (30) days of the invoice date. Late amounts accrue interest at 1.5% per month." },
    { id: "term", heading: "3. Term & Renewal", text: "This Agreement begins on the Effective Date and continues for twelve (12) months. It automatically renews for successive twelve (12) month terms unless either party gives notice of non-renewal at least ninety (90) days before the end of the then-current term." },
    { id: "liability", heading: "4. Limitation of Liability", text: "Neither party's aggregate liability under this Agreement is limited. Each party is fully responsible for all damages of any kind arising from its performance." },
    { id: "indemnity", heading: "5. Indemnification", text: "Customer will indemnify and defend Provider against any and all claims arising from Customer's use of the services, including claims of intellectual property infringement." },
    { id: "data", heading: "6. Data & IP Ownership", text: "All data submitted to the platform, and any derivatives or analytics generated from it, are owned by Provider and may be used for any purpose." },
    { id: "confidentiality", heading: "7. Confidentiality", text: "Each party will protect the other's Confidential Information for a period of two (2) years following disclosure." },
    { id: "law", heading: "8. Governing Law", text: "This Agreement is governed by the laws of the State of New York, without regard to its conflict-of-laws principles." },
  ],
};

// Canned redlines used when no Anthropic key is configured, so the full
// workflow is clickable offline. Each posture takes a distinct stance.
export const CANNED_REDLINES: Record<Posture, RedlineEdit[]> = {
  aggressive: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the fees paid by Customer in the three (3) months preceding the claim. Neither party is liable for indirect, incidental, or consequential damages.", justification: "Unlimited liability is unacceptable; cap at 3 months' fees and exclude consequential damages." },
    { id: "e2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims arising from its own breach or negligence. Provider will indemnify Customer against IP infringement claims relating to the platform.", justification: "One-sided indemnity flipped to mutual; IP infringement risk shifted to Provider." },
    { id: "e3", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer owns all data it submits and all derivatives. Provider may process the data solely to provide the services and may not use it for any other purpose.", justification: "Customer must own its data; strike Provider's broad reuse rights." },
    { id: "e4", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement runs for twelve (12) months and does not auto-renew. Renewal requires written agreement of both parties.", justification: "Remove auto-renewal entirely." },
    { id: "e5", type: "replace", targetClauseId: "fees", heading: "2. Fees & Payment", proposedText: "Customer will pay undisputed fees within forty-five (45) days of invoice. Late amounts accrue interest at 0.5% per month.", justification: "Extend payment window and reduce penalty interest." },
  ],
  balanced: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the total fees paid in the twelve (12) months preceding the claim, except for breaches of confidentiality or indemnification obligations.", justification: "Mutual 12-month cap with standard carve-outs — market standard." },
    { id: "e2", type: "replace", targetClauseId: "indemnity", heading: "5. Indemnification", proposedText: "Each party will indemnify the other for third-party claims caused by its breach of this Agreement. Provider will indemnify Customer for IP infringement by the platform.", justification: "Make indemnity mutual and tie it to breach." },
    { id: "e3", type: "replace", targetClauseId: "data", heading: "6. Data & IP Ownership", proposedText: "Customer retains ownership of its data. Provider may use aggregated, de-identified data to improve the services.", justification: "Customer owns data; Provider keeps narrow de-identified improvement rights." },
    { id: "e4", type: "insert", afterClauseId: "confidentiality", heading: "7a. Data Security", proposedText: "Provider will maintain administrative, technical, and physical safeguards aligned with SOC 2 Type II and will notify Customer of any data breach within seventy-two (72) hours.", justification: "Add a baseline security and breach-notice obligation." },
  ],
  minimal: [
    { id: "e1", type: "replace", targetClauseId: "liability", heading: "4. Limitation of Liability", proposedText: "Each party's aggregate liability is capped at the total fees paid in the twelve (12) months preceding the claim.", justification: "Add a simple mutual liability cap; leave the rest as-is." },
    { id: "e2", type: "replace", targetClauseId: "term", heading: "3. Term & Renewal", proposedText: "This Agreement begins on the Effective Date and continues for twelve (12) months. It automatically renews for successive twelve (12) month terms unless either party gives notice of non-renewal at least thirty (30) days before the end of the then-current term.", justification: "Shorten the non-renewal notice from 90 to 30 days." },
  ],
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- sample-contract`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/data/sample-contract.ts server/data/sample-contract.test.ts
git commit -m "feat: sample SaaS MSA contract and canned redlines"
```

---

### Task 3: Redline agent (real Claude + canned fallback)

**Files:**
- Modify: `server/services/claude.ts` (add `runRedlinePrompt` + export a redline schema parser)
- Create: `server/agents/redline.ts`
- Test: `server/agents/redline.test.ts`

**Interfaces:**
- Consumes: `Contract`, `RedlineEdit`, `Posture`, `RedlineStrategy` (shared/types); `hasAnthropicKey`, `getClient` (claude.ts); `SAMPLE_CONTRACT`, `CANNED_REDLINES`, `editSummary`.
- Produces: `parseRedlineEdits(text: string): RedlineEdit[]` (claude.ts); `POSTURES: { posture: Posture; label: string; role: string }[]` and `runRedlineAgent(contract: Contract, posture: Posture): Promise<RedlineEdit[]>` (redline.ts).

- [ ] **Step 1: Export `getClient` and add the redline prompt to `claude.ts`**

In `server/services/claude.ts`, change `function getClient()` to `export function getClient()`. Then append:

```ts
import type { Contract, RedlineEdit } from "../../shared/types.js";

const REDLINE_SCHEMA_HINT = `Respond with ONLY a valid JSON array. Each element is one redline edit:
[
  {
    "id": "e1",
    "type": "replace" | "delete" | "insert",
    "targetClauseId": "<clause id to replace or delete>",   // omit for insert
    "afterClauseId": "<clause id to insert after, or null for top>", // insert only
    "heading": "<new clause heading>",                         // replace/insert
    "proposedText": "<new clause text in plain contract English>", // replace/insert
    "justification": "<one sentence, why this protects your client>"
  }
]
Only use clause ids that appear in the contract. Propose 2-5 edits. No prose outside the JSON.`;

export function parseRedlineEdits(text: string): RedlineEdit[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Agent did not return a JSON array");
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Redline output was not an array");
  return parsed.map((e, i) => ({
    id: typeof e.id === "string" ? e.id : `e${i + 1}`,
    type: e.type,
    targetClauseId: e.targetClauseId,
    afterClauseId: e.afterClauseId ?? null,
    heading: e.heading,
    proposedText: e.proposedText,
    justification: e.justification ?? "",
  })) as RedlineEdit[];
}

export async function runRedlinePrompt(contract: Contract, role: string): Promise<RedlineEdit[]> {
  const clauseList = contract.clauses
    .map((c) => `[id: ${c.id}] ${c.heading}\n${c.text}`)
    .join("\n\n");

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a contract attorney. ${role}

You are redlining this ${contract.meta.title} on behalf of the Customer. The clauses, each with a stable [id], are:

${clauseList}

${REDLINE_SCHEMA_HINT}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseRedlineEdits(text);
}
```

- [ ] **Step 2: Write the failing test**

Create `server/agents/redline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runRedlineAgent, POSTURES } from "./redline.js";
import { parseRedlineEdits } from "../services/claude.js";
import { SAMPLE_CONTRACT, CANNED_REDLINES } from "../data/sample-contract.js";

describe("parseRedlineEdits", () => {
  it("extracts a JSON array embedded in prose", () => {
    const out = parseRedlineEdits('Here you go: [{"id":"e1","type":"delete","targetClauseId":"law","justification":"x"}] done');
    expect(out).toHaveLength(1);
    expect(out[0].targetClauseId).toBe("law");
    expect(out[0].afterClauseId).toBeNull();
  });

  it("throws on missing array", () => {
    expect(() => parseRedlineEdits("no json here")).toThrow();
  });
});

describe("runRedlineAgent (no key → canned)", () => {
  it("returns the canned redlines for each posture when no Anthropic key is set", async () => {
    for (const p of POSTURES) {
      const edits = await runRedlineAgent(SAMPLE_CONTRACT, p.posture);
      expect(edits).toEqual(CANNED_REDLINES[p.posture]);
    }
  });

  it("exposes exactly three postures", () => {
    expect(POSTURES.map((p) => p.posture).sort()).toEqual(["aggressive", "balanced", "minimal"]);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npm test -- redline`
Expected: FAIL — `./redline.js` not found.

- [ ] **Step 4: Implement the redline agent**

Create `server/agents/redline.ts`:

```ts
import type { Contract, RedlineEdit, Posture } from "../../shared/types.js";
import { hasAnthropicKey, runRedlinePrompt } from "../services/claude.js";
import { CANNED_REDLINES } from "../data/sample-contract.js";

export const POSTURES: { posture: Posture; label: string; role: string }[] = [
  {
    posture: "aggressive",
    label: "Aggressive",
    role: "You take the most protective possible stance for the Customer. Push hard: cap liability tightly, flip one-sided terms, strip the vendor's data rights, and remove auto-renewal. You would rather over-ask and negotiate back.",
  },
  {
    posture: "balanced",
    label: "Balanced",
    role: "You aim for fair, market-standard terms a reasonable counterparty would accept with little friction. Mutual caps, standard carve-outs, sensible security obligations.",
  },
  {
    posture: "minimal",
    label: "Minimal",
    role: "You make only the few highest-impact changes needed to make the contract acceptable, leaving everything else untouched to speed signing.",
  },
];

/**
 * Returns structured clause edits for a posture. Uses real Claude when a key
 * is configured; otherwise falls back to canned redlines. On a parse failure,
 * retries once, then falls back to canned so the demo never dead-ends.
 */
export async function runRedlineAgent(contract: Contract, posture: Posture): Promise<RedlineEdit[]> {
  const cfg = POSTURES.find((p) => p.posture === posture)!;
  if (!hasAnthropicKey()) {
    return CANNED_REDLINES[posture];
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const edits = await runRedlinePrompt(contract, cfg.role);
      if (edits.length > 0) return edits;
    } catch {
      // retry once, then fall through to canned
    }
  }
  return CANNED_REDLINES[posture];
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npm test -- redline`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/services/claude.ts server/agents/redline.ts server/agents/redline.test.ts
git commit -m "feat: redline agent with Claude prompt and canned fallback"
```

---

### Task 4: Review service — start & pick (on local-fs)

**Files:**
- Create: `server/services/review.ts`
- Test: `server/services/review.test.ts`

**Interfaces:**
- Consumes: `getMesa` (mesa.ts); `applyEdits`, `editSummary`; `SAMPLE_CONTRACT`; `runRedlineAgent`, `POSTURES`; `emitActivity` (events.ts); types `Contract`, `ReviewState`, `RedlineStrategy`, `Posture`, `AuditEvent`.
- Produces: `seedContract(): Promise<void>`; `getContract(): Promise<Contract>`; `startReview(id: number): Promise<RedlineStrategy[]>`; `pickStrategy(id: number, posture: Posture): Promise<ReviewState>`; `getActiveReview(): Promise<ReviewState | null>`. Constants for file paths and branch naming used by Task 5.

> **Context for the implementer:** `getMesa()` returns a `MesaService` with `readFile(branch, path)`, `writeFile(branch, path, content)`, `createBranch(name, from)`, `mergeBranch(name, into)`, `deleteBranch(name)`, `listFiles(branch, dir)`. On the default local-fs backend, branches are directories under `mesa-repo/branches/`. All files are JSON we serialize ourselves. Tests run against local-fs (no key), which is the default `getMesa()`.

- [ ] **Step 1: Write the failing test**

Create `server/services/review.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- review`
Expected: FAIL — `./review.js` not found.

- [ ] **Step 3: Implement start & pick in `review.ts`**

Create `server/services/review.ts`:

```ts
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
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- review`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/review.ts server/services/review.test.ts
git commit -m "feat: review service — start swarm and pick strategy"
```

---

### Task 5: Review service — approve / reject / merge / rollback

**Files:**
- Modify: `server/services/review.ts`
- Test: `server/services/review-gate.test.ts`

**Interfaces:**
- Consumes: everything from Task 4 (same module), `applyEdits`.
- Produces: `approveNext(id: number, approver: string): Promise<ReviewState>`; `rejectNext(id: number, approver: string): Promise<ReviewState>`; `rollbackLast(id: number, approver: string): Promise<ReviewState>`; `mergeReview(id: number): Promise<Contract>`; `getAuditTrail(): Promise<AuditEvent[]>`.

- [ ] **Step 1: Write the failing test**

Create `server/services/review-gate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- review-gate`
Expected: FAIL — `approveNext` not exported.

- [ ] **Step 3: Implement the gate operations in `review.ts`**

Append to `server/services/review.ts`:

```ts
const AUDIT_WORK_FILE = "audit.json";

async function loadGate(id: number) {
  const branch = reviewBranch(id);
  const base = await readJson<Contract>(branch, CONTRACT_FILE, await getContract());
  const pending = await readJson<import("../../shared/types.js").RedlineEdit[]>(branch, "pending.json", []);
  const applied = await readJson<import("../../shared/types.js").RedlineEdit[]>(branch, "applied.json", []);
  const rejected = await readJson<import("../../shared/types.js").RedlineEdit[]>(branch, "rejected.json", []);
  const audit = await readJson<AuditEvent[]>(branch, AUDIT_WORK_FILE, []);
  return { branch, base, pending, applied, rejected, audit };
}

async function saveGate(
  branch: string,
  base: Contract,
  pending: import("../../shared/types.js").RedlineEdit[],
  applied: import("../../shared/types.js").RedlineEdit[],
  rejected: import("../../shared/types.js").RedlineEdit[],
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
```

> **Note on `listFiles("main", "")`:** local-fs `listFiles` reads the branch directory; passing `""` lists the branch root. The test asserts working files are absent from main — they are, because we only ever `writeJson` them on the review branch.

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- review-gate`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all files green).

- [ ] **Step 6: Commit**

```bash
git add server/services/review.ts server/services/review-gate.test.ts
git commit -m "feat: approval gate — approve, reject, rollback, merge, audit"
```

---

### Task 6: API routes + server seed + repo rename

**Files:**
- Modify: `server/routes/api.ts` (remove portfolio routes; add review routes)
- Modify: `server/index.ts` (seed contract instead of portfolio)
- Modify: `server/services/mesa-sdk.ts` (`REPO_NAME`)
- Modify: `server/services/mesa-mount.ts` (`REPO_NAME`)

**Interfaces:**
- Consumes: all `review.ts` exports; `getContract`.
- Produces HTTP endpoints: `GET /api/contract`, `POST /api/review/start`, `POST /api/review/pick` `{posture}`, `POST /api/review/approve`, `POST /api/review/reject`, `POST /api/review/rollback`, `POST /api/review/merge`, `GET /api/review/active`, `GET /api/audit`. Keeps `/api/settings*`, `/api/activity`, `/api/changes`, `/api/webhooks/*`, `/api/repo/tags`, `/api/diff`.

- [ ] **Step 1: Rename the Mesa repo constant**

In `server/services/mesa-sdk.ts` line 13, change:
```ts
const REPO_NAME = "contract-redline";
```
In `server/services/mesa-mount.ts`, find the `REPO_NAME` constant (same string `"portfolio-advisor"`) and change it to `"contract-redline"`.

- [ ] **Step 2: Replace portfolio routes with review routes in `api.ts`**

In `server/routes/api.ts`: delete the imports and routes for portfolio/analysis/history/playbook. Specifically remove the imports of `getQuotes`, `runAgent`, `fundamentalsAgent`, `sentimentAgent`, `technicalAgent`, `saveRoundSnapshot`, `listHistoryRounds`, `loadRoundSnapshot`, `readPlaybook`, `appendEntry`, `diffAppended`, `writePlaybook`, and the `snapshotMain`, `runAnalysis`, `mergePlaybooksAndPortfolio` helpers and the routes `/portfolio`, `/analyze`, `/replay`, `/merge`, `/dismiss`, `/history`, `/playbook`, plus the module-level `lastRound`/`lastPriceMap`/`lastPlaybookBefore`. Keep `/diff`, `/settings*`, `/activity`, `/webhooks/*`, `/changes`, `/repo/tags`, `/reset`.

Add this import near the top:
```ts
import {
  getContract, startReview, pickStrategy, approveNext, rejectNext,
  rollbackLast, mergeReview, getActiveReview, getAuditTrail,
} from "../services/review.js";
import type { Posture } from "../../shared/types.js";
```

Add these routes (place them after the `/diff` route):
```ts
apiRouter.get("/contract", async (_req, res) => {
  try {
    res.json(await getContract());
  } catch {
    res.status(500).json({ error: "Failed to load contract" });
  }
});

apiRouter.post("/review/start", async (_req, res) => {
  try {
    const id = Date.now();
    const strategies = await startReview(id);
    res.json({ id, strategies });
  } catch (error) {
    console.error("Review start failed:", error);
    res.status(500).json({ error: "Failed to start review" });
  }
});

apiRouter.post("/review/pick", async (req, res) => {
  try {
    const { id, posture } = req.body as { id: number; posture: Posture };
    if (!id || !posture) { res.status(400).json({ error: "id and posture required" }); return; }
    res.json(await pickStrategy(id, posture));
  } catch (error) {
    console.error("Pick failed:", error);
    res.status(500).json({ error: "Failed to pick strategy" });
  }
});

apiRouter.post("/review/approve", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await approveNext(id, "you"));
  } catch { res.status(500).json({ error: "Approve failed" }); }
});

apiRouter.post("/review/reject", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await rejectNext(id, "you"));
  } catch { res.status(500).json({ error: "Reject failed" }); }
});

apiRouter.post("/review/rollback", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json(await rollbackLast(id, "you"));
  } catch { res.status(500).json({ error: "Rollback failed" }); }
});

apiRouter.post("/review/merge", async (req, res) => {
  try {
    const { id } = req.body as { id: number };
    res.json({ contract: await mergeReview(id) });
  } catch (error) {
    console.error("Merge failed:", error);
    res.status(500).json({ error: "Merge failed" });
  }
});

apiRouter.get("/review/active", async (_req, res) => {
  try {
    res.json({ review: await getActiveReview() });
  } catch { res.status(500).json({ error: "Failed to load active review" }); }
});

apiRouter.get("/audit", async (_req, res) => {
  try {
    res.json({ events: await getAuditTrail() });
  } catch { res.status(500).json({ error: "Failed to load audit trail" }); }
});
```

Also update `/settings` and `/reset`: in `/settings`, change every `"portfolio-advisor"` literal to `"contract-redline"`. In `/reset`, replace the portfolio/playbook/history reset body with:
```ts
apiRouter.post("/reset", async (_req, res) => {
  try {
    const { SAMPLE_CONTRACT } = await import("../data/sample-contract.js");
    await getMesa().writeFile("main", "contract.json", JSON.stringify(SAMPLE_CONTRACT, null, 2));
    await getMesa().writeFile("main", "audit-log.json", JSON.stringify([]));
    await getMesa().writeFile("main", "active-review.json", JSON.stringify(null));
    emitActivity("file_written", "Demo reset — contract restored to v1, audit cleared");
    res.json({ ok: true });
  } catch (error) {
    console.error("Reset failed:", error);
    res.status(500).json({ error: "Reset failed" });
  }
});
```

- [ ] **Step 3: Seed the contract on boot in `index.ts`**

In `server/index.ts`, replace the portfolio seed block (the `try { await getMesa().readFile("main", "portfolio.json") } catch { ... }`) with:
```ts
  const { seedContract } = await import("./services/review.js");
  await seedContract();
  console.log("Contract seeded on main branch");
```
Also remove the now-unused `DEFAULT_PORTFOLIO` export and its `import type { Portfolio }` if nothing else uses them (the webhook handler does not). Leave the Mesa webhook handler intact.

- [ ] **Step 4: Type-check the server**

Run: `npx tsc -p tsconfig.server.json --noEmit`
Expected: PASS (no errors). If errors reference deleted portfolio imports still used elsewhere, those files are removed in Task 11 — for now ensure `api.ts`, `index.ts`, and the mesa backends type-check; if a deleted-route helper is still imported, remove that import.

- [ ] **Step 5: Manually verify the endpoints on local-fs**

Run the server in the background and exercise the flow:
```bash
rm -rf mesa-repo
(npm run dev:server &) ; sleep 3
curl -s localhost:3001/api/contract | head -c 200; echo
ID=$(curl -s -X POST localhost:3001/api/review/start | sed 's/.*"id":\([0-9]*\).*/\1/')
echo "review id=$ID"
curl -s -X POST localhost:3001/api/review/pick -H 'content-type: application/json' -d "{\"id\":$ID,\"posture\":\"minimal\"}" | head -c 200; echo
curl -s -X POST localhost:3001/api/review/approve -H 'content-type: application/json' -d "{\"id\":$ID}" | head -c 200; echo
curl -s localhost:3001/api/review/active | head -c 200; echo
curl -s localhost:3001/api/audit | head -c 200; echo
pkill -f "tsx watch server/index.ts" || true
```
Expected: `/contract` returns the MSA JSON; start returns an `id` + 3 strategies; pick returns `status:"gating"`; approve returns `applied` length 1; active rehydrates; audit lists events.

- [ ] **Step 6: Commit**

```bash
git add server/routes/api.ts server/index.ts server/services/mesa-sdk.ts server/services/mesa-mount.ts
git commit -m "feat: review API routes, contract seed, rename Mesa repo"
```

---

### Task 7: Client API hooks + type re-exports

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/hooks/useApi.ts`

**Interfaces:**
- Produces hooks: `useContract()` → `{ contract, loading, refresh }`; `useReview()` → `{ review, strategies, reviewId, start, pick, approve, reject, rollback, merge, refreshActive, busy }`; `useAuditTrail(refreshKey)` → `{ events, refresh }`. Keeps `useSettings`, `useWebhookTargets`, `useChanges`, `useRepoTags`.

- [ ] **Step 1: Add type re-exports**

In `client/src/types.ts`, add to the big `export type { ... } from "@shared/types.js"` block these names: `Clause`, `ContractMeta`, `Contract`, `Posture`, `RedlineEdit`, `RedlineStrategy`, `AuditEvent`, `ReviewState`.

- [ ] **Step 2: Remove portfolio hooks and add review hooks**

In `client/src/hooks/useApi.ts`, remove `usePortfolio`, `useAnalysis`, `useHistory`, `usePlaybook` (and the now-unused `PortfolioWithPrices`, `AnalysisState`, `HistoryRoundSummary`, `MesaDiffEntry` imports if unused). Keep `useSettings`, `useWebhookTargets`, `useChanges`, `useRepoTags` unchanged. Add:

```ts
import type { Contract, RedlineStrategy, ReviewState, AuditEvent, Posture } from "../types.js";

export function useContract(refreshKey?: unknown) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contract");
      setContract(await res.json());
    } catch { console.error("Failed to fetch contract"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { contract, loading, refresh };
}

export function useReview(onChange?: () => void) {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [strategies, setStrategies] = useState<RedlineStrategy[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshActive = useCallback(async () => {
    const res = await fetch("/api/review/active");
    const data = await res.json();
    const r: ReviewState | null = data.review;
    setReview(r);
    if (r) {
      setReviewId(r.id);
      if (r.status === "picking" && r.strategies) setStrategies(r.strategies);
    }
  }, []);

  useEffect(() => { refreshActive(); }, [refreshActive]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/review/start", { method: "POST" });
      const data = await res.json();
      setReviewId(data.id);
      setStrategies(data.strategies);
      await refreshActive();
    } finally { setBusy(false); }
  }, [refreshActive]);

  const post = useCallback(async (path: string, body: object) => {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      onChange?.();
      return data;
    } finally { setBusy(false); }
  }, [onChange]);

  const pick = useCallback(async (posture: Posture) => {
    const id = reviewId; if (!id) return;
    const state = await post("/api/review/pick", { id, posture });
    setReview(state);
  }, [reviewId, post]);

  const approve = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/approve", { id })); }, [reviewId, post]);
  const reject = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/reject", { id })); }, [reviewId, post]);
  const rollback = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/rollback", { id })); }, [reviewId, post]);
  const merge = useCallback(async () => {
    const id = reviewId; if (!id) return;
    await post("/api/review/merge", { id });
    setReview(null); setStrategies([]); setReviewId(null);
    onChange?.();
  }, [reviewId, post, onChange]);

  return { review, strategies, reviewId, busy, start, pick, approve, reject, rollback, merge, refreshActive };
}

export function useAuditTrail(refreshKey: unknown) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch { console.error("Failed to fetch audit"); }
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { events, refresh };
}
```

- [ ] **Step 3: Type-check (will surface App.tsx breakage — expected until Task 10)**

Run: `npx tsc -p tsconfig.server.json --noEmit` is server-only; for the client there is no standalone tsconfig, so verify via:
Run: `npm run build 2>&1 | head -40`
Expected: errors ONLY in `client/src/App.tsx` and deleted-component references (still importing removed hooks). Hooks file itself must not error on its own exports. Do not fix App.tsx here — that's Task 10.

- [ ] **Step 4: Commit**

```bash
git add client/src/types.ts client/src/hooks/useApi.ts
git commit -m "feat: client hooks for contract, review, and audit"
```

---

### Task 8: ContractView + RedlineComparison components

**Files:**
- Create: `client/src/components/ContractView.tsx`
- Create: `client/src/components/StrategyCard.tsx`
- Create: `client/src/components/RedlineComparison.tsx`

**Interfaces:**
- Consumes: `Contract`, `RedlineStrategy`, `RedlineEdit`, `Posture`.
- Produces: `<ContractView contract={Contract} />`; `<RedlineComparison strategies={RedlineStrategy[]} onPick={(p: Posture) => void} busy={boolean} />`.

> **Design language (match existing):** canvas/ink palette, `font-mono` labels via `.section-label`, `.serif-quote`, `.display-heading`, borders `border-line`, accent `text-mesa`. Diff colors use existing `.diff-added` (green) / `.diff-deleted` (red) classes from `index.css`. Reveal animation via `className="reveal"` with `style={{ animationDelay }}`.

- [ ] **Step 1: ContractView — render clauses**

Create `client/src/components/ContractView.tsx`:

```tsx
import type { Contract } from "../types.js";

export function ContractView({ contract }: { contract: Contract }) {
  return (
    <div className="border border-line">
      <header className="px-6 py-4 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="display-heading text-xl">{contract.meta.title}</div>
          <div className="font-mono text-[11px] text-mute mt-1">{contract.meta.parties.join("  ·  ")}</div>
        </div>
        <div className="font-mono text-xs text-mute">
          v{contract.meta.version}
          {contract.meta.lastApproved && <span className="text-mute-2"> · approved</span>}
        </div>
      </header>
      <div className="divide-y divide-line/60">
        {contract.clauses.map((c, i) => (
          <div key={c.id} className="px-6 py-4 reveal" style={{ animationDelay: `${0.02 * i}s` }}>
            <div className="font-mono text-xs tracking-wide text-ink mb-1">{c.heading}</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: StrategyCard — one posture's redline summary + preview**

Create `client/src/components/StrategyCard.tsx`:

```tsx
import type { RedlineStrategy, Posture } from "../types.js";

const POSTURE_META: Record<Posture, { color: string; label: string; sigil: string }> = {
  aggressive: { color: "text-down",          label: "Aggressive", sigil: "▲" },
  balanced:   { color: "text-fundamentals",  label: "Balanced",   sigil: "◆" },
  minimal:    { color: "text-mute",          label: "Minimal",    sigil: "●" },
};

export function StrategyCard({ strategy, onPick, busy }: { strategy: RedlineStrategy; onPick: () => void; busy: boolean }) {
  const meta = POSTURE_META[strategy.posture];
  return (
    <article className="bg-canvas border border-line hover:border-ink/30 p-6 flex flex-col w-full transition-colors">
      <header className="flex items-center gap-3 mb-4">
        <span className={`text-xl ${meta.color}`}>{meta.sigil}</span>
        <div className="flex-1">
          <h3 className="font-mono text-sm tracking-wide uppercase text-ink">{meta.label}</h3>
          <div className="section-label mt-0.5">{strategy.summary}</div>
        </div>
      </header>
      <ul className="space-y-3 mb-5 flex-1">
        {strategy.edits.map((e) => (
          <li key={e.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-[10px] tracking-widest uppercase mt-0.5 shrink-0 w-12 ${e.type === "delete" ? "text-down" : e.type === "insert" ? "text-up" : "text-mute"}`}>
                {e.type === "replace" ? "revise" : e.type}
              </span>
              <span className="text-ink-2 leading-snug">
                <span className="font-mono text-ink">{e.heading ?? e.targetClauseId}</span>
                <span className="text-mute"> — {e.justification}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <button
        onClick={onPick}
        disabled={busy}
        className="group/btn mt-auto w-full flex items-center justify-between gap-3 px-5 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-40"
      >
        <span className="font-mono text-xs tracking-widest uppercase">Take to approval</span>
        <span className="font-mono text-base group-hover/btn:translate-x-1 transition-transform">→</span>
      </button>
    </article>
  );
}
```

- [ ] **Step 3: RedlineComparison — the 3-up grid**

Create `client/src/components/RedlineComparison.tsx`:

```tsx
import type { RedlineStrategy, Posture } from "../types.js";
import { StrategyCard } from "./StrategyCard.js";

export function RedlineComparison({ strategies, onPick, busy }: { strategies: RedlineStrategy[]; onPick: (p: Posture) => void; busy: boolean }) {
  return (
    <section className="reveal">
      <header className="flex items-end justify-between mb-6 pb-4 border-b border-line">
        <h2 className="display-heading text-2xl">Pick a redline strategy</h2>
        <span className="font-mono text-xs text-mute">3 agents · isolated branches</span>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-line items-stretch">
        {strategies.map((s, i) => (
          <div key={s.posture} className="border-b border-r last:border-r-0 border-line reveal lg:border-b-0 flex" style={{ animationDelay: `${0.2 + i * 0.1}s` }}>
            <StrategyCard strategy={s} onPick={() => onPick(s.posture)} busy={busy} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verify the components compile**

Run: `npm run build 2>&1 | grep -E "ContractView|StrategyCard|RedlineComparison" || echo "no component errors"`
Expected: `no component errors` (App.tsx errors may still appear elsewhere — ignore until Task 10).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ContractView.tsx client/src/components/StrategyCard.tsx client/src/components/RedlineComparison.tsx
git commit -m "feat: contract view and redline strategy comparison UI"
```

---

### Task 9: ApprovalGate component (the hero)

**Files:**
- Create: `client/src/components/ApprovalGate.tsx`

**Interfaces:**
- Consumes: `ReviewState`, `RedlineEdit`.
- Produces: `<ApprovalGate review={ReviewState} onApprove onReject onRollback onMerge busy />` where the callbacks are `() => void` and `busy: boolean`.

- [ ] **Step 1: Implement the gate**

Create `client/src/components/ApprovalGate.tsx`:

```tsx
import type { ReviewState, RedlineEdit } from "../types.js";

function clauseBefore(review: ReviewState, edit: RedlineEdit): string | null {
  if (edit.type === "insert") return null;
  return review.base.clauses.find((c) => c.id === edit.targetClauseId)?.text ?? null;
}

export function ApprovalGate({
  review, onApprove, onReject, onRollback, onMerge, busy,
}: {
  review: ReviewState;
  onApprove: () => void;
  onReject: () => void;
  onRollback: () => void;
  onMerge: () => void;
  busy: boolean;
}) {
  const total = review.pending.length + review.applied.length + review.rejected.length;
  const done = review.applied.length + review.rejected.length;
  const current = review.pending[0];

  return (
    <div className="border border-line">
      <header className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div>
          <div className="section-label">Approval gate</div>
          <div className="font-mono text-[10px] text-mute mt-0.5">
            Paused on Mesa · resumes from exact state — close the tab, it's still here
          </div>
        </div>
        <div className="font-mono text-xs text-mute">{done}/{total} reviewed</div>
      </header>

      {current ? (
        <div className="px-6 py-6 reveal">
          <div className="font-mono text-xs text-mesa mb-2">
            {current.type === "replace" ? "REVISE" : current.type.toUpperCase()} · {current.heading ?? current.targetClauseId}
          </div>
          {clauseBefore(review, current) && (
            <div className="diff-deleted px-3 py-2 text-sm text-ink-2 line-through/0 mb-2 font-serif">
              {clauseBefore(review, current)}
            </div>
          )}
          {current.type !== "delete" && (
            <div className="diff-added px-3 py-2 text-sm text-ink mb-3 font-serif">{current.proposedText}</div>
          )}
          <p className="serif-quote text-sm text-mute mb-5">Why: {current.justification}</p>

          <div className="flex gap-3">
            <button onClick={onApprove} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 bg-ink text-canvas hover:bg-up transition-colors disabled:opacity-40">Approve</button>
            <button onClick={onReject} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 border border-line text-ink hover:border-down hover:text-down transition-colors disabled:opacity-40">Reject</button>
            {review.applied.length > 0 && (
              <button onClick={onRollback} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-5 py-2.5 border border-line text-mute hover:text-ink ml-auto transition-colors disabled:opacity-40">↶ Roll back last</button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-6 py-8 text-center reveal">
          <p className="serif-quote text-lg text-ink-2 mb-1">All clauses reviewed.</p>
          <p className="font-mono text-xs text-mute mb-5">{review.applied.length} approved · {review.rejected.length} rejected</p>
          <button onClick={onMerge} disabled={busy} className="font-mono text-xs uppercase tracking-widest px-6 py-3 bg-mesa text-canvas hover:bg-ink transition-colors disabled:opacity-40">
            Merge approved edits → main
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build 2>&1 | grep -E "ApprovalGate" || echo "no ApprovalGate errors"`
Expected: `no ApprovalGate errors`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ApprovalGate.tsx
git commit -m "feat: clause-by-clause approval gate component"
```

---

### Task 10: AuditTrail component + App.tsx rewire

**Files:**
- Create: `client/src/components/AuditTrail.tsx`
- Modify: `client/src/App.tsx` (rewrite hero + sections; remove portfolio wiring)

**Interfaces:**
- Consumes: `useContract`, `useReview`, `useAuditTrail`, `useSettings`, `useWebhookTargets`, `useChanges`, `useRepoTags`, `useMesaEvents`; components `ContractView`, `RedlineComparison`, `ApprovalGate`, `AuditTrail`, `ActivityFeed`, `BranchVisualization`, `SettingsPanel`.

- [ ] **Step 1: AuditTrail component**

Create `client/src/components/AuditTrail.tsx`:

```tsx
import type { AuditEvent } from "../types.js";

const KIND_META: Record<AuditEvent["kind"], { color: string; label: string }> = {
  proposed:    { color: "text-mute",         label: "proposed" },
  approved:    { color: "text-up",           label: "approved" },
  rejected:    { color: "text-down",         label: "rejected" },
  rolled_back: { color: "text-mesa",         label: "rolled back" },
  merged:      { color: "text-fundamentals", label: "merged" },
};

function rel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="serif-quote text-lg text-mute">No decisions yet. Approvals and rejections appear here, immutably.</p>
      </div>
    );
  }
  return (
    <div className="border border-line">
      <header className="px-6 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="section-label">Audit trail</div>
          <div className="font-mono text-[10px] text-mute mt-0.5">Immutable — every decision on the record, author and justification preserved</div>
        </div>
        <div className="font-mono text-xs text-mute">{events.length} event{events.length !== 1 ? "s" : ""}</div>
      </header>
      <div className="divide-y divide-line/60 max-h-[480px] overflow-y-auto">
        {events.map((e, i) => {
          const meta = KIND_META[e.kind];
          return (
            <div key={e.id} className="px-6 py-3 reveal flex items-baseline gap-4" style={{ animationDelay: `${0.02 * i}s` }}>
              <span className={`font-mono text-[10px] uppercase tracking-widest w-20 shrink-0 ${meta.color}`}>{meta.label}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{e.clauseHeading ?? e.justification}</div>
                <div className="font-mono text-[10px] text-mute mt-0.5">
                  {e.author}{e.approver ? ` → ${e.approver}` : ""} · {rel(e.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `App.tsx`**

Replace the body of `client/src/App.tsx` with the version below. It keeps the header (backend chip, version, clear-keys button, settings cog + callout), `SettingsPanel`, and `BranchVisualization`, and replaces the portfolio sections with the redline arc. (Keep the existing `SettingsCog` function at the bottom and the existing settings-callout markup exactly as they are; only the imports, hooks, and `<main>` sections change.)

```tsx
import { useState, useCallback, useEffect } from "react";
import { useSettings, useWebhookTargets, useChanges, useRepoTags, useContract, useReview, useAuditTrail } from "./hooks/useApi.js";
import { useMesaEvents } from "./hooks/useMesaEvents.js";
import { ContractView } from "./components/ContractView.js";
import { RedlineComparison } from "./components/RedlineComparison.js";
import { ApprovalGate } from "./components/ApprovalGate.js";
import { AuditTrail } from "./components/AuditTrail.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { BranchVisualization, type VizPhase } from "./components/BranchVisualization.js";
import { SettingsPanel } from "./components/SettingsPanel.js";

export default function App() {
  const { backends, loading: settingsLoading, mesaInfo, keys, saveKeys, clearKeys, resetDemo, switchBackend } = useSettings();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { contract, refresh: refreshContract } = useContract(refreshKey);
  const onReviewChange = useCallback(() => { refreshContract(); bump(); }, [refreshContract, bump]);
  const { review, strategies, busy, start, pick, approve, reject, rollback, merge } = useReview(onReviewChange);
  const { events: auditEvents } = useAuditTrail(refreshKey);
  const { targets: webhookTargets, create: createWebhookTarget, remove: deleteWebhookTarget } = useWebhookTargets();
  const { tags: repoTags, update: updateRepoTags } = useRepoTags();
  const { events: mesaEvents, connected: sseConnected } = useMesaEvents();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [vizGeneration, setVizGeneration] = useState(0);

  useEffect(() => { if (busy) setVizGeneration((g) => g + 1); }, [busy]);

  const activeBackend = backends.find((b) => b.active);
  const phase: "idle" | "picking" | "gating" = !review ? "idle" : review.status === "picking" ? "picking" : "gating";
  const vizPhase: VizPhase | null = phase === "picking" ? "analyze" : phase === "gating" ? "done" : null;

  return (
    <div className="min-h-screen text-ink">
      <header className="border-b border-line">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-ink flex items-center justify-center text-canvas font-display italic text-base leading-none">
              <span style={{ transform: "translateY(-1px)" }}>m</span>
            </div>
            <span className="font-mono text-xs tracking-[0.2em] uppercase">Mesa</span>
            <span className="text-mute-2 mx-2">·</span>
            <span className="font-display italic text-base text-ink-2">Contract Desk</span>
          </div>
          <div className="flex items-center gap-6">
            {activeBackend && (
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-mute">
                <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                <span>backend: {activeBackend.name}</span>
              </div>
            )}
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.3 · alpha</span>
            {(keys.mesa || keys.anthropic) && (
              <button onClick={() => setShowClearConfirm(true)} className="font-mono text-[10px] uppercase tracking-widest text-mute hover:text-down border border-line hover:border-down/40 px-3 py-1 transition-colors">
                Clear all keys
              </button>
            )}
            <div className="relative">
              <button onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }} className="text-ink-2 hover:text-mesa transition-colors p-1" aria-label="Open settings" title="Settings">
                <SettingsCog />
              </button>
              {!keys.anthropic && !settingsOpen && !hasOpenedSettings && (
                <div className="absolute right-0 top-full mt-2 settings-callout">
                  <span className="absolute -top-1 right-3 w-2 h-2 bg-ink rotate-45" />
                  <div className="bg-ink text-canvas px-4 py-2.5 font-mono text-[11px] tracking-wide whitespace-nowrap">Add API keys to use the demo</div>
                </div>
              )}
              {!keys.anthropic && !hasOpenedSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mesa settings-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-16">
        <section className="mb-20 reveal">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="section-label mb-4">A demonstration · human-in-the-loop contract review</div>
              <h1 className="display-heading text-6xl md:text-7xl leading-[0.95] tracking-tight">
                Three agents redline,<br />one human approves,<br /><span className="italic text-mesa">every change on the record.</span>
              </h1>
            </div>
            <div className="col-span-12 md:col-span-4">
              <p className="serif-quote text-lg leading-relaxed text-ink-2 mb-6">
                Three attorneys fork the contract on Mesa, each proposing a different redline posture. You approve clause-by-clause through a gate that pauses and resumes from exact state — and every decision is preserved immutably.
              </p>
              <button onClick={start} disabled={busy || !!review} className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="font-mono text-xs tracking-widest uppercase">{busy ? "Working" : review ? "Review in progress" : "Run review"}</span>
                <span className="font-mono text-base group-hover:translate-x-1 transition-transform">→</span>
              </button>
              {!keys.anthropic && (
                <button onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }} className="section-label text-mesa hover:underline cursor-pointer mt-3 block text-left">
                  Runs with canned redlines — add an Anthropic key for live agents →
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="hairline mb-20" />

        {/* 01 Contract */}
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">01</div><div className="section-label mt-4">Contract</div></aside>
          <div className="col-span-12 md:col-span-10">{contract && <ContractView contract={contract} />}</div>
        </div>

        {/* 02 Review (swarm + pick) */}
        {review && review.status === "picking" && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2"><div className="section-number">02</div><div className="section-label mt-4">Review</div></aside>
              <div className="col-span-12 md:col-span-10">
                {vizPhase && <BranchVisualization key={vizGeneration} phase={vizPhase} events={mesaEvents} />}
                <div className="mt-8"><RedlineComparison strategies={strategies} onPick={pick} busy={busy} /></div>
              </div>
            </div>
          </>
        )}

        {/* 03 Approval gate */}
        {review && review.status === "gating" && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2"><div className="section-number">03</div><div className="section-label mt-4">Approve</div></aside>
              <div className="col-span-12 md:col-span-10">
                <ApprovalGate review={review} onApprove={approve} onReject={reject} onRollback={rollback} onMerge={merge} busy={busy} />
              </div>
            </div>
          </>
        )}

        {/* 04 Audit trail */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">04</div><div className="section-label mt-4">Audit</div></aside>
          <div className="col-span-12 md:col-span-10"><AuditTrail events={auditEvents} /></div>
        </div>

        {/* 05 Activity */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">05</div><div className="section-label mt-4">Activity</div></aside>
          <div className="col-span-12 md:col-span-10"><ActivityFeed events={mesaEvents} connected={sseConnected} /></div>
        </div>
      </main>

      <footer className="border-t border-line mt-32">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-6">
              <div className="font-display italic text-2xl mb-2">A Mesa demonstration.</div>
              <p className="text-sm text-mute max-w-md">Human-in-the-loop contract redlining on a versioned filesystem. Branch, approve, audit, roll back — agents reasoned by Claude.</p>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="section-label mb-3">Built with</div>
              <ul className="font-mono text-xs space-y-1.5 text-ink-2"><li>@mesadev/sdk</li><li>@anthropic-ai/sdk</li><li>react · vite · tailwind</li></ul>
            </div>
          </div>
        </div>
      </footer>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-ink/30 z-[60] flex items-center justify-center" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-canvas border border-line p-8 max-w-sm mx-4 reveal" onClick={(e) => e.stopPropagation()}>
            <div className="section-label text-down mb-3">Clear all API keys?</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed mb-6">This removes your Anthropic and Mesa keys from the encrypted store and resets the backend to local filesystem.</p>
            <div className="flex gap-3">
              <button onClick={async () => { await clearKeys(); setShowClearConfirm(false); }} className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-down text-canvas hover:bg-down/80 transition-colors">Clear keys</button>
              <button onClick={() => setShowClearConfirm(false)} className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-line text-ink hover:border-ink transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backends={backends}
        loading={settingsLoading}
        mesaInfo={mesaInfo}
        keys={keys}
        onSaveKeys={saveKeys}
        onClearKeys={clearKeys}
        onReset={async () => { const r = await resetDemo(); if (r.ok) { refreshContract(); bump(); } return r; }}
        onSwitchBackend={async (b) => { const r = await switchBackend(b); if (r.ok) { refreshContract(); bump(); } return r; }}
        webhookTargets={webhookTargets}
        onCreateWebhookTarget={createWebhookTarget}
        onDeleteWebhookTarget={deleteWebhookTarget}
        repoTags={repoTags}
        onUpdateRepoTags={updateRepoTags}
      />
    </div>
  );
}

function SettingsCog() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
```

- [ ] **Step 3: Build and verify it compiles clean**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. (If errors reference `Portfolio.tsx`, `ComparisonView.tsx`, `AgentCard.tsx`, `HistoryTimeline.tsx`, `PlaybookView.tsx`, or `ChangeTimeline.tsx`, they are no longer imported by App — they're deleted in Task 11. A build error only occurs if something still imports them; App no longer does, so the build should pass.)

- [ ] **Step 4: Manual smoke test**

```bash
rm -rf mesa-repo && (npm run dev:server &) && sleep 3 && (npm run dev:client &) && sleep 3
echo "Open http://localhost:5173 — Run review → pick a strategy → approve/reject clauses → merge. Confirm audit + activity update."
```
Confirm: contract renders; Run review shows 3 strategies; picking opens the gate; approve/reject advance; rollback appears after an approval; merge updates the contract version and clears the gate; audit trail lists events. Then stop the servers (`pkill -f "tsx watch"; pkill -f vite`).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/AuditTrail.tsx client/src/App.tsx
git commit -m "feat: audit trail and full redline workflow wired into App"
```

---

### Task 11: Cleanup — delete dead code, update docs

**Files:**
- Delete: `server/services/market.ts`, `server/services/memory.ts`, `server/services/playbook.ts`, `server/validators/trade.ts`, `server/agents/base.ts`, `server/agents/fundamentals.ts`, `server/agents/sentiment.ts`, `server/agents/technical.ts`, `server/services/claude.ts`'s portfolio `runAgentPrompt`/`AgentInput`/`AgentOutput` (only if unused), `client/src/components/Portfolio.tsx`, `client/src/components/ComparisonView.tsx`, `client/src/components/AgentCard.tsx`, `client/src/components/HistoryTimeline.tsx`, `client/src/components/PlaybookView.tsx`, `client/src/components/ChangeTimeline.tsx`, `data/sample-market.json`
- Modify: `README.md`

- [ ] **Step 1: Delete dead server + client files**

```bash
git rm server/services/market.ts server/services/memory.ts server/services/playbook.ts server/validators/trade.ts \
  server/agents/base.ts server/agents/fundamentals.ts server/agents/sentiment.ts server/agents/technical.ts \
  client/src/components/Portfolio.tsx client/src/components/ComparisonView.tsx client/src/components/AgentCard.tsx \
  client/src/components/HistoryTimeline.tsx client/src/components/PlaybookView.tsx client/src/components/ChangeTimeline.tsx \
  data/sample-market.json
```

- [ ] **Step 2: Prune portfolio-only code from `claude.ts` and `shared/types.ts`**

In `server/services/claude.ts`, remove `AgentInput`, `AgentOutput`, `runAgentPrompt`, and the `CONSTRAINTS_BLOCK` (they referenced the trading flow). Keep `reinitializeAnthropic`, `clearAnthropic`, `hasAnthropicKey`, `getClient`, `parseRedlineEdits`, `runRedlinePrompt`. Remove the now-unused `import type { Portfolio, TradeAction }` line; keep `import type { Contract, RedlineEdit }`.

In `shared/types.ts`, remove the portfolio-only types no longer referenced anywhere: `Holding`, `Portfolio`, `TradeAction`, `AgentProposal`, `PlaybookEntry`, `AgentMemory`, `PastPredictionRecord`, `AgentResult`, `AnalysisRound`, `MarketQuote`. Keep `StorageBackend`, `MesaDiff*`, `MesaActivityEvent`, `KeyStatus`, `WebhookTarget`, `MesaChange`, `RepoTags`, and all the new redline types. In `client/src/types.ts`, remove the matching re-exports (`Portfolio`, `Holding`, `TradeAction`, `AgentProposal`, `AgentResult`, `AgentMemory`, `PastPredictionRecord`, `PlaybookEntry`, `MarketQuote`) and the `PortfolioWithPrices`, `AnalysisState`, `HistoryRoundSummary` interfaces.

- [ ] **Step 3: Verify nothing references deleted symbols**

Run: `grep -rn "portfolio\|playbook\|TradeAction\|fundamentals\|yahoo\|market" server client/src --include=*.ts --include=*.tsx -i | grep -v "node_modules"`
Expected: no matches in live code (matches only in deleted files are fine — they're gone). Resolve any stragglers.

- [ ] **Step 4: Full build + test**

Run: `npm run build && npm test`
Expected: build succeeds; all Vitest suites pass.

- [ ] **Step 5: Update README**

Update `README.md`: change the project description and "How it works" to the contract-redline workflow (swarm → pick → approval gate → audit → rollback), update the architecture diagram and any portfolio-specific copy, and revise the SDK parity table to reflect the human-in-the-loop approval gate, immutable audit trail, and rollback as the headline capabilities. Remove Yahoo Finance from dependencies/features.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove portfolio scenario, update README for contract redline demo"
```

---

## Self-Review

**Spec coverage:**
- Clause-addressable `contract.json` → Task 1 (types) + Task 4 (`getContract`/`seedContract`). ✓
- Edit schema replace/delete/insert → Task 1 (`RedlineEdit`) + Task 1 engine. ✓
- `base ⊕ applied` replay (resume + rollback on every backend) → Task 1 `applyEdits`, Task 5 `loadGate`/`rollbackLast`. ✓
- Swarm (3 postures) → Task 3 + Task 4 `startReview`. ✓
- Pick → working branch with pending/applied → Task 4 `pickStrategy`. ✓
- Approval gate approve/reject → Task 5. ✓
- Merge hygiene (working files never leave review branch) → Task 5 `mergeReview` + Task 5 test asserts absence on main. ✓
- Audit trail (own log + Mesa enrichment) → Task 5 `getAuditTrail`; Mesa `listChanges` remains available via `/changes`. ✓ (Note: `/audit` returns our event log; `/changes` still exposes raw Mesa history for Mesa backends — both available.)
- Rollback (append-only supersede) → Task 5 `rollbackLast`. ✓
- `GET /review/active` rehydration → Task 4 + Task 7 hook + Task 10 wiring. ✓
- Works fully on local-fs → all backend tests run on local-fs. ✓
- Canned fallback (no key) → Task 2 + Task 3. ✓
- Single active review → `active-review.json` pointer, Task 4. ✓
- Repo rename → Task 6. ✓
- Removed pieces enumerated → Task 11. ✓
- Sample SaaS MSA (~7 clauses) → Task 2 (8 clauses). ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `Posture`, `RedlineEdit`, `Contract`, `ReviewState`, `AuditEvent` defined in Task 1 and used verbatim downstream. `applyEdits(base, edits)`, `editSummary(edits)`, `runRedlineAgent(contract, posture)`, `startReview(id)`, `pickStrategy(id, posture)`, `approveNext(id, approver)`, `rejectNext(id, approver)`, `rollbackLast(id, approver)`, `mergeReview(id)`, `getActiveReview()`, `getAuditTrail()` — signatures consistent across Tasks 4–7 and the routes in Task 6. ✓

**Out-of-scope (deferred):** user-uploaded contracts, negotiation-memo doc, full time-travel scrubber, multiple concurrent reviews — matches spec. ✓
