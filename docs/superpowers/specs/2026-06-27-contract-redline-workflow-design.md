# Contract Redline Workflow — Design Spec

**Status:** Approved design, pre-plan
**Date:** 2026-06-27
**Supersedes the demo scenario in:** `2026-05-14-mesa-portfolio-advisor-design.md`

## Goal

Pivot the Mesa demo from a stock-portfolio advisor to a **contract redlining workflow** that makes Mesa's value self-evident: an agent swarm proposes competing redlines, a human approves them clause-by-clause through a durable approval gate, every change is on an immutable audit trail, and bad edits roll back. The portfolio scenario is removed; the existing editorial UI, Mesa version-control primitives, and three-backend architecture are reused.

## Why this scenario

The portfolio demo failed to communicate Mesa's power because stock analysis does not *need* versioning — three prompts would do. Contract redlining makes all four capabilities Mesa names (human approval, parallel swarms, audit trail, rollback) **load-bearing**: you would never let an agent's legal edits land without human sign-off, the audit trail is the point, and rollback matters. It is also Mesa's lead go-to-market vertical.

## Core principle

The demo must run **fully on the local-fs backend** (what a first-time visitor sees with no keys). Switching to a Mesa backend (`mesa-sdk` / `mesa-mount`) *upgrades* the same workflow to real version control — true commits, sub-50ms reads, durable cloud state, real diffs. That upgrade is part of the pitch.

## Architecture: Mesa data model (Approach A)

### Canonical state
`main` holds the approved contract:
- `contract.json` — ordered, clause-addressable list: `[{ id, heading, text }]`
- `contract.meta.json` — `{ title, parties, version, lastApproved }`

The rendered document derives from `contract.json`. Clauses are addressable by `id` so applying an edit is a deterministic lookup, never a string search.

### A review run (id = timestamp)
1. Snapshot `main → snapshot/{id}` (rollback baseline).
2. Fork three agent branches `review/{id}/{posture}` for `aggressive`, `balanced`, `minimal`. Each agent reads `contract.json` and writes `redlines.json` — a structured clause-edit list — to its branch.
3. Branch graph animates the fork; the three strategies are shown side-by-side for the human to pick.

### Edit schema
```
{
  id: string,
  type: "replace" | "delete" | "insert",
  targetClauseId?: string,   // for replace/delete
  afterClauseId?: string,    // for insert (position)
  heading?: string,          // for insert/replace
  proposedText?: string,     // for replace/insert
  justification: string
}
```

### The pick → working branch
On pick, create `review/{id}` from `main`, seed:
- `contract.json` = main's, untouched (the base)
- `pending.json` = the chosen agent's ordered clause-edit queue
- `applied.json` = `[]`

**The review branch is the durable workflow state.**

### Approval gate (the hero)
For each edit in `pending.json`:
- **Approve** → push edit to `applied.json`, recompute `contract.json` = `base ⊕ applied`, commit a Mesa change whose message carries justification + approver, pop from `pending.json`.
- **Reject** → pop from `pending.json`, record a "rejected" event (rejections are on the record too).

State = `base ⊕ applied` (deterministic replay). Therefore:
- **Resume** = re-read the branch and replay. Close the tab / restart the server / come back — the pending approval is exactly where you left it.
- **Rollback** = pop the last entry from `applied.json`, recompute, commit a "restored to vN" change (append-only; supersedes, never erases).

Both work identically on every backend because they depend only on our branch files, not on Mesa history APIs (which are empty on local-fs).

### Merge
When `pending.json` is empty, merge `review/{id}` into `main`. **Strip working files first** (`pending.json`, `applied.json`, `redlines.json`) so only `contract.json` + `contract.meta.json` land on main. Post-merge: delete agent branches and the review branch; keep `snapshot/{id}` as the restore-to-baseline anchor.

### Audit trail
Driven by our own applied/rejected event log (always present, even on local-fs), **enriched** by Mesa `listChanges` when a Mesa backend is active. Each record: agent author, justification, approver, timestamp. (The `MesaService` interface has no per-commit author parameter, so author/approver are encoded in our event records and the commit message.)

### Primitives used
`createBranch`, `readFile`, `writeFile`, `mergeBranch`, `deleteBranch`, `getChangeId`, `getDiff`, `listChanges` — all already in `MesaService`, working across local-fs / SDK / mount. No new backend capability required.

### Concurrency
Single active review at a time. Starting a new review supersedes any in-flight one. `GET /review/active` lets the frontend rehydrate the gate on load.

## Page narrative & components

Same editorial layout, repointed:

- **Hero** — "Three agents redline. One human approves. Every change on the record." CTA: **Run review**.
- **01 · The contract** — renders `contract.json` + parties/version. *(new `ContractView`, replaces `Portfolio`)*
- **02 · Review** — branch graph animates 3 forks; 3 redline strategies side-by-side (change counts + per-clause before→after); human picks one. *(reuses `BranchVisualization`; `ComparisonView`/`AgentCard` adapted)*
- **03 · Approval gate** — chosen strategy's edits one clause at a time; approve/reject; progress; visible "paused — resumes from exact state" indicator; rollback of last approved clause. *(new `ApprovalGate` — hero)*
- **04 · Audit trail** — every edit with author, justification, approver, timestamp; immutable. *(reuses `ChangeTimeline`)*
- **05 · Activity** — live SSE ops feed. *(reuses `ActivityFeed`)*

**Removed:** `Portfolio`, `PlaybookView`, `HistoryTimeline`/replay, `market.ts`, `memory.ts`, the three trading agents, Yahoo Finance, routes `/portfolio` `/analyze` `/merge` `/dismiss` `/replay` `/history` `/playbook`.
**Kept whole:** `SettingsPanel` (keys, 3 backends, webhooks, tags), clear-keys button, settings callout, diff CSS, design system, SSE infrastructure.

## Backend

- **`server/services/contract.ts`** — load/save `contract.json` + meta; `applyEdits(base, edits)` replay; pending/applied queue ops; review-branch lifecycle (snapshot, fork postures, pick, approve, reject, merge, rollback); merge hygiene.
- **`server/agents/redline.ts`** — one agent runner + three posture configs (aggressive / balanced / minimal). Real Claude call → structured clause-edit JSON, one retry on parse failure, canned fallback per posture when no key.
- **Routes** (replace portfolio routes): `GET /contract`, `POST /review/start`, `POST /review/pick`, `POST /review/approve`, `POST /review/reject`, `GET /review/active`, `POST /review/merge`, `POST /review/rollback`. Keep `/settings*`, `/activity`, `/changes`, `/webhooks*`, `/repo/tags`, `/diff`.
- **Seed:** on start, write the sample contract to `main` if absent (replaces portfolio seed).

### Sample contract
A focused **SaaS MSA excerpt** (~7 clauses): liability cap, indemnification, auto-renewal, data/IP ownership, termination, confidentiality term, governing law. Greatest-hits negotiation targets, SaaS-relevant for the founder. Swappable.

### Canned fallback (no key)
Pre-written redlines for the sample contract, all three postures, so the full workflow is clickable without an Anthropic key.

## Error handling & fallback

- **No Anthropic key** → canned redlines, full click-through.
- **Agent JSON parse failure** → retry once, then canned for that posture.
- **Zero-edit strategy** (tame "minimal") → empty queue goes straight to merge.
- **Mesa backend errors** → surfaced as today.
- **Resume** → always reads the branch, so refresh / restart / tab-close is safe.

## Testing

- **Unit (pure core):** `applyEdits` replay (`base ⊕ applied` produces expected `contract.json`); pending→applied pop; rollback recompute; merge-hygiene (working files stripped).
- **Integration (local-fs):** start → pick → approve-all → merge updates main; reject doesn't apply; `/review/active` rehydrates mid-gate.

## Out of scope (v1)

- User-uploaded contracts (single baked sample; architecture allows swapping).
- A "negotiation memo" institutional-memory doc (playbook analog).
- Time-travel scrubber over full history (rollback-last covers the demo need).
- Multiple concurrent reviews.
