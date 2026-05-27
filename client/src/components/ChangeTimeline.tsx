import { useState } from "react";
import type { MesaChange } from "../types.js";

interface ChangeTimelineProps {
  changes: MesaChange[];
  loading: boolean;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortHash(id: string): string {
  return id.slice(0, 8);
}

export function ChangeTimeline({ changes, loading }: ChangeTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading && changes.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="serif-quote text-lg text-mute">Loading change history…</p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="serif-quote text-lg text-mute">
          No changes yet. Run an analysis to start building commit history on Mesa.
        </p>
        <p className="font-mono text-xs text-mute-2 mt-3">
          Requires Mesa SDK or fs.mount backend
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line">
      <div className="px-6 py-3 border-b border-line flex items-center justify-between">
        <div className="section-label">Mesa change log</div>
        <div className="font-mono text-xs text-mute">
          {changes.length} change{changes.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="divide-y divide-line/60 max-h-[480px] overflow-y-auto">
        {changes.map((c, i) => {
          const isExpanded = expanded === c.id;
          return (
            <div
              key={c.id}
              className="reveal"
              style={{ animationDelay: `${0.02 * i}s` }}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : c.id)}
                className="w-full px-6 py-4 flex items-start gap-4 hover:bg-ink/[0.02] transition-colors text-left"
              >
                {/* Commit graph dot + line */}
                <div className="flex flex-col items-center shrink-0 mt-1">
                  <div className={`w-2.5 h-2.5 rounded-full border-2 ${
                    c.isConflicted ? "border-down bg-down/20" : "border-mesa bg-mesa/20"
                  }`} />
                  {i < changes.length - 1 && (
                    <div className="w-px flex-1 bg-line mt-1 min-h-[16px]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-mesa tracking-wide">
                      {shortHash(c.id)}
                    </span>
                    <span className="text-sm text-ink truncate flex-1">
                      {c.message || "no message"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-[10px] text-mute tracking-wide">
                      {c.author.name}
                    </span>
                    <span className="font-mono text-[10px] text-mute-2">
                      {relativeTime(c.timestamp)}
                    </span>
                    {c.isConflicted && (
                      <span className="font-mono text-[10px] text-down uppercase tracking-widest">
                        conflicted
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand arrow */}
                <span className={`text-mute text-xs transition-transform mt-1 ${isExpanded ? "rotate-90" : ""}`}>
                  ▸
                </span>
              </button>

              {isExpanded && (
                <div className="px-6 pb-4 pl-[52px]">
                  <div className="border border-line bg-ink/[0.02] p-4 font-mono text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-mute">change_id</span>
                      <span className="text-ink-2 select-all">{c.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">author</span>
                      <span className="text-ink-2">{c.author.name} &lt;{c.author.email}&gt;</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-mute">timestamp</span>
                      <span className="text-ink-2">{new Date(c.timestamp).toISOString()}</span>
                    </div>
                    {c.filesChanged !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-mute">files changed</span>
                        <span className="text-ink-2">{c.filesChanged}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
