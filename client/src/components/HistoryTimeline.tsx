import type { HistoryRoundSummary } from "../types.js";

const AGENT_COLORS: Record<string, string> = {
  Fundamentals: "text-fundamentals",
  Sentiment: "text-sentiment",
  Technical: "text-technical",
};

const AGENT_SIGILS: Record<string, string> = {
  Fundamentals: "◆",
  Sentiment: "●",
  Technical: "▲",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function HistoryTimeline({ rounds }: { rounds: HistoryRoundSummary[] }) {
  if (rounds.length === 0) {
    return (
      <section className="reveal">
        <header className="mb-8 pb-6 border-b border-line">
          <div className="section-label mb-2">Mesa history · main branch</div>
          <h2 className="display-heading text-3xl">Past rounds</h2>
        </header>
        <p className="serif-quote text-lg text-mute py-8">
          No past analyses yet. Run your first round to start building agent memory.
        </p>
      </section>
    );
  }

  return (
    <section className="reveal">
      <header className="mb-8 pb-6 border-b border-line">
        <div className="section-label mb-2">Mesa history · {rounds.length} round{rounds.length === 1 ? "" : "s"}</div>
        <h2 className="display-heading text-3xl">Past rounds</h2>
        <p className="serif-quote text-lg text-mute mt-3 max-w-2xl">
          Every analysis is preserved as a commit on Mesa's main branch. Agents read their own history on each run to learn from what worked and what didn't.
        </p>
      </header>

      <div className="font-mono text-sm">
        {rounds.map((round, i) => (
          <div
            key={round.timestamp}
            className="grid grid-cols-12 gap-6 py-5 border-b border-line last:border-0 reveal"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <div className="col-span-12 md:col-span-2 text-mute">
              {formatTime(round.timestamp)}
            </div>

            <div className="col-span-12 md:col-span-8 grid grid-cols-3 gap-3">
              {round.agents.map((agent) => {
                const color = AGENT_COLORS[agent.name] ?? "text-mute";
                const sigil = AGENT_SIGILS[agent.name] ?? "◇";
                return (
                  <div
                    key={agent.name}
                    className={`flex items-baseline gap-2 ${
                      agent.merged ? "" : round.mergedAgent ? "opacity-40" : ""
                    }`}
                  >
                    <span className={color}>{sigil}</span>
                    <span className={`${color} text-xs`}>{agent.action}</span>
                    {agent.merged && (
                      <span className="text-[10px] tracking-widest uppercase text-mesa ml-1">
                        ← merged
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="col-span-12 md:col-span-2 text-right text-xs text-mute">
              {round.mergedAgent ? (
                <span>
                  → <span className="text-ink">{round.mergedAgent.toLowerCase()}</span>
                </span>
              ) : (
                <span>· dismissed</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
