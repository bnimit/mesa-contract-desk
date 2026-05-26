import type { MesaDiffEntry } from "../types.js";

interface DiffViewProps {
  entries: MesaDiffEntry[];
  agentColor: string;
}

export function DiffView({ entries, agentColor }: DiffViewProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border border-line bg-canvas-2/30 font-mono text-xs">
      <div className="px-3 py-2 border-b border-line section-label flex items-center justify-between">
        <span>Mesa diff · files changed</span>
        <span className={`${agentColor} text-[10px]`}>
          {entries.length} file{entries.length !== 1 ? "s" : ""}
        </span>
      </div>
      {entries.map((entry) => (
        <div key={entry.path}>
          <div className="px-3 py-1.5 border-b border-line/60 flex items-center gap-2 text-ink-2">
            <span className={
              entry.status === "added" ? "text-up" :
              entry.status === "deleted" ? "text-down" : "text-ink-2"
            }>
              {entry.status === "added" ? "A" : entry.status === "deleted" ? "D" : "M"}
            </span>
            <span>{entry.path}</span>
          </div>
          {entry.hunks.length > 0 && (
            <div className="p-3 leading-relaxed whitespace-pre-wrap">
              {entry.hunks.map((hunk, hi) => (
                <div key={hi}>
                  <div className="diff-annotation text-[10px] mb-1">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </div>
                  {hunk.lines.map((line, li) => (
                    <div
                      key={li}
                      className={
                        line.kind === "added" ? "diff-added" :
                        line.kind === "deleted" ? "diff-deleted" :
                        line.kind === "annotation" ? "diff-annotation" : ""
                      }
                    >
                      <span className={
                        line.kind === "added" ? "text-up" :
                        line.kind === "deleted" ? "text-down" : "text-mute-2"
                      }>
                        {line.kind === "added" ? "+" : line.kind === "deleted" ? "-" : " "}
                      </span>
                      {" "}{line.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
