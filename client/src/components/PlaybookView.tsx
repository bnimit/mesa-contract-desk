interface PlaybookViewProps {
  content: string;
}

interface ParsedEntry {
  round: number;
  agent: string;
  dateLabel: string;
  body: string[];
}

const AGENT_META: Record<string, { color: string; bg: string; sigil: string }> = {
  Fundamentals: { color: "text-fundamentals", bg: "border-fundamentals", sigil: "◆" },
  Sentiment: { color: "text-sentiment", bg: "border-sentiment", sigil: "●" },
  Technical: { color: "text-technical", bg: "border-technical", sigil: "▲" },
};

const HEADER_RE = /^## \[Round (\d+) · ([^·]+) · ([^\]]+)\]\s*$/;

function parsePlaybook(content: string): ParsedEntry[] {
  const lines = content.split("\n");
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | null = null;

  for (const line of lines) {
    const match = line.match(HEADER_RE);
    if (match) {
      if (current) entries.push(current);
      current = {
        round: parseInt(match[1], 10),
        agent: match[2].trim(),
        dateLabel: match[3].trim(),
        body: [],
      };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function renderBodyLine(line: string, key: number): JSX.Element {
  const trimmed = line.trim();
  if (trimmed.length === 0) return <div key={key} className="h-2" />;
  if (trimmed.startsWith("**") && trimmed.includes(":**")) {
    const idx = trimmed.indexOf(":**") + 3;
    return (
      <div key={key} className="leading-relaxed">
        <span className="text-ink font-medium">{trimmed.slice(0, idx).replace(/\*\*/g, "")}</span>
        <span className="text-ink-2">{trimmed.slice(idx)}</span>
      </div>
    );
  }
  return (
    <div key={key} className="text-ink-2 leading-relaxed">
      {trimmed}
    </div>
  );
}

export function PlaybookView({ content }: PlaybookViewProps) {
  const entries = parsePlaybook(content);

  if (entries.length === 0) {
    return (
      <section className="reveal">
        <header className="mb-8 pb-6 border-b border-line">
          <div className="section-label mb-2">Mesa main branch · playbook.md</div>
          <h2 className="display-heading text-3xl">The shared playbook</h2>
        </header>
        <p className="serif-quote text-lg text-mute py-8">
          Empty so far. Each agent appends an entry every round — observations, reasoning, and decisions accumulate here over time.
        </p>
      </section>
    );
  }

  // Stats by agent
  const stats: Record<string, number> = {};
  for (const e of entries) stats[e.agent] = (stats[e.agent] ?? 0) + 1;

  return (
    <section className="reveal">
      <header className="mb-8 pb-6 border-b border-line">
        <div className="section-label mb-2">Mesa main branch · playbook.md · agentblame</div>
        <h2 className="display-heading text-3xl">The shared playbook</h2>
        <p className="serif-quote text-lg text-mute mt-3 max-w-2xl">
          A single markdown file on Mesa's main branch. Each agent contributes its observations and reasoning every round. Every line is attributable to its author and the round it landed in.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-xs">
          {Object.entries(AGENT_META).map(([name, meta]) => (
            <div key={name} className="flex items-center gap-1.5">
              <span className={meta.color}>{meta.sigil}</span>
              <span className="text-ink-2">{name}</span>
              <span className="text-mute">{stats[name] ?? 0}</span>
            </div>
          ))}
          <div className="ml-auto text-mute">
            <span className="text-ink">{entries.length}</span> entries · {entries.length} commits
          </div>
        </div>
      </header>

      <div className="space-y-0">
        {entries.map((entry, i) => {
          const meta = AGENT_META[entry.agent] ?? {
            color: "text-mute",
            bg: "border-mute",
            sigil: "◇",
          };
          return (
            <article
              key={`${entry.round}-${entry.agent}-${i}`}
              className={`relative pl-6 py-5 border-l-2 ${meta.bg} reveal`}
              style={{ animationDelay: `${Math.min(0.4, 0.03 * i)}s` }}
            >
              <div className="absolute -left-[7px] top-6 w-3 h-3 bg-canvas border-2 border-current rounded-full" />
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`${meta.color} text-lg`}>{meta.sigil}</span>
                <span className={`${meta.color} font-mono text-xs tracking-widest uppercase`}>
                  Round {String(entry.round).padStart(3, "0")} · {entry.agent}
                </span>
                <span className="font-mono text-xs text-mute ml-auto">{entry.dateLabel}</span>
              </div>
              <div className="space-y-1.5 text-sm">
                {entry.body.map((line, j) => renderBodyLine(line, j))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
