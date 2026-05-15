import type { HistoryRoundSummary } from "../types.js";

interface HistoryTimelineProps {
  rounds: HistoryRoundSummary[];
  onReplay?: (timestamp: number) => void;
  replayDisabled?: boolean;
}

const AGENT_ORDER: { name: string; sigil: string; color: string }[] = [
  { name: "Fundamentals", sigil: "◆", color: "text-fundamentals" },
  { name: "Sentiment", sigil: "●", color: "text-sentiment" },
  { name: "Technical", sigil: "▲", color: "text-technical" },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

export function HistoryTimeline({ rounds, onReplay, replayDisabled }: HistoryTimelineProps) {
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
        <div className="section-label mb-2">
          Mesa history · {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </div>
        <h2 className="display-heading text-3xl">Past rounds</h2>
        <p className="serif-quote text-lg text-mute mt-3 max-w-2xl">
          Every analysis is preserved as a commit on Mesa's main branch. Agents read their own history on each run to learn from what worked and what didn't.
        </p>
      </header>

      <div className="font-mono text-sm">
        {/* Column headers */}
        <div className="grid grid-cols-12 gap-6 pb-3 border-b border-line section-label">
          <div className="col-span-12 md:col-span-2">When</div>
          <div className="col-span-12 md:col-span-7 grid grid-cols-3 gap-3">
            {AGENT_ORDER.map((a) => (
              <div key={a.name} className="flex items-center gap-2">
                <span className={a.color}>{a.sigil}</span>
                <span>{a.name}</span>
              </div>
            ))}
          </div>
          <div className="col-span-12 md:col-span-2 text-right">Outcome</div>
          <div className="col-span-12 md:col-span-1 text-right">Replay</div>
        </div>

        {/* Rows */}
        {rounds.map((round, i) => (
          <div
            key={round.timestamp}
            className="grid grid-cols-12 gap-6 py-5 border-b border-line last:border-0 reveal"
            style={{ animationDelay: `${0.05 * i}s` }}
          >
            <div className="col-span-12 md:col-span-2 text-mute">
              <div>{formatTime(round.timestamp)}</div>
              {round.replayedFrom && (
                <div className="text-[10px] text-mesa mt-0.5 uppercase tracking-widest">
                  replay
                </div>
              )}
            </div>

            <div className="col-span-12 md:col-span-7 grid grid-cols-3 gap-3">
              {AGENT_ORDER.map((slot) => {
                const agent = round.agents.find((a) => a.name === slot.name);
                if (!agent) {
                  return (
                    <div key={slot.name} className="text-mute-2 text-xs italic">
                      —
                    </div>
                  );
                }
                const dim = !agent.merged && round.mergedAgent ? "opacity-40" : "";
                return (
                  <div key={slot.name} className={`flex items-baseline gap-2 ${dim}`}>
                    <span className={slot.color}>{slot.sigil}</span>
                    <span className={`${slot.color} text-xs`}>{agent.action}</span>
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

            <div className="col-span-12 md:col-span-1 text-right">
              {onReplay && (
                <button
                  onClick={() => onReplay(round.timestamp)}
                  disabled={replayDisabled}
                  title="Branch from this state and run a new analysis"
                  className="group inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-mute hover:text-mesa transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span>↺</span>
                  <span>replay</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
