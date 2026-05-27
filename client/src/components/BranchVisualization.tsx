import { useMemo } from "react";
import type { MesaActivityEvent } from "../types.js";

export type VizPhase = "fork" | "analyze" | "done" | "merge" | "complete";

interface BranchVisualizationProps {
  phase: VizPhase;
  events: MesaActivityEvent[];
  winnerAgent?: string;
}

type NodeStatus = "forking" | "active" | "complete" | "error";

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
    (e) =>
      e.type === "agent_complete" &&
      e.agent === agentKey &&
      e.detail.toLowerCase().includes("error")
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

export function BranchVisualization({
  phase,
  events,
  winnerAgent,
}: BranchVisualizationProps) {
  const agentStatuses = useMemo(
    () =>
      AGENTS.map((a) => ({
        ...a,
        status: getAgentNodeStatus(a.key, phase, events),
      })),
    [phase, events]
  );

  const showMerge = phase === "merge" || phase === "complete";
  const winner = AGENTS.find((a) => a.key === winnerAgent);
  const isDismiss = showMerge && !winner;

  return (
    <div
      className="w-full max-w-2xl mx-auto my-8 fade-in"
      style={{
        opacity: phase === "complete" ? 0 : undefined,
        transition: phase === "complete" ? "opacity 0.8s 0.8s ease" : undefined,
      }}
    >
      <svg viewBox="0 0 760 260" className="w-full" style={{ overflow: "visible" }}>
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
          const isLoser = showMerge && !isDismiss && !isWinner;
          const fadeAll = isDismiss;

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
                opacity: isLoser || fadeAll ? 0.15 : 1,
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
                r={3.5}
                fill={agent.color}
                opacity={0.45}
              >
                <animateMotion
                  dur="2s"
                  repeatCount="indefinite"
                  begin={agent.forkDelay}
                  path={agent.path}
                />
                <animate
                  attributeName="opacity"
                  values="0;0.5;0.5;0"
                  keyTimes="0;0.1;0.85;1"
                  dur="2s"
                  repeatCount="indefinite"
                  begin={agent.forkDelay}
                />
              </circle>
            ))}

        {/* Agent nodes */}
        {agentStatuses.map((agent) => {
          const isWinner = winnerAgent === agent.key;
          const isLoser = showMerge && !isDismiss && !isWinner;
          const fadeAll = isDismiss;
          const nodeDelay = `${parseFloat(agent.forkDelay) + 0.5}s`;

          const isFilled =
            agent.status === "complete" || phase === "done" || showMerge;

          let nodeAnimation = `node-enter 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) ${nodeDelay} both`;
          if (agent.status === "active") {
            nodeAnimation = "node-pulse 1.4s ease-in-out infinite";
          } else if (agent.status === "complete" && phase === "analyze") {
            nodeAnimation = "node-complete-pop 0.35s ease-out both";
          }

          return (
            <g key={`node-${agent.key}`}>
              <circle
                cx={440}
                cy={agent.y}
                r={8}
                fill={isFilled ? agent.color : "none"}
                stroke={agent.color}
                strokeWidth={2}
                style={{
                  transformOrigin: `440px ${agent.y}px`,
                  animation: nodeAnimation,
                  opacity: isLoser || fadeAll ? 0.15 : 1,
                  transition: "opacity 0.5s ease, fill 0.3s ease",
                }}
              />

              {/* Agent sigil + label */}
              <text
                x={458}
                y={agent.y - 8}
                fill={isLoser || fadeAll ? "var(--color-mute-2)" : agent.color}
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
              <text
                x={458}
                y={agent.y + 6}
                fill={isLoser || fadeAll ? "var(--color-mute-2)" : "var(--color-ink-2)"}
                fontFamily="var(--font-mono)"
                fontSize={11}
                style={{
                  animation: `fade-in 0.3s ${nodeDelay} both`,
                  transition: "fill 0.5s ease",
                }}
              >
                {agent.label}
              </text>

              {/* Status text */}
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

        {/* Merge path + merged node */}
        {showMerge && !isDismiss && winner && (
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
                animation:
                  "draw-branch 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s both",
              }}
            />
            <g
              style={{
                animation:
                  phase === "complete"
                    ? "merge-glow 1s ease-out both"
                    : undefined,
              }}
            >
              <circle
                cx={700}
                cy={130}
                r={10}
                fill="var(--color-ink)"
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

      {/* Phase description */}
      <div className="text-center mt-4">
        {phase === "fork" && (
          <p className="section-label fade-in">
            Forking portfolio to three branches…
          </p>
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
        {phase === "merge" && !isDismiss && (
          <p className="section-label fade-in text-mesa">
            Merging {winnerAgent} to main…
          </p>
        )}
        {phase === "merge" && isDismiss && (
          <p className="section-label fade-in text-mute">
            Discarding all branches…
          </p>
        )}
        {phase === "complete" && (
          <p className="section-label fade-in text-up">Merged successfully</p>
        )}
      </div>
    </div>
  );
}
