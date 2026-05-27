# Animated Branch Visualization — Design Spec

## Goal

Replace the text-based loading indicator with an animated SVG branch visualization that shows the entire Mesa fork → analyze → merge workflow in real time. Make the branching model visually obvious to someone seeing the demo for the first time.

## Architecture

A single `BranchVisualization` component renders an SVG tree diagram that persists across all analysis states (loading, done, merging). It animates through five phases driven by SSE events. Pure SVG + CSS animations — no external libraries.

## Visual Layout

Horizontal left-to-right flow inside the analysis section (col-span-10):

```
                              ┌───────────────────┐
                         ┌───→│ ◆ Fundamentals     │
┌──────────┐             │    └───────────────────┘
│  main ●  │─────────────┤    ┌───────────────────┐          ┌──────────┐
└──────────┘             ├───→│ ● Sentiment        │─────────→│ main' ●  │
                         │    └───────────────────┘          └──────────┘
                         │    ┌───────────────────┐
                         └───→│ ▲ Technical        │
                              └───────────────────┘
```

SVG viewBox: `0 0 800 260`. Responsive width via CSS (`w-full`, `max-w-2xl`, `mx-auto`).

### Coordinates

| Element | Position |
|---------|----------|
| Main node | cx=60, cy=130 |
| Fork point | x=100 (where paths diverge from main) |
| Fundamentals node | cx=440, cy=50 |
| Sentiment node | cx=440, cy=130 |
| Technical node | cx=440, cy=210 |
| Merge path target | cx=700, cy=130 |

### Branch Paths

Three cubic bezier curves from the main node to each agent node:

```
Fundamentals: M 68,130 C 180,130 260,50  432,50
Sentiment:    M 68,130 C 180,130 260,130 432,130
Technical:    M 68,130 C 180,130 260,210 432,210
```

Merge path (dynamic, only for winning agent — example for sentiment):
```
M 448,130 C 530,130 580,130 692,130
```

For non-center agents merging, the curve bends back to center:
```
Fundamentals: M 448,50  C 530,50  600,130 692,130
Technical:    M 448,210 C 530,210 600,130 692,130
```

### Node Design

- Main node: 10px radius circle, `fill: var(--color-ink)`, label "main" below in mono 11px
- Agent nodes: 8px radius circle, agent color fill when active, `stroke-only` when waiting
- Merged node: 10px radius circle, same as main node styling, label "main" below
- Agent labels: mono 11px, positioned right of each agent node

### Path Styling

- Default: 2px stroke, `var(--color-line-2)` color
- Active/drawing: agent color stroke
- Merge path: `var(--color-ink)` stroke, 2.5px
- All paths use `stroke-linecap: round` and `stroke-linejoin: round`

## Animation Phases

### Phase 1: Fork (on `analysis_started` event)

**Duration:** ~1.2s total

1. Main node scales in from 0 → 1 (0.3s ease-out)
2. "main" label fades in (0.2s)
3. Three branch paths draw via `stroke-dashoffset` animation:
   - Fundamentals: delay 0.2s, duration 0.6s
   - Sentiment: delay 0.4s, duration 0.6s
   - Technical: delay 0.6s, duration 0.6s
4. Agent nodes scale in at the end of their respective path animation (0.2s pop)
5. Agent labels and sigils fade in alongside nodes

**CSS technique:** Each `<path>` has `stroke-dasharray` set to its total length. Animate `stroke-dashoffset` from `totalLength` to `0`. Use CSS `@keyframes` with the path's `pathLength="1"` attribute for simplicity:

```css
.branch-path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw-branch 0.6s ease-out forwards;
}

@keyframes draw-branch {
  to { stroke-dashoffset: 0; }
}
```

### Phase 2: Analyze (agents working)

**Duration:** Variable (real-time, event-driven)

1. Active agent nodes pulse: scale 1.0 → 1.12 → 1.0, repeating 1.4s, agent color
2. A small "activity dot" travels along each active branch path periodically (every 2s):
   - 4px circle, agent color, 40% opacity
   - Animates along the path using CSS `offset-path` or SVG `<animateMotion>`
   - Duration 1s per traversal
3. On `agent_complete` event for a specific agent:
   - Stop pulse, solid fill
   - Scale pop: 1.0 → 1.2 → 1.0 (0.3s)
   - Checkmark or filled state
   - Branch path transitions to full opacity

### Phase 3: Compare (all agents complete, `status === "done"`)

1. All three branches at full opacity, solid agent nodes
2. Subtle synchronized pulse on all three agent nodes (slow, every 3s) — "pick one"
3. The visualization remains visible above the ComparisonView cards
4. Optional: when user hovers an AgentCard, the corresponding branch path brightens (CSS `:hover` cascade via shared class or React state)

### Phase 4: Merge (user clicks "Choose strategy", `status === "merging"`)

**Duration:** ~1.5s

1. Winning branch path thickens (2px → 3px) and transitions to `var(--color-ink)`
2. Losing branches: paths and nodes fade to 15% opacity (0.4s)
3. Merge path draws from winning agent node to merged main node:
   - Same `stroke-dashoffset` animation, 0.8s duration
   - `var(--color-ink)` stroke
4. Merged "main'" node scales in at the end of merge path (0.2s pop)
5. "main" label appears below merged node

### Phase 5: Complete (after merge API returns)

1. Brief glow on merged node (box-shadow or SVG filter, 0.5s)
2. Entire visualization fades to 0 over 0.6s
3. Component unmounts (parent transitions to idle state)

## Component API

```typescript
interface BranchVisualizationProps {
  phase: "fork" | "analyze" | "done" | "merge" | "complete";
  events: MesaActivityEvent[];
  winnerAgent?: string;    // "Fundamentals" | "Sentiment" | "Technical"
  winnerBranch?: string;   // "agent/fundamentals" etc.
}
```

### Phase Mapping (in App.tsx)

| `state.status` | `phase` prop |
|----------------|-------------|
| `"loading"` + no `analysis_started` event | `"fork"` |
| `"loading"` + `analysis_started` event | `"analyze"` |
| `"done"` | `"done"` |
| `"merging"` | `"merge"` |
| After merge, brief delay | `"complete"` |

## Internal State

The component tracks per-agent status derived from SSE events:

```typescript
type NodeStatus = "hidden" | "forking" | "active" | "complete";

interface AgentNode {
  key: string;           // "Fundamentals"
  status: NodeStatus;
  color: string;         // CSS variable name
  sigil: string;         // ◆, ●, ▲
  y: number;             // SVG y-coordinate
}
```

A `useEffect` watches the `events` array and `phase` prop to advance internal state. Animation timing is CSS-driven (not JS timers) for smoothness.

## Integration into App.tsx

The analysis section (Section 02) currently shows:
- `AnalysisLoading` when `status === "loading"`
- `ComparisonView` when `status === "done"`
- Merge spinner when `status === "merging"`

**New structure:**

```tsx
{(state.status === "loading" || state.status === "done" || state.status === "merging") && (
  <>
    <BranchVisualization
      phase={computePhase(state, mesaEvents)}
      events={mesaEvents}
      winnerAgent={state.status === "merging" ? state.agentName : undefined}
    />

    {state.status === "loading" && (
      <div className="text-center mt-6">
        <p className="section-label">Each agent reads portfolio, fetches market data, writes proposal</p>
      </div>
    )}

    {state.status === "done" && (
      <ComparisonView results={state.results} onAccept={handleAccept} onDismiss={handleDismiss} diffs={state.diffs} />
    )}

    {state.status === "merging" && (
      <div className="text-center mt-6">
        <p className="section-label text-mesa">Merging {state.agentName} strategy to main…</p>
      </div>
    )}
  </>
)}
```

The `AnalysisLoading` component is removed entirely. The merge spinner is replaced by the merge animation in the visualization.

## CSS Additions

New keyframes and classes added to `index.css`:

```css
@keyframes draw-branch {
  to { stroke-dashoffset: 0; }
}

@keyframes node-pop {
  0%   { transform: scale(0); }
  70%  { transform: scale(1.2); }
  100% { transform: scale(1); }
}

@keyframes node-pulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50%      { transform: scale(1.12); opacity: 1; }
}

@keyframes merge-glow {
  0%   { filter: drop-shadow(0 0 0 transparent); }
  50%  { filter: drop-shadow(0 0 6px var(--color-mesa)); }
  100% { filter: drop-shadow(0 0 0 transparent); }
}
```

The existing `branch-grow` keyframe in index.css (currently unused) will be removed — it's replaced by `draw-branch`.

## File Changes

| File | Action |
|------|--------|
| `client/src/components/BranchVisualization.tsx` | **Create** — new component |
| `client/src/components/AnalysisLoading.tsx` | **Delete** — replaced by BranchVisualization |
| `client/src/App.tsx` | **Modify** — swap AnalysisLoading for BranchVisualization, adjust section 02 layout |
| `client/src/index.css` | **Modify** — add SVG animation keyframes, remove unused `branch-grow` |

## Design Principles

- **No external libraries.** SVG + CSS animations match the existing infrastructure.
- **Event-driven, not timer-driven.** Real SSE events control state transitions. CSS handles animation smoothness.
- **Editorial aesthetic.** Clean lines, earth tones, agent colors. Fraunces labels. Matches the existing design system exactly.
- **Progressive disclosure.** The visualization tells a story over time — fork, work, compare, merge — making Mesa's branching model self-evident.
- **Responsive.** SVG viewBox scales. On narrow screens, the visualization stacks or scrolls naturally.

## Edge Cases

- **Agent errors:** If an agent fails, its node shows an error state (X mark, `var(--color-down)` fill) instead of complete
- **All agents fail:** Visualization shows error state on all branches, transitions to error message
- **Replay:** Same visualization plays for replay rounds (events still fire via SSE)
- **Dismiss (discard all):** All branches fade out simultaneously, no merge path drawn
- **Quick completion:** If agents complete faster than fork animation, skip ahead — don't block on animation
