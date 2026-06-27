# Redline Demo UI Refresh — Design Spec

**Status:** Approved design, pre-plan
**Date:** 2026-06-27
**Builds on:** `2026-06-27-contract-redline-workflow-design.md` (the workflow this re-skins)

## Goal

Re-theme and restructure the contract-redline demo's frontend so that (1) it is visually distinct from the beige portfolio demo Oliver already saw, (2) it explains how the workflow works at a glance, and (3) the multi-agent fork→approve→merge workflow is animated live. **Frontend only — no backend, API, or workflow-logic changes.** All existing functionality (three backends, settings, clear-keys, canned no-key fallback) is preserved.

## Theme: "law-firm modern" (replaces the beige editorial theme)

A clean, modern fintech-legal look. No beige anywhere.

**Palette (replaces the current `@theme` tokens in `client/src/index.css`):**
- Canvas: `#fbfcfb` base, with a subtle `#fbfcfb → #f4f8f5` vertical gradient in the hero.
- Ink (text): `#0c1512`; secondary `#334e44`; muted `#6b827a`; faint `#9fb3aa`.
- Primary (forest green): `#047857`; deep `#065f46`; mint tint `#ecfdf5`; bright accent `#34d399`.
- Lines/borders: `#e6ede9`, `#d1ddd6`.
- Redline diff — deleted: text `#991b1b` on `#fdf2f2`; added: text `#166534` on `#eefbf3`.
- Status pill (needs-approval / paused): `#92400e` on `#fef3c7`.
- The animated pipeline sits on a dark panel: bg `#0c1512`, with green `#34d399` / red `#ef4444` / grey `#94a3b8` branches.

**Type:** a **modern sans identity** — a clean break from the old demo's literary-serif (Fraunces) look, reading "fintech / dev-tool product" rather than editorial.
- Display headings: `Space Grotesk` (Google Fonts) — geometric, characterful sans — with `"Inter", system-ui, sans-serif` fallback. **No serif display.**
- Body/UI: `Inter` (Google Fonts), `system-ui, sans-serif` fallback. (Replaces DM Sans.)
- Mono (technical labels, branch names): keep `JetBrains Mono`.
- The old `.serif-quote` italic-serif accent is repurposed to clean sans (normal style); contract/clause text renders in the body sans (Inter), not a serif.

**Shape language:** rounded cards (`border-radius` 10–14px), soft green-tinted shadows (`0 4px 12px rgba(6,78,59,.06)`), pill-shaped status badges. This is a clear departure from the old demo's hard-edged editorial blocks and "01/02/03" giant section numbers (those numbers are dropped).

## Layout (top → bottom)

1. **Top bar** — wordmark `m` (green tile) · `Mesa · Contract Desk`, backend chip, version, clear-keys button, settings cog + first-visit callout. Same functionality as today, re-themed.
2. **Hero** — serif headline "Three agents redline. / You approve every change." on the white→mint gradient; forest-green "Run review →" CTA; sub-line noting it runs with sample redlines when no key is set.
3. **How-it-works strip (NEW)** — always visible under the hero. A 4-step horizontal band: **① Fork · ② Approve · ③ Merge · ④ Audit**, each with a one-line description tying the step to the Mesa capability (instant isolated branch / durable resume-from-exact-state gate / new version on main / immutable history + rollback). Static, no interaction. New component `HowItWorks.tsx`.
4. **Animated workflow pipeline (NEW prominence)** — the existing `BranchVisualization` SVG, re-themed onto a dark panel and **driven live through all phases** (see Animation below). Persistently visible once a review starts (not just a flash during picking).
5. **The contract** — `ContractView`, re-themed as a clean legal-document card (serif title, party line, clause rows).
6. **Review / pick** — `RedlineComparison` + `StrategyCard`, re-themed (rounded cards, posture accent, redline preview).
7. **Approval gate** — `ApprovalGate`, re-themed: a progress bar, "paused · resumes from exact state" pill, red/green clause diff, justification line, Approve/Reject + roll-back.
8. **Audit trail** — `AuditTrail`, re-themed rows (kind pill + author→approver).
9. **Activity** — `ActivityFeed`, re-themed.

## Animation — drive `BranchVisualization` through the full lifecycle

The component already supports phases `fork → analyze → done → merge → complete` but the current App only ever sets `analyze`/`done`. The refresh wires the **real workflow state** to the phase, and keeps the pipeline visible across the flow:

- **idle (no active review):** pipeline shows a calm single `main` node (or is collapsed) — TBD-free choice: render the `main` node only.
- **Run review pressed → agents running** (`busy`, before strategies land): `fork` then `analyze` — branches draw out, agent nodes pulse, the traveling dot runs.
- **`review.status === "picking"`** (strategies returned): `done` — branches settled, "choose a strategy."
- **`review.status === "gating"`** (a strategy picked): pipeline highlights the chosen branch; the approval gate is the focus below.
- **Merge pressed:** play `merge` → `complete` — the chosen branch animates back into `main`, glows, and the main node relabels to the new version (e.g. `main v2`). This requires a brief merge/complete viz window before the gate clears (App holds a short "completing" state, ~1.5–1.8s, like the old demo's `showComplete`, before resetting).

Re-theme the SVG colors to the dark-panel palette (green/red/grey branches, white traveling dot). Agent labels already read Aggressive/Balanced/Minimal.

## Components & files

- **`client/src/index.css`** — rewrite `@theme` color + font tokens; update utility classes (`.section-label`, `.display-heading`, `.serif-quote`, `.diff-added`/`.diff-deleted`); add small card/pill helpers; keep existing keyframes, add any needed for the pipeline. Load Newsreader + Inter.
- **`client/src/components/HowItWorks.tsx`** (NEW) — the 4-step explainer strip.
- **`client/src/App.tsx`** — restructure layout (drop the "01/02" aside numbers, add HowItWorks + prominent pipeline), and add the lifecycle→viz-phase mapping incl. the merge/complete window.
- **Re-theme (className/markup changes only):** `BranchVisualization.tsx` (palette + dark panel), `ContractView.tsx`, `StrategyCard.tsx`, `RedlineComparison.tsx`, `ApprovalGate.tsx`, `AuditTrail.tsx`, `ActivityFeed.tsx`, `SettingsPanel.tsx`.

## Out of scope

- No backend/API/workflow changes. No new data or routes.
- No dark-mode toggle (the page is light; only the pipeline panel is dark by design).
- No new tests beyond a green `npm run build` + manual visual smoke (the repo has no component test runner; consistent with the workflow build).

## Success criteria

- The page no longer reads as the beige portfolio demo: white canvas, forest-green primary, modern sans display (Space Grotesk) + Inter body, rounded product cards.
- A first-time visitor can read the 4-step strip and understand fork→approve→merge→audit without running anything.
- Running a review animates: forks appear, branches light as counsel finish, and the merge animates back to a new `main` version.
- `npm run build` is green; all existing functionality (backends, settings, clear-keys, canned fallback) still works.
