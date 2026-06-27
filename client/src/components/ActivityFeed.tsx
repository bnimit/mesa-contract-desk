import type { MesaActivityEvent } from "../types.js";

interface ActivityFeedProps {
  events: MesaActivityEvent[];
  connected: boolean;
}

const TYPE_ICONS: Record<MesaActivityEvent["type"], string> = {
  branch_created: "⑂",
  file_written: "✎",
  branch_merged: "⊕",
  branch_deleted: "✕",
  analysis_started: "◌",
  agent_complete: "◉",
};

const TYPE_COLORS: Record<MesaActivityEvent["type"], string> = {
  branch_created: "text-mesa",
  file_written: "text-ink-2",
  branch_merged: "text-up",
  branch_deleted: "text-mute",
  analysis_started: "text-mesa",
  agent_complete: "text-up",
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

export function ActivityFeed({ events, connected }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="serif-quote text-lg text-mute">
          No activity yet. Run an analysis to see Mesa operations stream in.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4 font-mono text-xs text-mute">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up" : "bg-down"}`} />
          <span>SSE {connected ? "connected" : "disconnected"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="px-6 py-3 border-b border-line flex items-center justify-between">
        <div className="section-label">Live operations</div>
        <div className="flex items-center gap-2 font-mono text-xs text-mute">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-up" : "bg-down"}`} />
          <span>SSE {connected ? "connected" : "disconnected"}</span>
        </div>
      </div>
      <div className="divide-y divide-line/60 max-h-80 overflow-y-auto">
        {events.map((e) => (
          <div key={e.id} className="px-6 py-3 flex items-start gap-3 reveal">
            <span className={`font-mono text-sm mt-0.5 ${TYPE_COLORS[e.type]}`}>
              {TYPE_ICONS[e.type]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-ink leading-relaxed">{e.detail}</div>
              <div className="flex items-center gap-3 mt-1">
                {e.agent && (
                  <span className="font-mono text-[10px] tracking-widest uppercase text-mute">
                    {e.agent}
                  </span>
                )}
                {e.branch && (
                  <span className="font-mono text-[10px] text-mute-2 truncate">
                    {e.branch}
                  </span>
                )}
              </div>
            </div>
            <span className="font-mono text-[10px] text-mute-2 whitespace-nowrap mt-0.5">
              {relativeTime(e.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
