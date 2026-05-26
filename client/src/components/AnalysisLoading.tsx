import { MesaActivityEvent } from "../types.js";

interface AnalysisLoadingProps {
  events?: MesaActivityEvent[];
}

type AgentStatus = "waiting" | "running" | "done";

function getAgentStatus(agentKey: string, events: MesaActivityEvent[]): AgentStatus {
  const hasComplete = events.some(
    (e) => e.type === "agent_complete" && e.agent === agentKey
  );
  if (hasComplete) return "done";

  const hasStarted = events.some((e) => e.type === "analysis_started");
  if (hasStarted) return "running";

  return "waiting";
}

export function AnalysisLoading({ events = [] }: AnalysisLoadingProps) {
  const branches = [
    { name: "fundamentals", agentKey: "Fundamentals", color: "text-fundamentals", label: "Fundamental analysis" },
    { name: "sentiment", agentKey: "Sentiment", color: "text-sentiment", label: "Market sentiment" },
    { name: "technical", agentKey: "Technical", color: "text-technical", label: "Technical analysis" },
  ];

  return (
    <section className="fade-in">
      <div className="flex items-end justify-between mb-8 pb-6 border-b border-line">
        <div>
          <div className="section-label mb-2 flex items-center gap-2">
            <span className="dot-1">●</span>
            <span className="dot-2">●</span>
            <span className="dot-3">●</span>
            <span className="ml-2">Branching from main</span>
          </div>
          <h2 className="display-heading text-3xl">
            Agents working in parallel
          </h2>
        </div>
      </div>

      <div className="font-mono text-sm space-y-3 py-8 px-4">
        <div className="flex items-center gap-3 text-mute">
          <span className="text-ink">●</span>
          <span className="text-ink">main</span>
          <span className="text-mute-2">↳</span>
        </div>

        {branches.map((b, i) => {
          const status: AgentStatus = getAgentStatus(b.agentKey, events);
          return (
            <div
              key={b.name}
              className="reveal flex items-center gap-3"
              style={{ animationDelay: `${0.2 + i * 0.15}s` }}
            >
              <span className="text-mute-2 ml-3">├──</span>
              <span className={`${b.color}`}>
                {status === "waiting" && (
                  <span className="opacity-40">○</span>
                )}
                {status === "running" && (
                  <span className="dot-1" style={{ animationDelay: `${i * 0.2}s` }}>○</span>
                )}
                {status === "done" && (
                  <span>●</span>
                )}
              </span>
              <span className={`${b.color}`}>agent/{b.name}</span>
              <span className="text-mute text-xs">— {b.label}</span>
              {status === "done" && (
                <span className="text-xs text-up ml-1">complete ✓</span>
              )}
            </div>
          );
        })}

        <div className="pt-4 text-xs text-mute italic font-sans">
          Each agent reads <span className="font-mono not-italic text-ink-2">portfolio.json</span>, fetches market data, writes its proposal to its own branch. No locks, no conflicts.
        </div>
      </div>
    </section>
  );
}
