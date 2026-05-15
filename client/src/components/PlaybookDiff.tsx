interface PlaybookDiffProps {
  entry: string;
  agentColor: string;
}

export function PlaybookDiff({ entry, agentColor }: PlaybookDiffProps) {
  const lines = entry.split("\n");

  return (
    <div className="border border-line bg-canvas-2/30 font-mono text-xs">
      <div className="px-3 py-2 border-b border-line section-label flex items-center justify-between">
        <span>Playbook delta · this round</span>
        <span className={`${agentColor} text-[10px]`}>+ added</span>
      </div>
      <div className="p-3 leading-relaxed whitespace-pre-wrap text-ink-2">
        {lines.map((line, i) => {
          if (line.startsWith("## ")) {
            return (
              <div key={i} className="flex gap-2">
                <span className={agentColor}>+</span>
                <span className={`${agentColor} font-medium`}>{line}</span>
              </div>
            );
          }
          if (line.trim().length === 0) {
            return (
              <div key={i} className="flex gap-2">
                <span className={agentColor}>+</span>
              </div>
            );
          }
          if (line.startsWith("**") && line.includes(":**")) {
            const idx = line.indexOf(":**") + 3;
            return (
              <div key={i} className="flex gap-2">
                <span className={agentColor}>+</span>
                <span>
                  <span className="text-ink font-medium">{line.slice(0, idx)}</span>
                  {line.slice(idx)}
                </span>
              </div>
            );
          }
          return (
            <div key={i} className="flex gap-2">
              <span className={agentColor}>+</span>
              <span>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
