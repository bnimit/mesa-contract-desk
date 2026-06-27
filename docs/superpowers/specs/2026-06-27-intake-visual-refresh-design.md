# Intake Visual Refresh — Design Spec

**Status:** Approved design, pre-plan
**Date:** 2026-06-27
**Modifies:** `client/src/components/IntakePanel.tsx` + the hero in `client/src/App.tsx` (built on branch `contract-redline-workflow`, PR #1).

## Goal

Make the entry screen instantly legible to a demo viewer: a visual icon-flow hero that shows what they'll see, a prominent contract chooser (upload OR sample — the sample option already exists but isn't prominent), and visual department-selection cards with one icon per reviewer's vantage point. Frontend only; no backend/workflow changes (one small additive change to the persona roster data).

## 1 · Icon-flow hero (Hero "A")

Replace the current text hero ("Your departments redline in parallel, you merge the best of each.") with a plain-English title above a visual flow strip:

- **Title:** "Your whole review team reads one contract — at the same time — and you keep the best of each." (plain, no jargon)
- **Eyebrow:** "Counsel-in-the-loop · on a versioned filesystem" (kept).
- **Flow strip:** a horizontal sequence of labeled icons:
  `📄 Contract → [selected department icons] → ✅ You cherry-pick → 📑 Clean v2`
  The middle shows the icons of the **currently selected** departments (from App's `selected` state, via the personas roster) — so the hero reflects the user's choices. Each step has a small caption.

The flow strip is a new small component `HeroFlow.tsx` (props: the selected personas `{icon,label,color}[]`). Static SVG/markup with the existing reveal animation; no new animation engine.

## 2 · Prominent contract chooser (in IntakePanel)

Restructure step "1 · Choose a contract" so it's visually obvious:
- A large **Upload card** (dashed border, ⬆️ icon, "Upload a contract · PDF · DOCX · TXT") that opens the file picker.
- Beside it, **sample cards** (one per `/api/samples` entry) rendered as bordered rows with a 📄 icon and title; the default SaaS MSA card shows a green "runs offline" pill.
The sample option is always visible (not buried behind "or sample:" text).

## 3 · Visual department cards (Style 2)

Replace the current text-row reviewer toggles with selectable **cards** (a responsive grid), one per persona:
- Large **emoji icon** (the vantage point) · **label** · the **owned clauses** (domain) · a one-line **"what they push for"** pitch in italic.
- **Selected:** 2px border + tinted background in the persona color + a ✓.
- **Locked** (non-canned persona when no Anthropic key, and not already selected): greyed/`opacity` + a 🔑 "needs an API key" note; not clickable.
- Selection stays 2–4 (unselected cards lock at 4; already-selected stay deselectable).

Emoji per department (swappable): ⚖️ Legal · 💰 Finance · 🛡️ Security & Data · 🤝 Commercial · 🔒 Privacy.

## Data change (additive)

Add two presentational fields to the `Persona` type and the server roster (`server/data/personas.ts`), so they flow to the client via the existing `GET /api/personas`:
- `icon: string` — the emoji.
- `pitch: string` — the "what they push for" one-liner, e.g. Legal: "Cap our liability, make indemnity mutual." · Finance: "Extend payment terms, kill auto-renew." · Security: "Customer owns data, 72-hour breach notice." · Commercial: "Tighten SLAs and scope." · Privacy: "Limit processing, add retention limits."

`client/src/types.ts` re-export already carries `Persona` (gains the two fields automatically). No new endpoint.

## Out of scope

- SVG line-art icons (emoji for v1; the icon string is centralized so swapping later is one map).
- Animated hero beyond the existing reveal; the live branch animation stays in its own pipeline section as today.
- Any backend/workflow/cherry-pick logic changes.

## Testing

- Add/extend `personas.test.ts`: every persona has a non-empty `icon` and `pitch`.
- UI verified by `npx tsc -p tsconfig.json --noEmit` (client) + `npx tsc -p tsconfig.server.json --noEmit` (server) clean, `npm run build` green, and a manual visual pass (no UI test runner, per convention).
