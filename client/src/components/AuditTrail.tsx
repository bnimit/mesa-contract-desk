import type { AuditEvent } from "../types.js";

const KIND_META: Record<AuditEvent["kind"], { color: string; label: string }> = {
  proposed:    { color: "text-mute",         label: "proposed" },
  approved:    { color: "text-up",           label: "approved" },
  rejected:    { color: "text-down",         label: "rejected" },
  rolled_back: { color: "text-mesa",         label: "rolled back" },
  merged:      { color: "text-fundamentals", label: "merged" },
};

function rel(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="serif-quote text-lg text-mute">No decisions yet. Approvals and rejections appear here, immutably.</p>
      </div>
    );
  }
  return (
    <div className="border border-line">
      <header className="px-6 py-3 border-b border-line flex items-center justify-between">
        <div>
          <div className="section-label">Audit trail</div>
          <div className="font-mono text-[10px] text-mute mt-0.5">Immutable — every decision on the record, author and justification preserved</div>
        </div>
        <div className="font-mono text-xs text-mute">{events.length} event{events.length !== 1 ? "s" : ""}</div>
      </header>
      <div className="divide-y divide-line/60 max-h-[480px] overflow-y-auto">
        {events.map((e, i) => {
          const meta = KIND_META[e.kind];
          return (
            <div key={e.id} className="px-6 py-3 reveal flex items-baseline gap-4" style={{ animationDelay: `${0.02 * i}s` }}>
              <span className={`font-mono text-[10px] uppercase tracking-widest w-20 shrink-0 ${meta.color}`}>{meta.label}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{e.clauseHeading ?? e.justification}</div>
                <div className="font-mono text-[10px] text-mute mt-0.5">
                  {e.author}{e.approver ? ` → ${e.approver}` : ""} · {rel(e.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
