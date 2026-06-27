# Redline Demo UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the contract-redline demo into a distinct "law-firm modern" theme (white + forest green, serif display + Inter, rounded product cards), add an always-visible how-it-works explainer, and drive the branch-graph animation live through the full fork→approve→merge→complete lifecycle.

**Architecture:** Frontend-only. The palette/fonts live in `client/src/index.css` `@theme` tokens, which most components consume by name (`bg-canvas`, `text-ink`, `text-mesa`, `border-line`…) — so rewriting the tokens re-themes the app globally; the remaining work is layout restructure, one new component, the animation lifecycle wiring, and per-component shape polish (rounding/shadows/pills). No backend, API, or workflow-logic changes.

**Tech Stack:** React 19 + Vite + Tailwind v4 (`@theme`), TypeScript ESM. Google Fonts: Newsreader + Inter + JetBrains Mono.

## Global Constraints

- TypeScript, ESM, NodeNext — `.js` extensions on all relative imports.
- **Frontend only** — do not touch `server/`, routes, hooks' fetch logic, or workflow behavior. Preserve all existing functionality (three backends, settings, clear-keys, canned no-key fallback).
- **No beige.** Canvas `#fbfcfb`/`#f4f8f5`; primary forest green `#047857`/`#065f46`; accent mint `#34d399`/`#ecfdf5`; ink `#0c1512`; muted `#6b827a`; lines `#e6ede9`/`#d1ddd6`; redline deleted `#991b1b` on `#fdf2f2`, added `#166534` on `#eefbf3`; status pill `#92400e` on `#fef3c7`; pipeline panel dark `#0c1512`.
- Fonts: display `Space Grotesk` (modern **sans**, not a serif, not Fraunces), body `Inter`, mono `JetBrains Mono`. The `.serif-quote` utility is repurposed to clean sans; contract/clause text uses the body sans.
- No automated UI tests exist in this repo (no React Testing Library — do not add it). Verification per task = `npx tsc`-clean `npm run build` (zero errors) + a self-check of the changed markup against the spec mock. The user does the final visual pass.
- Commit at the end of each task.
- Spec: `docs/superpowers/specs/2026-06-27-redline-ui-refresh-design.md`.

---

### Task 1: Theme foundation — fonts, `@theme` tokens, base CSS, utilities

**Files:**
- Modify: `client/index.html` (font links + title)
- Modify: `client/src/index.css` (full `@theme` + base + utilities)

**Interfaces:**
- Produces: the new color/font tokens (`--color-canvas`, `--color-ink`, `--color-mesa` = forest green, etc.) and new utility classes `.card`, `.panel-dark`, `.pill`, `.pill-warn`, `.pill-ok`, `.pill-bad` consumed by Tasks 2–4.

- [ ] **Step 1: Swap the Google Fonts + title in `client/index.html`**

Replace the `<title>` and the Google Fonts `<link>` (lines ~6 and ~10):
```html
    <title>Mesa — Contract Desk</title>
```
```html
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&family=Inter:wght@400..700&family=JetBrains+Mono:wght@300..700&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 2: Rewrite the `@theme` block + base in `client/src/index.css`**

Replace lines 1–51 (the `@import`, `@theme`, `*`, `html,body`, `body`, `::selection`) with:
```css
@import "tailwindcss";

@theme {
  --font-display: "Space Grotesk", "Inter", system-ui, sans-serif;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Menlo", monospace;

  --color-canvas: #fbfcfb;
  --color-canvas-2: #f4f8f5;
  --color-ink: #0c1512;
  --color-ink-2: #334e44;
  --color-mute: #6b827a;
  --color-mute-2: #9fb3aa;
  --color-line: #e6ede9;
  --color-line-2: #d1ddd6;

  --color-mesa: #047857;       /* primary forest green */
  --color-mesa-soft: #ecfdf5;

  --color-up: #166534;         /* added / approve */
  --color-down: #b91c1c;       /* deleted / reject / aggressive */

  --color-fundamentals: #047857; /* balanced posture */
  --color-sentiment: #b45309;    /* amber (incidental) */
  --color-technical: #6b827a;    /* minimal posture (grey) */
}

* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

html,
body {
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

body {
  background-image:
    radial-gradient(at 0% 0%, rgba(4, 120, 87, 0.035) 0%, transparent 38%),
    radial-gradient(at 100% 100%, rgba(52, 211, 153, 0.04) 0%, transparent 42%);
  background-attachment: fixed;
}

::selection {
  background: var(--color-mesa);
  color: #ffffff;
}
```

- [ ] **Step 3: Update `.display-heading`, diff tints, and add card/pill utilities**

In `client/src/index.css`, change `.display-heading` (it referenced Fraunces optical sizing, no longer relevant) to a tight, assertive sans, and repurpose `.serif-quote` to clean sans (Space Grotesk is a sans, so italic-serif accents would clash):
```css
.display-heading {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.03em;
}

.serif-quote {
  font-family: var(--font-sans);
  font-style: normal;
  font-weight: 400;
  letter-spacing: -0.005em;
}
```
Replace `.diff-added` and `.diff-deleted`:
```css
.diff-added {
  background: #eefbf3;
}

.diff-deleted {
  background: #fdf2f2;
}
```
Append these new utilities at the end of the file:
```css
.card {
  border: 1px solid var(--color-line);
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(6, 78, 59, 0.06);
}

.panel-dark {
  background: #0c1512;
  border-radius: 14px;
}

.pill {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 2px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.pill-warn { color: #92400e; background: #fef3c7; }
.pill-ok   { color: #166534; background: #eefbf3; }
.pill-bad  { color: #991b1b; background: #fdf2f2; }
```
Leave the existing keyframes and the `.settings-pulse`/`.settings-callout`/`.reveal`/`.fade-in`/`.section-label`/`.serif-quote` rules as-is (they consume the tokens and re-theme automatically — `merge-glow` now glows green via `--color-mesa`). The `.section-number` rule can stay defined; its usage is removed in Task 2.

- [ ] **Step 4: Build to verify the theme compiles**

Run: `npm run build`
Expected: succeeds, zero TypeScript errors. (Visual: the app is now white + green with Inter/Newsreader; some components still have square corners until Task 4 — that's expected.)

- [ ] **Step 5: Commit**

```bash
git add client/index.html client/src/index.css
git commit -m "feat(ui): law-firm-modern theme tokens, fonts, card/pill utilities"
```

---

### Task 2: Layout restructure + HowItWorks explainer

**Files:**
- Create: `client/src/components/HowItWorks.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: theme tokens + `.card`/`.panel-dark`/`.pill` from Task 1; existing hooks/components unchanged.
- Produces: `<HowItWorks />` (no props); a restructured `App` layout that Task 3 then wires for animation. Keeps the existing review-phase logic working (`phase`/`vizPhase` as today) — Task 3 upgrades it.

> **Context:** The current `App.tsx` renders sections with giant `<div className="section-number">01</div>` asides and a beige hero. This task replaces the header/hero/section chrome with the law-firm-modern layout from the spec mock, inserts the HowItWorks strip under the hero, and wraps `BranchVisualization` in a `.panel-dark` panel. Do NOT change the review/approval logic or the hooks. Keep `SettingsCog`, the clear-keys modal, and the settings callout exactly as they are (re-themed only via tokens).

- [ ] **Step 1: Create `HowItWorks.tsx`**

```tsx
const STEPS = [
  { n: "①", title: "Fork", body: "Three counsel branch the contract on Mesa — instant, isolated, no copy." },
  { n: "②", title: "Approve", body: "You accept or reject each clause. The gate resumes from exact state." },
  { n: "③", title: "Merge", body: "Approved edits land on main as a new version." },
  { n: "④", title: "Audit", body: "Every decision kept immutably — author, reason, rollback." },
];

export function HowItWorks() {
  return (
    <div className="card p-5">
      <div className="section-label mb-4">How it works</div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex sm:block items-start gap-3">
            <div className="text-2xl text-mesa leading-none">{s.n}</div>
            <div>
              <div className="font-sans text-sm font-semibold mt-2 mb-1">{s.title}</div>
              <p className="text-xs text-mute leading-relaxed">{s.body}</p>
            </div>
            {i < STEPS.length - 1 && <span className="hidden" />}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Restructure `App.tsx` — imports, header, hero, HowItWorks, sections**

In `client/src/App.tsx`, add the import:
```tsx
import { HowItWorks } from "./components/HowItWorks.js";
```
Replace the `<header>…</header>` block with the re-themed bar (green wordmark tile, rounded settings/clear buttons):
```tsx
      <header className="border-b border-line bg-canvas/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-mesa flex items-center justify-center text-white font-display italic text-sm leading-none">m</div>
            <span className="font-mono text-xs tracking-[0.14em] uppercase">Mesa</span>
            <span className="text-mute-2">·</span>
            <span className="font-display italic text-base text-ink-2">Contract Desk</span>
          </div>
          <div className="flex items-center gap-4">
            {activeBackend && (
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-mute">
                <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                <span>backend: {activeBackend.name}</span>
              </div>
            )}
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.3</span>
            {(keys.mesa || keys.anthropic) && (
              <button onClick={() => setShowClearConfirm(true)} className="font-mono text-[10px] uppercase tracking-widest text-mute hover:text-down border border-line rounded-md hover:border-down/40 px-3 py-1.5 transition-colors">
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
                  <div className="bg-ink text-white px-4 py-2.5 rounded-lg font-mono text-[11px] tracking-wide whitespace-nowrap">Add API keys to use the demo</div>
                </div>
              )}
              {!keys.anthropic && !hasOpenedSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mesa settings-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>
```
Replace the `<main>` opening + hero `<section>` + the first hairline with:
```tsx
      <main className="max-w-6xl mx-auto px-8 py-14">
        {/* Hero */}
        <section className="rounded-2xl bg-gradient-to-b from-canvas to-canvas-2 border border-line px-9 py-12 mb-8 reveal">
          <div className="pill pill-ok mb-4">Counsel-in-the-loop · versioned filesystem</div>
          <h1 className="display-heading text-5xl md:text-6xl leading-[1.04] max-w-2xl">
            Three agents redline.<br /><span className="text-mesa">You approve every change.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-7">
            <button onClick={start} disabled={busy || !!review} className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-mesa text-white font-semibold text-sm hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Working" : review ? "Review in progress" : "Run review"}
              <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
            {!keys.anthropic && (
              <span className="text-sm text-mute">Runs with sample redlines — add an Anthropic key in Settings for live agents.</span>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className="mb-8"><HowItWorks /></section>
```
Now replace each numbered section. The pattern: drop the `<aside>` with `.section-number`, use a simple labeled card section. Replace the Contract section (01) with:
```tsx
        {/* Contract */}
        <section className="mb-8">
          <div className="section-label mb-3">The contract</div>
          {contract && <ContractView contract={contract} />}
        </section>
```
Replace the Review (02) section with (keep the same `review.status === "picking"` guard and the `BranchVisualization` + `RedlineComparison`, but wrap the viz in a dark panel):
```tsx
        {review && review.status === "picking" && (
          <section className="mb-8">
            <div className="section-label mb-3">Review</div>
            {vizPhase && (
              <div className="panel-dark p-5 mb-6">
                <BranchVisualization key={vizGeneration} phase={vizPhase} events={mesaEvents} />
              </div>
            )}
            <RedlineComparison strategies={strategies} onPick={pick} busy={busy} />
          </section>
        )}
```
Replace the Approval (03) section with:
```tsx
        {review && review.status === "gating" && (
          <section className="mb-8">
            <div className="section-label mb-3">Approval gate</div>
            <ApprovalGate review={review} onApprove={approve} onReject={reject} onRollback={rollback} onMerge={merge} busy={busy} />
          </section>
        )}
```
Replace the Audit (04) and Activity (05) sections with:
```tsx
        <section className="mb-8">
          <div className="section-label mb-3">Audit trail</div>
          <AuditTrail events={auditEvents} />
        </section>

        <section className="mb-8">
          <div className="section-label mb-3">Activity</div>
          <ActivityFeed events={mesaEvents} connected={sseConnected} />
        </section>
      </main>
```
Remove the now-unused hairline `<div className="hairline mb-20" />` separators and the `<div className="section-number">NN</div>` asides throughout. Re-theme the footer: change `bg-ink`/text classes to the new tokens (the footer keeps its copy; just ensure it uses `border-line`, `text-mute`, `font-display`). Leave the clear-keys confirmation modal and `SettingsPanel` invocation as-is (they re-theme via tokens; Task 4 polishes SettingsPanel).

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: zero TypeScript errors. (Visual: new header, hero card, how-it-works strip, dark pipeline panel during picking. Leaf cards get rounded in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/HowItWorks.tsx client/src/App.tsx
git commit -m "feat(ui): restructure layout, add how-it-works strip, dark pipeline panel"
```

---

### Task 3: Animation lifecycle + BranchVisualization re-theme

**Files:**
- Modify: `client/src/App.tsx` (phase state machine)
- Modify: `client/src/components/BranchVisualization.tsx` (dark-panel palette)

**Interfaces:**
- Consumes: `useReview` state (`review`, `busy`), `useMesaEvents`, `VizPhase` from BranchVisualization.
- Produces: a `vizPhase` driven through `fork → analyze → done → merge → complete` from real workflow state, and a `BranchVisualization` themed for the dark panel.

> **Context:** Today `App` sets `vizPhase` to only `"analyze"` (picking) or `"done"` (gating); the fork and merge animations never play. This task adds a lifecycle that plays `fork`→`analyze` while agents run, `done` when strategies are ready, and `merge`→`complete` when the user merges (holding a brief window before the gate clears). It also re-themes the SVG for the dark panel and shows the pipeline during gating + the merge moment, not just picking.

- [ ] **Step 1: Add the merge/complete window + lifecycle phase in `App.tsx`**

Add state near the other `useState` calls:
```tsx
  const [vizPhase, setVizPhase] = useState<VizPhase | null>(null);
  const [mergeViz, setMergeViz] = useState(false);
```
Remove the existing `const phase = …` / `const vizPhase = …` derived lines. Replace the existing `useEffect(() => { if (busy) setVizGeneration… }, [busy])` and phase derivation with a lifecycle effect:
```tsx
  // Drive the pipeline animation from real workflow state.
  useEffect(() => {
    if (mergeViz) return; // hold merge/complete window
    if (!review) { setVizPhase(null); return; }
    if (review.status === "picking") {
      const agentsStarted = mesaEvents.some((e) => e.type === "analysis_started");
      setVizPhase(agentsStarted ? "analyze" : "fork");
    } else if (review.status === "gating") {
      setVizPhase("done");
    }
  }, [review, mesaEvents, mergeViz]);

  useEffect(() => {
    if (busy && review?.status === "picking") setVizGeneration((g) => g + 1);
  }, [busy, review]);
```
Wrap the `merge` action so the pipeline plays merge→complete before the gate disappears. Replace the `merge` passed to `ApprovalGate` with a local handler:
```tsx
  const handleMerge = useCallback(async () => {
    setMergeViz(true);
    setVizPhase("merge");
    setTimeout(() => setVizPhase("complete"), 700);
    await merge();
    setTimeout(() => { setMergeViz(false); setVizPhase(null); }, 1700);
  }, [merge]);
```
Use `onMerge={handleMerge}` in the `ApprovalGate` render.

- [ ] **Step 2: Show the pipeline during gating + merge, not only picking**

In `App.tsx`, the pipeline panel currently renders only inside the `review.status === "picking"` section. Add a persistent pipeline panel above the contract whenever `vizPhase` is set, and remove the one nested in the picking section. Insert right after the HowItWorks `<section>`:
```tsx
        {vizPhase && (
          <section className="mb-8">
            <div className="panel-dark p-5">
              <BranchVisualization key={vizGeneration} phase={vizPhase} events={mesaEvents} winnerAgent={mergeViz ? review?.posture ?? undefined : undefined} />
            </div>
          </section>
        )}
```
And in the picking section from Task 2, delete the nested `{vizPhase && (<div className="panel-dark …"><BranchVisualization …/></div>)}` block (keep only `RedlineComparison`).

> Note: `winnerAgent` expects the agent key. `BranchVisualization`'s `AGENTS` keys are `"Aggressive"/"Balanced"/"Minimal"` (capitalized); `review.posture` is lowercase `"balanced"`. Map it: pass `winnerAgent={mergeViz && review?.posture ? review.posture.charAt(0).toUpperCase() + review.posture.slice(1) : undefined}`.

- [ ] **Step 3: Re-theme `BranchVisualization.tsx` for the dark panel**

The SVG sits on `#0c1512` now. Update colors so nodes/text read on dark:
- Change the `main` node `fill="var(--color-ink)"` (two places: start node cx=60 and merged node cx=700) to `fill="#34d399"`.
- Change every `text` `fill="var(--color-ink)"`/`fill="var(--color-ink-2)"` to `fill="#cbd5e1"`, and `fill="var(--color-mute)"`/`mute-2` to `fill="#7fb8a4"`.
- The agent branch colors in `AGENTS` already use `var(--color-down)` (aggressive→red), `var(--color-fundamentals)` (balanced→green), `var(--color-mute)` (minimal→grey). On dark these read acceptably, but bump minimal grey to `#94a3b8`: change the Minimal agent's `color: "var(--color-mute)"` to `color: "#94a3b8"`.
- The merge path `stroke="var(--color-ink)"` → `stroke="#34d399"`; merged-node text → `#cbd5e1`.
- The phase description `<p className="section-label …">` lines render below the SVG (still on dark) — wrap them so they read on dark: change the container `<div className="text-center mt-4">` to `<div className="text-center mt-4 [&_p]:!text-[#7fb8a4]">`.
- The activity dots `fill={agent.color}` stay.

Keep all geometry, phases, and animation timing unchanged.

- [ ] **Step 4: Build + manual smoke**

Run: `npm run build`
Expected: zero errors.
Then manually: `rm -rf mesa-repo && (npm run dev:server &) && sleep 3 && (npm run dev:client &) && sleep 3` and open the local URL. Click **Run review** → the dark pipeline forks three branches and the agent nodes pulse, then settle to "choose a strategy"; pick one → gate appears with pipeline still shown; approve all → **Merge** plays the merge-back-to-main glow (`main v2`) before the gate clears. Stop servers (`pkill -f "tsx watch"; pkill -f vite`).

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/components/BranchVisualization.tsx
git commit -m "feat(ui): drive pipeline animation through full lifecycle; theme viz for dark panel"
```

---

### Task 4: Re-theme leaf components (cards, pills, diffs)

**Files:**
- Modify: `client/src/components/ContractView.tsx`, `StrategyCard.tsx`, `RedlineComparison.tsx`, `ApprovalGate.tsx`, `AuditTrail.tsx`, `ActivityFeed.tsx`, `SettingsPanel.tsx`

**Interfaces:**
- Consumes: theme tokens + `.card`/`.pill*` utilities from Task 1. No prop/logic changes — className/markup only.

> **Context:** These components currently use hard-edged `border border-line` blocks. Re-theme them to the rounded, soft-shadowed, pill-using law-firm-modern look. **Apply these transform rules consistently; do not change any logic, props, or text content** (except where a class is named below). Build must stay green.

**Transform rules (apply to each file):**
- Outer container `border border-line` (a card/panel) → `card` (the utility: rounded + shadow + white bg). Keep any `divide-y divide-line` inner separators.
- Section header rows inside cards: keep `border-b border-line`, keep `.section-label`.
- Buttons: primary actions `bg-ink text-canvas` → `bg-mesa text-white rounded-lg`; the merge button `bg-mesa text-canvas` → `bg-mesa text-white rounded-lg`; secondary/outline buttons add `rounded-lg`. `hover:bg-up` stays (approve), `hover:bg-ink` on merge → `hover:bg-[color:var(--color-up)]`.
- Status text → pills: wherever a small status word renders (e.g. "Needs approval", "paused…", audit kinds), use `<span className="pill pill-warn">…</span>` (amber), `pill-ok` (green, approved), `pill-bad` (red, rejected).
- Diff blocks: keep `.diff-added`/`.diff-deleted` (now the new tints); set deleted text to `text-down`, added text to `text-up`; keep `line-through` on deleted.

- [ ] **Step 1: `ContractView.tsx`** — change the outer `<div className="border border-line">` to `<div className="card">`. Keep the header row and `divide-y divide-line/60`. Title stays `display-heading`.

- [ ] **Step 2: `StrategyCard.tsx`** — outer `<article className="bg-canvas border border-line hover:border-ink/30 p-6 …">` → `<article className="card p-6 hover:shadow-[0_6px_18px_rgba(6,78,59,0.10)] transition-shadow …">`. The pick button `bg-ink text-canvas hover:bg-mesa` → `bg-mesa text-white rounded-lg hover:bg-[color:var(--color-up)]`. POSTURE_META colors already map (aggressive `text-down`, balanced `text-fundamentals`, minimal `text-mute`) — leave them.

- [ ] **Step 3: `RedlineComparison.tsx`** — the grid wrapper `border-t border-line` and card borders: change the per-card wrapper `border-b border-r last:border-r-0 border-line` to `p-2` and let each `StrategyCard` be its own `.card` (remove the shared grid borders so cards float). Keep the 3-up `grid`. Header `display-heading` stays.

- [ ] **Step 4: `ApprovalGate.tsx`** — outer `<div className="border border-line">` → `<div className="card overflow-hidden">`. Add a progress bar at the top of the body: right after the header, insert
```tsx
      <div className="h-1.5 bg-line/60"><div className="h-full bg-mesa transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
```
Change the "Paused on Mesa · resumes from exact state…" line into a pill: wrap it as `<span className="pill pill-warn">paused · resumes from exact state</span>`. The REVISE/INSERT/DELETE label `text-mesa` stays. Deleted diff: add `text-down`; added diff: `text-ink` → `text-up`. Approve button `bg-ink text-canvas hover:bg-up` → `bg-mesa text-white rounded-lg hover:bg-[color:var(--color-up)]`; Reject button add `rounded-lg`; roll-back add `rounded-lg`. Merge button `bg-mesa text-canvas hover:bg-ink` → `bg-mesa text-white rounded-lg hover:bg-[color:var(--color-up)]`. Remove the inline `font-serif` on the diff blocks so the clause text renders in the body sans (Inter) — do not add `font-display` (that's for headings).

- [ ] **Step 5: `AuditTrail.tsx`** — outer container → `card`. The `KIND_META` color classes map to tokens already; render each kind label as a pill: wrap the kind label span with `pill` plus `pill-ok` (approved/merged), `pill-bad` (rejected), or a neutral `pill` (proposed/rolled_back). Keep `max-h` scroll + `divide-y`.

- [ ] **Step 6: `ActivityFeed.tsx`** — outer container `border border-line` → `card`. Keep the connected dot + rows. (Read the file; apply the outer-card rule and ensure any `bg-canvas`/`text-ink` still reference tokens — they do.)

- [ ] **Step 7: `SettingsPanel.tsx`** — the flyout `bg-canvas border-l border-line` stays (it's a panel, not a card). Re-theme the inner backend/option blocks: any `border border-line p-6` option cards → add `rounded-xl`; primary buttons `bg-ink text-canvas` → `bg-mesa text-white rounded-lg`; the "● Active"/status uses `text-mesa` (now green) automatically. Keep all props and logic. (Read the file; apply rounding to the bordered option blocks and `rounded-lg` to buttons.)

- [ ] **Step 8: Build + visual self-check**

Run: `npm run build`
Expected: zero TypeScript errors. Self-check each changed component's markup against the spec mock (rounded white cards, green primary buttons, amber/green/red pills, red/green diffs). No square `border border-line` cards should remain on the main page surfaces.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/
git commit -m "feat(ui): re-theme leaf components — rounded cards, pills, redline diffs"
```

---

## Self-Review

**Spec coverage:**
- Theme tokens (palette + fonts, no beige) → Task 1. ✓
- Newsreader/Inter/JetBrains Mono + title → Task 1 (index.html). ✓
- Drop "01/02" section numbers; new hero + header → Task 2. ✓
- How-it-works 4-step strip → Task 2 (`HowItWorks.tsx`). ✓
- Animated pipeline driven through full lifecycle (fork→analyze→done→merge→complete) + merge window → Task 3. ✓
- Pipeline on dark panel, re-themed SVG → Task 3. ✓
- Rounded cards / shadows / pills / diffs across leaf components → Task 4. ✓
- Preserve functionality (backends, settings, clear-keys, canned fallback) → no hook/route changes; settings/clear-keys markup preserved (Tasks 2, 4). ✓
- Build-green + manual visual verification (no UI test runner) → every task. ✓

**Placeholder scan:** No TBD/TODO; every step has concrete classes/code. The two "Read the file; apply the rule" steps (ActivityFeed, SettingsPanel) name the exact transform (outer→`card`, buttons→`bg-mesa text-white rounded-lg`) rather than leaving it open. ✓

**Type/name consistency:** `VizPhase` values used (`fork`/`analyze`/`done`/`merge`/`complete`) match the component's exported union. `winnerAgent` casing mapping (lowercase `review.posture` → capitalized `AGENTS` key) handled explicitly in Task 3 Step 2. `.card`/`.pill`/`.pill-warn`/`.pill-ok`/`.pill-bad`/`.panel-dark` defined in Task 1 and consumed in Tasks 2–4. ✓
