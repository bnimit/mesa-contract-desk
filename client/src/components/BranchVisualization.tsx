import { useMemo } from "react";
import type { MesaActivityEvent } from "../types.js";

export type VizPhase = "fork" | "analyze" | "done" | "merge" | "complete";

interface DepartmentDef {
  id: string;
  label: string;
  color: string;
}

interface BranchVisualizationProps {
  phase: VizPhase;
  departments: DepartmentDef[]; // 2–4
  events: MesaActivityEvent[];
  mergeAll?: boolean;
  // back-compat: ignored by the body, kept so App.tsx (pre-F4) doesn't error
  winnerAgent?: string;
}

type NodeStatus = "forking" | "active" | "complete" | "error";

interface BranchDef extends DepartmentDef {
  y: number;
  forkDelay: string;
  path: string;
  mergePath: string;
}

function computeBranches(departments: DepartmentDef[]): BranchDef[] {
  const n = departments.length;
  return departments.map((dept, i) => {
    const y = n === 1 ? 130 : 40 + i * (180 / Math.max(1, n - 1));
    const forkDelay = `${0.2 + i * 0.2}s`;
    const path = `M 68,130 C 180,130 260,${y} 432,${y}`;
    const mergePath = `M 448,${y} C 540,${y} 600,130 692,130`;
    return { ...dept, y, forkDelay, path, mergePath };
  });
}

function getBranchNodeStatus(
  label: string,
  phase: VizPhase,
  events: MesaActivityEvent[]
): NodeStatus {
  if (phase === "fork") return "forking";

  const hasError = events.some(
    (e) =>
      e.type === "agent_complete" &&
      e.agent === label &&
      e.detail.toLowerCase().includes("error")
  );
  if (hasError) return "error";

  const isComplete = events.some(
    (e) => e.type === "agent_complete" && e.agent === label
  );
  if (isComplete) return "complete";

  const hasStarted = events.some((e) => e.type === "analysis_started");
  if (hasStarted) return "active";

  return "forking";
}

export function BranchVisualization({
  phase,
  departments,
  events,
  mergeAll = false,
}: BranchVisualizationProps) {
  const branches = useMemo(() => computeBranches(departments), [departments]);

  const branchStatuses = useMemo(
    () =>
      branches.map((b) => ({
        ...b,
        status: getBranchNodeStatus(b.label, phase, events),
      })),
    [branches, phase, events]
  );

  const showMerge = phase === "merge" || phase === "complete";
  const n = departments.length;

  return (
    <div
      className="w-full max-w-2xl mx-auto my-8 fade-in"
      style={{
        opacity: phase === "complete" ? 0 : undefined,
        transition: phase === "complete" ? "opacity 0.8s 0.8s ease" : undefined,
      }}
    >
      <svg viewBox="0 0 760 260" className="w-full" style={{ overflow: "visible" }}>
        {/* Main node (origin) */}
        <circle
          cx={60}
          cy={130}
          r={10}
          fill="#34d399"
          style={{
            transformOrigin: "60px 130px",
            animation: "node-enter 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both",
          }}
        />
        <text
          x={60}
          y={160}
          textAnchor="middle"
          fill="#cbd5e1"
          fontFamily="var(--font-mono)"
          fontSize={11}
          style={{ animation: "fade-in 0.3s 0.2s both" }}
        >
          main
        </text>

        {/* Branch paths */}
        {branchStatuses.map((branch) => (
          <path
            key={`path-${branch.id}`}
            d={branch.path}
            fill="none"
            stroke={phase === "fork" ? "var(--color-line-2)" : branch.color}
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 0,
              animation: `draw-branch 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) ${branch.forkDelay} both`,
              opacity: 1,
              transition: "opacity 0.5s ease, stroke-width 0.3s ease, stroke 0.3s ease",
            }}
          />
        ))}

        {/* Activity dots traveling along paths during analyze phase */}
        {phase === "analyze" &&
          branchStatuses
            .filter((b) => b.status === "active")
            .map((branch) => (
              <circle
                key={`dot-${branch.id}`}
                r={3.5}
                fill={branch.color}
                opacity={0.45}
              >
                <animateMotion
                  dur="2s"
                  repeatCount="indefinite"
                  begin={branch.forkDelay}
                  path={branch.path}
                />
                <animate
                  attributeName="opacity"
                  values="0;0.5;0.5;0"
                  keyTimes="0;0.1;0.85;1"
                  dur="2s"
                  repeatCount="indefinite"
                  begin={branch.forkDelay}
                />
              </circle>
            ))}

        {/* Branch nodes + labels */}
        {branchStatuses.map((branch) => {
          const nodeDelay = `${parseFloat(branch.forkDelay) + 0.5}s`;
          const isFilled =
            branch.status === "complete" || phase === "done" || showMerge;

          let nodeAnimation = `node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) ${nodeDelay} both`;
          if (branch.status === "active") {
            nodeAnimation = "node-pulse 1.4s ease-in-out infinite";
          } else if (branch.status === "complete" && phase === "analyze") {
            nodeAnimation = "node-complete-pop 0.35s ease-out both";
          }

          return (
            <g key={`node-${branch.id}`}>
              <circle
                cx={440}
                cy={branch.y}
                r={8}
                fill={isFilled ? branch.color : "none"}
                stroke={branch.color}
                strokeWidth={2}
                style={{
                  transformOrigin: `440px ${branch.y}px`,
                  animation: nodeAnimation,
                  transition: "opacity 0.5s ease, fill 0.3s ease",
                }}
              />

              {/* Label */}
              <text
                x={458}
                y={branch.y + 4}
                fill="#cbd5e1"
                fontFamily="var(--font-mono)"
                fontSize={11}
                style={{
                  animation: `fade-in 0.3s ${nodeDelay} both`,
                  transition: "fill 0.5s ease",
                }}
              >
                {branch.label}
              </text>

              {/* Status text */}
              {branch.status === "complete" && !showMerge && (
                <text
                  x={458}
                  y={branch.y + 20}
                  fill="var(--color-up)"
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  style={{ animation: "fade-in 0.3s both" }}
                >
                  complete
                </text>
              )}
              {branch.status === "error" && (
                <text
                  x={458}
                  y={branch.y + 20}
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

        {/* Merge paths: mergeAll draws ALL branches into main node */}
        {showMerge && mergeAll && (
          <>
            {branchStatuses.map((branch, i) => (
              <path
                key={`merge-${branch.id}`}
                d={branch.mergePath}
                fill="none"
                stroke={branch.color}
                strokeWidth={2}
                strokeLinecap="round"
                pathLength={1}
                style={{
                  strokeDasharray: 1,
                  strokeDashoffset: 0,
                  animation: `draw-branch 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) ${0.1 + i * 0.1}s both`,
                }}
              />
            ))}
            <g
              style={{
                animation:
                  phase === "complete" ? "merge-glow 1s ease-out both" : undefined,
              }}
            >
              <circle
                cx={700}
                cy={130}
                r={10}
                fill="#34d399"
                style={{
                  transformOrigin: "700px 130px",
                  animation:
                    "node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) 1s both",
                }}
              />
              <text
                x={700}
                y={160}
                textAnchor="middle"
                fill="#cbd5e1"
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

      {/* Phase captions */}
      <div className="text-center mt-4 [&_p]:!text-[#7fb8a4]">
        {phase === "fork" && (
          <p className="section-label fade-in">
            Forking contract to {n} reviewer{n !== 1 ? "s" : ""}…
          </p>
        )}
        {phase === "analyze" && (
          <p className="section-label fade-in">
            Reviewers analyzing contract and proposing redlines
            <span className="dot-1 ml-1">·</span>
            <span className="dot-2">·</span>
            <span className="dot-3">·</span>
          </p>
        )}
        {phase === "done" && (
          <p className="section-label fade-in">
            All branches ready — review clause proposals below
          </p>
        )}
        {phase === "merge" && mergeAll && (
          <p className="section-label fade-in text-mesa">
            merging to v2
          </p>
        )}
        {phase === "complete" && (
          <p className="section-label fade-in text-up">Merged successfully</p>
        )}
      </div>
    </div>
  );
}
