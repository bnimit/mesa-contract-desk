import { useState, useMemo } from "react";

interface PlaybookViewProps {
  content: string;
}

interface ParsedEntry {
  round: number;
  agent: string;
  dateLabel: string;
  body: string[];
  decision?: string;
}

interface RoundGroup {
  round: number;
  dateLabel: string;
  entries: ParsedEntry[];
}

const AGENT_META: Record<string, { color: string; bg: string; sigil: string }> = {
  Fundamentals: { color: "text-fundamentals", bg: "border-fundamentals", sigil: "◆" },
  Sentiment: { color: "text-sentiment", bg: "border-sentiment", sigil: "●" },
  Technical: { color: "text-technical", bg: "border-technical", sigil: "▲" },
};

const AGENT_ORDER = ["Fundamentals", "Sentiment", "Technical"];

const HEADER_RE = /^## \[Round (\d+) · ([^·]+) · ([^\]]+)\]\s*$/;

function parsePlaybook(content: string): ParsedEntry[] {
  const lines = content.split("\n");
  const entries: ParsedEntry[] = [];
  let current: ParsedEntry | null = null;

  for (const line of lines) {
    const match = line.match(HEADER_RE);
    if (match) {
      if (current) entries.push(finalizeEntry(current));
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
  if (current) entries.push(finalizeEntry(current));
  return entries;
}

function finalizeEntry(entry: ParsedEntry): ParsedEntry {
  const decisionLine = entry.body.find((l) => /^\*\*Decision\*\*\s*:/i.test(l.trim()));
  if (decisionLine) {
    entry.decision = decisionLine.replace(/^\*\*Decision\*\*\s*:\s*/i, "").trim();
  }
  return entry;
}

function groupByRound(entries: ParsedEntry[]): RoundGroup[] {
  const groups = new Map<number, RoundGroup>();
  for (const entry of entries) {
    const existing = groups.get(entry.round);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(entry.round, {
        round: entry.round,
        dateLabel: entry.dateLabel,
        entries: [entry],
      });
    }
  }
  // Sort by round ascending (oldest first), then sort entries within each by agent order
  const sorted = Array.from(groups.values()).sort((a, b) => a.round - b.round);
  for (const g of sorted) {
    g.entries.sort(
      (a, b) => AGENT_ORDER.indexOf(a.agent) - AGENT_ORDER.indexOf(b.agent)
    );
  }
  return sorted;
}

function renderBodyLine(line: string, key: number) {
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
  const entries = useMemo(() => parsePlaybook(content), [content]);
  const groups = useMemo(() => groupByRound(entries), [entries]);

  // Default: only the latest round expanded
  const latestRound = groups.length > 0 ? groups[groups.length - 1].round : 0;
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(
    () => new Set(latestRound ? [latestRound] : [])
  );

  const toggle = (round: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  const expandAll = () => setExpandedRounds(new Set(groups.map((g) => g.round)));
  const collapseAll = () => setExpandedRounds(new Set());

  if (groups.length === 0) {
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
          {AGENT_ORDER.map((name) => {
            const meta = AGENT_META[name];
            return (
              <div key={name} className="flex items-center gap-1.5">
                <span className={meta.color}>{meta.sigil}</span>
                <span className="text-ink-2">{name}</span>
                <span className="text-mute">{stats[name] ?? 0}</span>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-4 text-mute">
            <span>
              <span className="text-ink">{groups.length}</span> round{groups.length === 1 ? "" : "s"} · {entries.length} entries
            </span>
            <button
              onClick={expandAll}
              className="hover:text-ink transition-colors uppercase tracking-widest text-[10px]"
              disabled={expandedRounds.size === groups.length}
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="hover:text-ink transition-colors uppercase tracking-widest text-[10px]"
              disabled={expandedRounds.size === 0}
            >
              Collapse all
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-0">
        {groups.map((group, gi) => {
          const isOpen = expandedRounds.has(group.round);
          return (
            <div
              key={group.round}
              className="border-b border-line last:border-0 reveal"
              style={{ animationDelay: `${Math.min(0.3, gi * 0.04)}s` }}
            >
              {/* Round header — clickable */}
              <button
                onClick={() => toggle(group.round)}
                className="w-full text-left py-4 flex items-center gap-4 group hover:bg-canvas-2/40 transition-colors -mx-2 px-2"
                aria-expanded={isOpen}
              >
                <span
                  className={`font-mono text-mute group-hover:text-ink transition-transform inline-block ${
                    isOpen ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
                <span className="font-mono text-xs tracking-widest uppercase text-ink">
                  Round {String(group.round).padStart(3, "0")}
                </span>
                <span className="font-mono text-xs text-mute">{group.dateLabel}</span>

                {/* Sigils for which agents contributed */}
                <span className="flex items-center gap-1.5 ml-2">
                  {AGENT_ORDER.map((name) => {
                    const entry = group.entries.find((e) => e.agent === name);
                    const meta = AGENT_META[name];
                    if (!entry) {
                      return (
                        <span key={name} className="text-mute-2 text-sm opacity-30">
                          {meta.sigil}
                        </span>
                      );
                    }
                    return (
                      <span key={name} className={`${meta.color} text-sm`} title={name}>
                        {meta.sigil}
                      </span>
                    );
                  })}
                </span>

                {/* Quick decisions on collapsed view */}
                {!isOpen && (
                  <span className="ml-auto hidden md:flex items-center gap-3 text-xs text-mute font-mono overflow-hidden max-w-[40%]">
                    {group.entries
                      .filter((e) => e.decision)
                      .slice(0, 3)
                      .map((e) => {
                        const meta = AGENT_META[e.agent];
                        return (
                          <span key={e.agent} className="truncate">
                            <span className={meta?.color ?? ""}>{meta?.sigil ?? "◇"}</span>{" "}
                            {e.decision}
                          </span>
                        );
                      })}
                  </span>
                )}
              </button>

              {/* Expanded entries */}
              {isOpen && (
                <div className="pl-6 pb-6 space-y-0">
                  {group.entries.map((entry, i) => {
                    const meta = AGENT_META[entry.agent] ?? {
                      color: "text-mute",
                      bg: "border-mute",
                      sigil: "◇",
                    };
                    return (
                      <article
                        key={`${entry.round}-${entry.agent}-${i}`}
                        className={`relative pl-6 py-4 border-l-2 ${meta.bg}`}
                      >
                        <div className="absolute -left-[7px] top-5 w-3 h-3 bg-canvas border-2 border-current rounded-full" />
                        <div className="flex items-baseline gap-3 mb-3">
                          <span className={`${meta.color} text-lg`}>{meta.sigil}</span>
                          <span
                            className={`${meta.color} font-mono text-xs tracking-widest uppercase`}
                          >
                            {entry.agent}
                          </span>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          {entry.body.map((line, j) => renderBodyLine(line, j))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
