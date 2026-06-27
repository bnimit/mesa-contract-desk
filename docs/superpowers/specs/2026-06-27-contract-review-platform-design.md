# Contract Review Platform — Combined Design Spec

**Status:** Approved design, pre-plan
**Date:** 2026-06-27
**Supersedes:** `2026-06-27-multi-department-cherrypick-design.md` (folded in as the core).
**Modifies:** the contract-redline workflow + UI refresh already built on branch `contract-redline-workflow` (PR #1).

## Goal

Turn the demo into a product-shaped contract-review platform: **upload a contract (or pick a sample) → choose 2–4 department reviewers from a roster → run them in parallel on Mesa → cherry-pick the best edit per clause → merge into a clean v2**, with a department-by-department immutable audit trail. It directly demonstrates Mesa's core value (many specialists editing one document simultaneously on isolated branches, merged conflict-free) while looking like something that could be productionized.

## The full flow

1. **Intake** — the user uploads a PDF/DOCX/TXT contract (parsed + LLM-segmented into clauses) **or** picks a built-in sample. Result: a clause-addressable `Contract` on `main`.
2. **Configure** — the user toggles 2–4 reviewers from a preset persona roster (Legal, Finance, Security & Data, Commercial, Privacy).
3. **Run** — each selected reviewer forks its own Mesa branch and redlines clauses within its domain, in parallel.
4. **Cherry-pick** — a hybrid UI (document on the left, decision panel on the right) walks the human clause-by-clause: accept the owning reviewer's edit, choose between competing proposals on contested clauses, or keep the original.
5. **Merge** — accepted edits assemble into a new `main` version; the audit trail records who changed what and why.

## Offline / key matrix (demo safety)

The **default SaaS MSA sample reviewed by exactly the three core personas (Legal / Finance / Security) runs fully offline** via canned redlines — the bulletproof demo path. Everything else needs an Anthropic key (canned redlines exist only for the default MSA's specific clauses):

| Path | Needs Anthropic key? |
|---|---|
| Default MSA sample + a subset of {Legal, Finance, Security} | No (canned) |
| Default MSA + {Commercial or Privacy} | Yes (real agents) |
| Any other sample (e.g. NDA) | Yes (real agents) |
| Uploaded contract (any personas) | Yes (segmentation + real agents) |

The offline path is enabled only when the current contract is the default MSA **and** every selected persona is one of the canned core three. The Configure UI gates the key-requiring paths when no key is set; Run always works on the offline path.

---

# Stage A — Multi-department cherry-pick core

### Personas & domains
`Department = "legal" | "finance" | "security" | "commercial" | "privacy"` (renames the old `Posture`). Preset roster (server-defined `DEPARTMENTS`):

| id | label | domain (what it redlines) | color | canned? |
|---|---|---|---|---|
| legal | Legal Counsel | liability, indemnification, governing law, warranties, termination | `#047857` green | yes |
| finance | Finance | fees, payment terms, term & renewal, late fees, spend caps | `#b45309` amber | yes |
| security | Security & Data | data ownership, security obligations, breach notice, confidentiality | `#4f46e5` indigo | yes |
| commercial | Commercial | scope of services, SLAs, deliverables, support | `#0891b2` cyan | no |
| privacy | Privacy | personal data, processing, subprocessors, retention (GDPR/CCPA) | `#7c3aed` violet | no |

Each selected reviewer **reads the whole contract** but redlines only clauses in its domain. **Ownership is domain-driven (prompt-scoped)**, not a fixed clause list — this generalizes to arbitrary uploaded contracts. For the curated sample's three core personas, canned redlines are pre-scoped to the relevant clauses (and Legal + Finance both propose a *different* Liability edit → the contested clause). Contested clauses emerge naturally wherever two reviewers touch the same clause.

### Decision model (single source of truth)
Pure function in `contract-engine.ts`:
```ts
buildDecisions(base: Contract, contributions: { department: Department; edits: RedlineEdit[] }[]): ClauseDecision[]
```
```ts
interface ClauseProposal { department: Department; edit: RedlineEdit; }
interface ClauseDecision {
  id: string;                       // stable, clause-based ("dec-liability", "dec-ins-security-e1")
  kind: "modify" | "insert";
  targetClauseId?: string;
  heading: string;
  originalText: string | null;      // null for insert
  proposals: ClauseProposal[];      // one per department that touched this clause
  acceptedDepartment: Department | null;
  decided: boolean;
}
```
- `replace`/`delete` edits group by `targetClauseId`; each `insert` is its own decision. `proposals` lists every department that produced an edit for that clause.
- **Decisions are returned in document order** (clause position; inserts after their `afterClauseId`).
- The working `review/{id}` branch stores `decisions.json` as the source of truth. The contract is derived: `applied = decisions where decided && acceptedDepartment → that dept's edit`; `contract = applyEdits(base, applied)`.

### Flow & durability (Approach A)
- `startReview(id, departments: Department[])` — fork `review/{id}/{department}` for each selected reviewer, each with `redlines.json`; create working branch `review/{id}` (frozen `base`, computed `decisions.json`, seeded `audit.json`); active pointer `status: "merging"`. **No pick step.**
- `acceptEdit(id, decisionId, department)` — set `acceptedDepartment`, recompute, commit a Mesa change (`accepted {Department} · {heading}`) + audit event (author = department, approver = "you"); re-decidable.
- `skipDecision(id, decisionId)` — `acceptedDepartment = null`, decided (kept original), audit event.
- `mergeReview(id)` — **enabled only when every decision is `decided`** — assemble `base ⊕ accepted` into `main`, version bump, audit `merged`, delete branches.
- `getActiveReview()` — rehydrates from `decisions.json`/`audit.json`; never rebuilds decisions (preserves choices).
- Each cherry-pick is a durable Mesa commit → resume-from-exact-state stays literally true.
- **Audit is immutable/append-only:** re-deciding a clause appends another event; the contract reflects the latest accepted edit.

### Removed
`pickStrategy`, `approveNext`, `rejectNext`, the single pending/rejected queue, the `posture` field; frontend `RedlineComparison` and the single-queue `ApprovalGate`.

---

# Stage B — Persona roster + variable reviewers

- **Roster**: the `DEPARTMENTS` table above, exposed via `GET /api/personas` (id, label, domain, color, cannedAvailable).
- **Selection**: the Configure UI lets the user toggle **2–4** reviewers (min 2, max 4). Personas whose canned path is unavailable are key-gated when no Anthropic key is set.
- **Variable N**: `startReview` accepts the selected `departments[]` (2–4) instead of a fixed three. `buildDecisions` is already N-agnostic.
- **Branch visualization handles 2–4 branches**: `BranchVisualization` computes branch geometry (y-positions, fork/merge paths) dynamically from the selected personas' count and colors, instead of the hardcoded three. The **merge animation uses a multi-branch "merge-all" mode** (every contributing branch converges into the new `main v2`, caption "merging to v2") — never the single-winner or `isDismiss` "Discarding…" path.

---

# Stage C — Intake (upload + sample library)

### Upload
- **Frontend**: drag-drop / file picker accepting `.pdf`, `.docx`, `.txt`; client-side size cap **2 MB**; shows parse/segmentation progress.
- **Backend `POST /api/contract/upload`** (multipart): extract text — PDF via `pdf-parse`, DOCX via `mammoth`, TXT via utf-8 — then validate (non-empty, ≥ ~200 chars of extractable text; otherwise return a clear error: "Couldn't extract text — this may be a scanned/image PDF. Paste the text or use a sample."). Then `segmentContract(text)` → write the resulting `Contract` to `main` (`contract.json`) → return it. **Requires an Anthropic key.**
- **Segmentation**: `segmentContract(rawText: string): Promise<Contract>` (in `claude.ts`) — Claude splits the text into ordered clauses (`{ id: slug, heading, text }`), infers `meta` (title, parties), returns JSON; server validates ≥ 2 clauses and unique ids (slugging/deduping as needed).

### Sample library
- A small set of built-in `Contract`s in `server/data/` (the existing SaaS MSA + at least a Mutual NDA). `GET /api/samples` lists them (id, title); `POST /api/contract/sample { id }` sets one as current on `main`. Offline. The MSA + core-3 personas have canned redlines; other samples/personas need a key.
- **Reset** returns `main` to the default SaaS MSA.

---

# Frontend

- **Intake/Configure panel** (shown when no active review): upload dropzone + "or choose a sample" library + the persona roster with 2–4 toggle selection + a **Run review** button (disabled until a contract is loaded and 2–4 personas selected; key-gated personas/upload show a "needs key" hint). New component `IntakePanel.tsx`.
- **`CherryPickReview.tsx`** (replaces `RedlineComparison` + `ApprovalGate`): left = the contract with per-clause status chips (`unchanged`, `contested`, `{Department} proposes`, `accepted from {Department}`, `kept original`); right = focused decision panel showing the original text + each department's color-coded proposal with **Accept** buttons + **Keep original**, a progress meter ("N of M decided"), and next/prev. Merge button enabled at M of M.
- **`BranchVisualization.tsx`**: variable 2–4 branches, persona colors, multi-branch merge-all mode.
- **AuditTrail / ContractView / ActivityFeed / SettingsPanel**: reused, themed; audit color-coded by department.
- A shared `personas` map (label + color + domain) drives `IntakePanel`, `CherryPickReview`, `BranchVisualization`, and the audit.
- **Hooks** (`useApi`): `useContract` gains `uploadFile(file)` and `loadSample(id)`; `usePersonas()`; `useReview` gains `accept(decisionId, department)` / `skip(decisionId)` and `start(departments)`; review state carries `decisions`.

# Backend / services

- New `server/services/intake.ts` — file-text extraction (pdf/docx/txt) + sample registry + setting the current contract on `main`.
- New deps: `pdf-parse`, `mammoth`, and a multipart handler (`multer` or Express built-in) for the upload route.
- `claude.ts` gains `segmentContract`; `redline.ts` generalized to N personas with domain-scoped prompts + canned for the core three.
- Routes added: `GET /api/personas`, `GET /api/samples`, `POST /api/contract/upload`, `POST /api/contract/sample`, `POST /api/review/accept`, `POST /api/review/skip`; `POST /api/review/start` now takes `{ departments }`. Removed: `/review/pick`, `/review/approve`, `/review/reject`.

# Types (`shared/types.ts`)

Add `Department`, `Persona` (`{ id: Department; label; domain; color; cannedAvailable }`), `ClauseProposal`, `ClauseDecision`; update `ReviewState` (carry `decisions`, drop `posture`/`pending`/`rejected`); keep `Contract`/`Clause`/`RedlineEdit`/`AuditEvent`.

# Error handling

- Upload: unsupported type, > 2 MB, empty/too-short extraction → specific messages; the sample path remains available.
- Segmentation failure / invalid JSON → retry once, then surface "Couldn't read this contract — try another file or a sample."
- No key on a key-gated path → the Run button explains and links to Settings; the offline path stays enabled.
- Agent/parse failures → per-agent canned fallback on the sample; on uploads, skip that agent's contribution with a notice.
- Merge blocked until all decisions decided (UI makes this explicit).

# Out of scope (v1)

- Custom/free-form personas (roster only).
- OCR for scanned/image PDFs.
- Multi-user / per-session document isolation (single active contract + review).
- Rich multi-branch merge choreography beyond the modest merge-all animation.
- Persisting a library of user uploads across restarts.

# Testing

- **Unit (`contract-engine`):** `buildDecisions` — groups modify edits by clause; a shared clause yields 2 proposals, others ≤ 1; inserts are own decisions; document order; derived-`applied` picks the accepted department's edit.
- **Unit (intake):** text extraction for a `.txt` sample; segmentation JSON parser handles prose-wrapped JSON and rejects < 2 clauses.
- **Unit (redline):** N-persona run returns canned for the sample core three with no key; domain prompt built per persona.
- **Integration (local-fs, no key):** sample + {legal, finance, security} → `decisions.json` has 2 proposals on Liability → accept Finance on Liability + Legal on Indemnity + skip one → merge blocked until all decided → merged contract contains exactly those edits → `getActiveReview` rehydrates → re-decide updates derived contract + appends audit.
- UI verified by `npm run build` + manual smoke (no UI test runner), per existing convention.
