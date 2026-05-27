# Animated Branch Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the text-based analysis loading indicator with an animated SVG branch visualization that shows fork → analyze → merge in real time.

**Architecture:** Single `BranchVisualization` React component using inline SVG with CSS animations. Driven by SSE events via existing `useMesaEvents` hook. No external libraries.

**Tech Stack:** React, SVG, CSS keyframe animations, existing SSE infrastructure

---

### Task 1: Add SVG animation keyframes to index.css

**Files:**
- Modify: `client/src/index.css:131-134` (replace unused `branch-grow` keyframe)

- [ ] **Step 1: Replace the unused `branch-grow` keyframe and add new SVG animation keyframes**

In `client/src/index.css`, replace the `@keyframes branch-grow` block (lines 131-134) and add the following after the existing `@keyframes draw-line` block:

```css
@keyframes draw-branch {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}

@keyframes node-enter {
  0%   { transform: scale(0); opacity: 0; }
  70%  { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes node-pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50%      { transform: scale(1.15); opacity: 1; }
}

@keyframes node-complete-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}

@keyframes merge-glow {
  0%   { filter: drop-shadow(0 0 0px transparent); }
  50%  { filter: drop-shadow(0 0 8px var(--color-mesa)); }
  100% { filter: drop-shadow(0 0 0px transparent); }
}

@keyframes travel-dot {
  0%   { offset-distance: 0%; opacity: 0; }
  10%  { opacity: 0.5; }
  90%  { opacity: 0.5; }
  100% { offset-distance: 100%; opacity: 0; }
}
```

Also remove the existing unused `@keyframes branch-grow` block and its comment if any.

- [ ] **Step 2: Verify no other code references `branch-grow`**

Run: `grep -r "branch-grow" client/`
Expected: No results (this keyframe is unused).

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat(css): add SVG branch animation keyframes, remove unused branch-grow"
```

---

### Task 2: Create BranchVisualization component

**Files:**
- Create: `client/src/components/BranchVisualization.tsx`

This is the core component. It renders an SVG with:
- A main node on the left
- Three bezier branch paths to agent nodes
- A merge path and merged node (visible only during merge/complete phases)
- All animation driven by CSS classes toggled via React state

- [ ] **Step 1: Create the component file with types and constants**

Create `client/src/components/BranchVisualization.tsx`:

```tsx
import { useMemo } from "react";
import type { MesaActivityEvent } from "../types.js";

export type VizPhase = "fork" | "analyze" | "done" | "merge" | "complete";

interface BranchVisualizationProps {
  phase: VizPhase;
  events: MesaActivityEvent[];
  winnerAgent?: string;
}

type NodeStatus = "hidden" | "forking" | "active" | "complete" | "error";

interface AgentDef {
  key: string;
  label: string;
  sigil: string;
  color: string;
  y: number;
  forkDelay: string;
  path: string;
  mergePath: string;
}

const AGENTS: AgentDef[] = [
  {
    key: "Fundamentals",
    label: "Fundamentals",
    sigil: "◆",
    color: "var(--color-fundamentals)",
    y: 50,
    forkDelay: "0.2s",
    path: "M 68,130 C 180,130 260,50 432,50",
    mergePath: "M 448,50 C 540,50 600,130 692,130",
  },
  {
    key: "Sentiment",
    label: "Sentiment",
    sigil: "●",
    color: "var(--color-sentiment)",
    y: 130,
    forkDelay: "0.4s",
    path: "M 68,130 C 180,130 260,130 432,130",
    mergePath: "M 448,130 C 540,130 600,130 692,130",
  },
  {
    key: "Technical",
    label: "Technical",
    sigil: "▲",
    color: "var(--color-technical)",
    y: 210,
    forkDelay: "0.6s",
    path: "M 68,130 C 180,130 260,210 432,210",
    mergePath: "M 448,210 C 540,210 600,130 692,130",
  },
];

function getAgentNodeStatus(
  agentKey: string,
  phase: VizPhase,
  events: MesaActivityEvent[]
): NodeStatus {
  if (phase === "fork") return "forking";

  const hasError = events.some(
    (e) => e.type === "agent_complete" && e.agent === agentKey && e.detail.toLowerCase().includes("error")
  );
  if (hasError) return "error";

  const isComplete = events.some(
    (e) => e.type === "agent_complete" && e.agent === agentKey
  );
  if (isComplete) return "complete";

  const hasStarted = events.some((e) => e.type === "analysis_started");
  if (hasStarted) return "active";

  return "forking";
}
```

- [ ] **Step 2: Add the main render function**

Append to the same file, the exported component:

```tsx
export function BranchVisualization({ phase, events, winnerAgent }: BranchVisualizationProps) {
  const agentStatuses = useMemo(() => {
    return AGENTS.map((a) => ({
      ...a,
      status: getAgentNodeStatus(a.key, phase, events),
    }));
  }, [phase, events]);

  const showMerge = phase === "merge" || phase === "complete";
  const winner = AGENTS.find((a) => a.key === winnerAgent);

  return (
    <div className="w-full max-w-2xl mx-auto my-8 fade-in">
      <svg
        viewBox="0 0 760 260"
        className="w-full"
        style={{ overflow: "visible" }}
      >
        {/* Main node */}
        <circle
          cx={60}
          cy={130}
          r={10}
          fill="var(--color-ink)"
          style={{
            transformOrigin: "60px 130px",
            animation: "node-enter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both",
          }}
        />
        <text
          x={60}
          y={160}
          textAnchor="middle"
          fill="var(--color-ink)"
          fontFamily="var(--font-mono)"
          fontSize={11}
          style={{ animation: "fade-in 0.3s 0.2s both" }}
        >
          main
        </text>

        {/* Branch paths */}
        {agentStatuses.map((agent) => {
          const isWinner = winnerAgent === agent.key;
          const isLoser = showMerge && !isWinner;

          return (
            <path
              key={`path-${agent.key}`}
              d={agent.path}
              fill="none"
              stroke={phase === "fork" ? "var(--color-line-2)" : agent.color}
              strokeWidth={showMerge && isWinner ? 2.5 : 2}
              strokeLinecap="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 0,
                animation: `draw-branch 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) ${agent.forkDelay} both`,
                opacity: isLoser ? 0.15 : 1,
                transition: "opacity 0.5s ease, stroke-width 0.3s ease, stroke 0.3s ease",
              }}
            />
          );
        })}

        {/* Activity dots traveling along paths during analyze phase */}
        {phase === "analyze" &&
          agentStatuses
            .filter((a) => a.status === "active")
            .map((agent) => (
              <circle
                key={`dot-${agent.key}`}
                r={3}
                fill={agent.color}
                opacity={0}
                style={{
                  offsetPath: `path("${agent.path}")`,
                  animation: `travel-dot 1.8s ease-in-out ${agent.forkDelay} infinite`,
                }}
              />
            ))}

        {/* Agent nodes */}
        {agentStatuses.map((agent) => {
          const isWinner = winnerAgent === agent.key;
          const isLoser = showMerge && !isWinner;
          const nodeDelay = `${parseFloat(agent.forkDelay) + 0.5}s`;

          let nodeAnimation = `node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) ${nodeDelay} both`;
          if (agent.status === "active") {
            nodeAnimation = `node-pulse 1.4s ease-in-out infinite`;
          } else if (agent.status === "complete" && phase === "analyze") {
            nodeAnimation = `node-complete-pop 0.35s ease-out both`;
          }

          return (
            <g key={`node-${agent.key}`}>
              <circle
                cx={440}
                cy={agent.y}
                r={8}
                fill={
                  agent.status === "complete" || phase === "done" || showMerge
                    ? agent.color
                    : "none"
                }
                stroke={agent.color}
                strokeWidth={2}
                style={{
                  transformOrigin: `440px ${agent.y}px`,
                  animation: nodeAnimation,
                  opacity: isLoser ? 0.15 : 1,
                  transition: "opacity 0.5s ease, fill 0.3s ease",
                }}
              />

              {/* Agent sigil */}
              <text
                x={458}
                y={agent.y - 8}
                fill={isLoser ? "var(--color-mute-2)" : agent.color}
                fontFamily="var(--font-mono)"
                fontSize={11}
                fontWeight={600}
                style={{
                  animation: `fade-in 0.3s ${nodeDelay} both`,
                  transition: "fill 0.5s ease",
                }}
              >
                {agent.sigil}
              </text>

              {/* Agent label */}
              <text
                x={458}
                y={agent.y + 6}
                fill={isLoser ? "var(--color-mute-2)" : "var(--color-ink-2)"}
                fontFamily="var(--font-mono)"
                fontSize={11}
                style={{
                  animation: `fade-in 0.3s ${nodeDelay} both`,
                  transition: "fill 0.5s ease",
                }}
              >
                {agent.label}
              </text>

              {/* Status indicator */}
              {agent.status === "complete" && !showMerge && (
                <text
                  x={458}
                  y={agent.y + 20}
                  fill="var(--color-up)"
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  style={{ animation: "fade-in 0.3s both" }}
                >
                  complete
                </text>
              )}

              {agent.status === "error" && (
                <text
                  x={458}
                  y={agent.y + 20}
                  fill="var(--color-down)"
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  style={{ animation: "fade-in 0.3s both" }}
                >
                  error
                </text>
              )}
            </g>
          );
        })}

        {/* Merge path */}
        {showMerge && winner && (
          <>
            <path
              d={winner.mergePath}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2.5}
              strokeLinecap="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 0,
                animation: "draw-branch 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s both",
              }}
            />

            {/* Merged main node */}
            <g
              style={{
                animation: phase === "complete"
                  ? "merge-glow 1s ease-out both"
                  : "node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) 1s both",
              }}
            >
              <circle
                cx={700}
                cy={130}
                r={10}
                fill="var(--color-ink)"
                style={{
                  transformOrigin: "700px 130px",
                  animation: "node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) 1s both",
                }}
              />
              <text
                x={700}
                y={160}
                textAnchor="middle"
                fill="var(--color-ink)"
                fontFamily="var(--font-mono)"
                fontSize={11}
                style={{ animation: "fade-in 0.3s 1.1s both" }}
              >
                main
              </text>
            </g>
          </>
        )}
      </svg>

      {/* Descriptive text below SVG */}
      <div className="text-center mt-4">
        {phase === "fork" && (
          <p className="section-label fade-in">Forking portfolio to three branches…</p>
        )}
        {phase === "analyze" && (
          <p className="section-label fade-in">
            Agents fetching market data and writing proposals
            <span className="dot-1 ml-1">·</span>
            <span className="dot-2">·</span>
            <span className="dot-3">·</span>
          </p>
        )}
        {phase === "done" && (
          <p className="section-label fade-in">
            All branches ready — choose a strategy to merge
          </p>
        )}
        {phase === "merge" && (
          <p className="section-label fade-in text-mesa">
            Merging {winnerAgent} to main…
          </p>
        )}
        {phase === "complete" && (
          <p className="section-label fade-in text-up">
            Merged successfully
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit --project client/tsconfig.json 2>&1 | head -20` (or equivalent)
Expected: No errors related to BranchVisualization.tsx

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BranchVisualization.tsx
git commit -m "feat: add BranchVisualization SVG component with animated phases"
```

---

### Task 3: Integrate BranchVisualization into App.tsx

**Files:**
- Modify: `client/src/App.tsx`

Replace the `AnalysisLoading` import and usage with `BranchVisualization`. Add a `computePhase` helper that maps the analysis state + SSE events to a visualization phase.

- [ ] **Step 1: Update imports**

In `client/src/App.tsx`, replace:
```tsx
import { AnalysisLoading } from "./components/AnalysisLoading.js";
```
with:
```tsx
import { BranchVisualization, type VizPhase } from "./components/BranchVisualization.js";
```

- [ ] **Step 2: Add phase computation helper**

Add this function inside the `App` component, after the existing hooks and before the `return`:

```tsx
const vizPhase: VizPhase | null = (() => {
  if (state.status === "loading") {
    const hasStarted = mesaEvents.some((e) => e.type === "analysis_started");
    return hasStarted ? "analyze" : "fork";
  }
  if (state.status === "done") return "done";
  if (state.status === "merging") return "merge";
  return null;
})();
```

- [ ] **Step 3: Replace the analysis section content**

Replace the entire Section 02 analysis block. The current code shows `AnalysisLoading`, `ComparisonView`, error, and merging states inside a conditional. Replace it with:

```tsx
{(state.status === "loading" || state.status === "done" || state.status === "error" || state.status === "merging") && (
  <>
    <div className="hairline mb-20" />
    <div className="grid grid-cols-12 gap-8 mb-20">
      <aside className="col-span-12 md:col-span-2">
        <div className="section-number">02</div>
        <div className="section-label mt-4">Analysis</div>
      </aside>
      <div className="col-span-12 md:col-span-10">
        {state.status === "error" && (
          <div className="border border-down/30 bg-down/5 p-8 fade-in">
            <div className="section-label text-down mb-2">Error</div>
            <p className="font-mono text-sm text-down mb-4">{state.message}</p>
            <button
              onClick={analyze}
              className="font-mono text-xs uppercase tracking-widest text-down hover:underline"
            >
              Retry →
            </button>
          </div>
        )}

        {vizPhase && (
          <BranchVisualization
            phase={vizPhase}
            events={mesaEvents}
            winnerAgent={state.status === "merging" ? state.agentName : undefined}
          />
        )}

        {state.status === "done" && (
          <ComparisonView
            results={state.results}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            diffs={state.status === "done" ? state.diffs : undefined}
          />
        )}
      </div>
    </div>
  </>
)}
```

- [ ] **Step 4: Verify the app compiles and renders**

Run: `npx tsc --noEmit --project client/tsconfig.json 2>&1 | head -20`
Expected: No type errors.

Then run `npm run dev` and open http://localhost:4000. The analysis section should show the branch visualization when "Run analysis" is clicked.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: integrate BranchVisualization into analysis section"
```

---

### Task 4: Delete AnalysisLoading component

**Files:**
- Delete: `client/src/components/AnalysisLoading.tsx`

- [ ] **Step 1: Verify AnalysisLoading is no longer imported anywhere**

Run: `grep -r "AnalysisLoading" client/src/`
Expected: Only the file itself shows up (the component definition), no imports.

- [ ] **Step 2: Delete the file**

```bash
rm client/src/components/AnalysisLoading.tsx
```

- [ ] **Step 3: Verify the build still works**

Run: `npx tsc --noEmit --project client/tsconfig.json 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add -u client/src/components/AnalysisLoading.tsx
git commit -m "chore: remove AnalysisLoading, replaced by BranchVisualization"
```

---

### Task 5: Visual polish and edge cases

**Files:**
- Modify: `client/src/components/BranchVisualization.tsx`
- Modify: `client/src/App.tsx`

Handle dismiss (discard all), add a brief "complete" phase after merge, and ensure the visualization fades out gracefully.

- [ ] **Step 1: Add dismiss support**

In `App.tsx`, update the `handleDismiss` function to set a temporary dismiss state, and update the `vizPhase` computation to handle it. The visualization should fade all branches simultaneously when dismissing (no merge path drawn).

In `BranchVisualization.tsx`, when `phase === "merge"` and `winnerAgent` is undefined, treat it as a dismiss: fade all branches to 15% opacity and show "Discarding branches…" text.

- [ ] **Step 2: Add complete phase transition**

After the merge API call returns in `useAnalysis` (when state transitions from "merging" to "idle"), briefly show "complete" phase for 1.5 seconds before hiding the visualization. This can be done with a `useEffect` + `setTimeout` in `App.tsx` that sets a local `showComplete` state.

```tsx
const [showComplete, setShowComplete] = useState(false);

useEffect(() => {
  if (state.status === "idle" && showComplete) {
    const timer = setTimeout(() => setShowComplete(false), 1500);
    return () => clearTimeout(timer);
  }
}, [state.status, showComplete]);
```

Update the vizPhase computation to return `"complete"` when `showComplete` is true.

- [ ] **Step 3: Test all phases manually**

1. Click "Run analysis" → see fork animation → analyze animation with pulsing nodes
2. Wait for completion → all nodes solid, "choose a strategy" text
3. Click "Choose strategy" on one agent → merge animation with path to main'
4. After merge → brief "complete" glow → visualization fades
5. Click "Run analysis" again → click "Discard all" → all branches fade simultaneously

- [ ] **Step 4: Commit**

```bash
git add client/src/components/BranchVisualization.tsx client/src/App.tsx
git commit -m "feat: add dismiss and complete phase to branch visualization"
```

---

### Task 6: Responsive and final cleanup

**Files:**
- Modify: `client/src/components/BranchVisualization.tsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Test responsive behavior**

Open the app at different viewport widths:
- Desktop (1280px+): Full SVG, labels readable
- Tablet (768px): SVG scales down, still legible
- Mobile (375px): SVG shrinks. Ensure labels don't overlap.

If labels overlap on mobile, add a media query or adjust viewBox.

- [ ] **Step 2: Remove unused CSS**

Verify the old `branch-grow` keyframe is gone. Check no dangling references exist.

Run: `grep -r "branch-grow" client/`
Expected: No results.

- [ ] **Step 3: Final build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: responsive polish and cleanup for branch visualization"
```
