# Multi-Department Cherry-Pick Review — Design Spec

**Status:** Approved design, pre-plan
**Date:** 2026-06-27
**Modifies:** the contract-redline workflow (`2026-06-27-contract-redline-workflow-design.md`) and its UI (`2026-06-27-redline-ui-refresh-design.md`) — both already built on branch `contract-redline-workflow` (PR #1).

## Goal

Replace the "three competing posture agents → pick one strategy → approve its clauses" flow with a **multi-department, parallel, cherry-pick** model that directly demonstrates Mesa's core value: several specialists editing one document simultaneously on isolated branches, merged conflict-free, with a clause-level audit trail. Three departments — **Legal**, **Finance**, **Security & Data** — each own and redline their own section of the contract in parallel; the human reviews clause-by-clause (accept the owning team's edit, or choose between competing proposals on shared clauses) in a hybrid document + decision-panel UI; accepted edits merge into a clean `v2`.

## Why this framing

Real organizations review contracts by department (legal/finance/security each own their domain). Showing three teams edit one document at once on isolated branches and merging with nothing lost is the most literal, believable instance of the parallelism git-worktrees/sandboxes can't do cleanly — a mirror of Mesa's pitch. Mostly division-of-labor (conflict-free merge), with one shared contested clause (Liability) to keep a "choose between competing views" moment.

## Departments & clause ownership

`Department = "legal" | "finance" | "security"` (renames the old `Posture` type and its `"aggressive" | "balanced" | "minimal"` values everywhere).

| Department | Label | Owns (sample MSA clauses) | Color |
|---|---|---|---|
| legal | Legal Counsel | `services`, `liability`*, `indemnity`, `law` | `#047857` (green) |
| finance | Finance | `fees`, `term`, `liability`* | `#b45309` (amber) |
| security | Security & Data | `data`, `confidentiality`, + insert "Data Security" | `#4f46e5` (indigo) |

`*` **Liability is shared** — both Legal and Finance propose an edit to it, so that one decision has two competing proposals (the cherry-pick moment). Every other clause has at most one proposal (its owning department).

Each department agent **reads the whole contract** for context but **edits only its owned clauses**. Real Claude: the prompt constrains the agent to its owned clause ids. Canned fallback: pre-written edits per department for its clauses (Legal + Finance both include a Liability edit).

## Architecture (Approach A — durable, server-side decisions)

### Decision model (the single source of truth)
A new **pure** function in `contract-engine.ts`:
```ts
buildDecisions(base: Contract, contributions: { department: Department; edits: RedlineEdit[] }[]): ClauseDecision[]
```
Types (added to `shared/types.ts`):
```ts
interface ClauseProposal { department: Department; edit: RedlineEdit; }
interface ClauseDecision {
  id: string;                      // stable, clause-based (e.g. "dec-liability", "dec-ins-security-e1")
  kind: "modify" | "insert";
  targetClauseId?: string;         // for modify
  heading: string;
  originalText: string | null;     // null for insert
  proposals: ClauseProposal[];     // one per department that touched this clause (2 on shared clauses)
  acceptedDepartment: Department | null; // null = undecided or kept-original
  decided: boolean;
}
```
Grouping rules: `replace`/`delete` edits group by `targetClauseId` into one decision; each `insert` becomes its own decision. `proposals` lists every department that produced an edit for that clause.

**Derived contract:** the working `review/{id}` branch stores `decisions.json` as the source of truth. `applied = decisions.filter(d => d.decided && d.acceptedDepartment).map(pick that department's edit)`; `contract = applyEdits(base, applied)`. One state file — resume and rollback fall straight out of it.

### Flow (reuses `startReview`)
1. **Run review →** fork three department branches `review/{id}/{department}`, each with `redlines.json` (that department's edits to its clauses). *Also* create the working branch `review/{id}` with frozen `base` (`contract.json`), computed `decisions.json`, seeded `audit.json`. Active pointer status `"merging"`. **No pick step.**
2. **`acceptEdit(id, decisionId, department)`** → set that decision's `acceptedDepartment`, recompute contract, commit a Mesa change (`accepted {Department} · {heading}`) + audit event (author = the department, approver = "you"). Re-decidable (choose the other team on a shared clause, or change your mind).
3. **`skipDecision(id, decisionId)`** → `acceptedDepartment = null`, decided (kept original), audit event.
4. **`mergeReview(id)`** → assemble `base ⊕ accepted` into `main`, version bump, audit `merged`, delete the department + working branches. (Same as today, with `applied` derived from decisions.)
5. **Resume:** `getActiveReview()` reads `decisions.json`/`audit.json` from `review/{id}`; contract recomputed.

Every cherry-pick is a durable Mesa commit → "close the tab, resume from exact state" stays literally true.

### Removed
`pickStrategy`, `approveNext`, `rejectNext`, the single pending/rejected queue, and the `posture` field on review state.

## Frontend

Replace `RedlineComparison` (pick-one) and the single-queue `ApprovalGate` with one new **`CherryPickReview`** component — the hybrid layout:
- **Left — the contract:** every clause rendered, tagged with a status chip: *contested* (2 proposals), *{Department} proposes* (1 proposal, color-coded), *accepted from {Department}*, or *kept original*. Click a clause to focus its decision. New-clause inserts shown in place.
- **Right — the decision panel:** the focused decision shows the original text plus each department's proposal stacked and color-coded (Legal green / Finance amber / Security indigo), each with an **Accept** button; plus **Keep original**. A progress meter (N of M decided) and next/prev navigation. On the shared Liability clause, two proposals appear side by side — the cherry-pick moment.

`useReview` gains `accept(decisionId, department)` and `skip(decisionId)`; review state carries `decisions: ClauseDecision[]` and drops `posture`/`pending`/`rejected`. App's review section renders `CherryPickReview`.

Department identity (label + color) lives in one shared map reused by `CherryPickReview`, `BranchVisualization`, and the audit trail.

## Animation & audit

- **`BranchVisualization`:** the three forked branches are relabeled to the departments with their colors; on merge it animates the accepted branches contributing into a new `main` (keep the v1 merge modest and non-misfiring — the multi-branch merge choreography beyond that is a noted nice-to-have, not built now).
- **Audit trail** is the star: e.g. "Liability → accepted **Finance** · Indemnification → accepted **Legal** · Data & IP → accepted **Security** · Auto-renewal → kept original · merged to v2" — a department-by-department record of who changed what and why.

## Resolved design details (from gap review)

1. **Ownership is enforced, not just requested.** After each department agent returns edits (real Claude or canned), the server **drops any edit whose `targetClauseId` is outside that department's owned set** (Security is additionally allowed to `insert`). This guarantees clean division of labor regardless of model behavior. "Owns" = *allowed to edit*; a department need not edit every owned clause, and clauses no one edits simply produce no decision.
2. **The shared Liability proposals are deliberately different framings** so the cherry-pick is a real choice: Legal proposes a mutual cap **with carve-outs** for confidentiality/indemnity breaches; Finance proposes a cap **tied to fees paid** in the prior period. Canned redlines reflect this; the real-Claude prompts steer each toward its lens.
3. **Merge-readiness:** `mergeReview` is enabled only when **every** decision is `decided` (accepted or kept-original) — nothing is silently dropped. The UI shows "N of M decided" and gates the Merge button until M of M.
4. **Decision ordering = document order.** `buildDecisions` returns decisions sorted by the clause's position in `base.clauses`; each `insert` is ordered immediately after its `afterClauseId` anchor. The left document and the right panel walk top-to-bottom in sync.
5. **Left-document clause statuses:** `unchanged` (no proposal — most clauses, plain), `contested` (2 proposals), `{Department} proposes` (1 proposal), `accepted from {Department}`, `kept original`.
6. **Re-decide / audit semantics:** decisions are freely re-decidable; each `acceptEdit`/`skipDecision` **appends** an immutable audit event (the full deliberation history), while the derived contract always reflects the *latest* accepted edit per decision. Changing Liability from Legal→Finance leaves both events in the trail; the contract carries Finance's.
7. **Merge animation — multi-branch mode (replaces single-winner).** `BranchVisualization` currently treats "no single winner" as `isDismiss` and renders *"Discarding all branches…"*. For cherry-pick there is no single winner, so a new **merge-all mode** is added: on merge, every contributing department branch converges into the new `main v2` with the merge caption "merging to v2" — never the dismiss path. App's `handleMerge` drops the single-winner snapshot; the viz lifecycle is rebuilt around the single `"merging"` status (no `picking`/`gating`): `fork`→`analyze` while agents run, `done`/`merging` once decisions are ready, `merge`→`complete` on merge.

## Frontend removals

`RedlineComparison` (pick-one) and the single-queue `ApprovalGate` are removed and replaced by `CherryPickReview`. (Backend removals — `pickStrategy`, `approveNext`, `rejectNext`, pending/rejected — as noted above.)

## Out of scope (v1)

- Per-department avatars/voice beyond label + color.
- More than the one shared contested clause (Liability).
- Letting departments edit outside their owned clauses.
- Rich multi-branch merge choreography (modest merge animation only).

## Testing

- **Unit (`contract-engine`):** `buildDecisions` — groups modify edits by clause; the shared Liability clause yields exactly 2 proposals while every other clause yields at most 1; inserts become their own decisions; decisions are in document order; undecided by default. Derived-`applied` selection picks the accepted department's edit.
- **Unit (ownership enforcement):** an agent edit targeting a clause outside its owned set is dropped; an in-lane edit is kept; Security's insert is kept.
- **Integration (local-fs):** start → `decisions.json` has the expected per-clause proposals (2 on Liability) → accept Finance on Liability + Legal on Indemnity + skip one → `mergeReview` is blocked until all decided, then yields a contract containing exactly those edits → `getActiveReview` rehydrates decisions mid-flow → re-deciding a clause updates the derived contract and appends an audit event.
