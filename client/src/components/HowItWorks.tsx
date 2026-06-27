const STEPS = [
  { n: "①", title: "Fork", body: "Three counsel branch the contract on Mesa — instant, isolated, no copy." },
  { n: "②", title: "Approve", body: "You accept or reject each clause. The gate resumes from exact state." },
  { n: "③", title: "Merge", body: "Approved edits land on main as a new version." },
  { n: "④", title: "Audit", body: "Every decision kept immutably — author, reason, rollback." },
];

export function HowItWorks() {
  return (
    <div className="card p-5">
      <div className="section-label mb-4">How it works</div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex sm:block items-start gap-3">
            <div className="text-2xl text-mesa leading-none">{s.n}</div>
            <div>
              <div className="font-sans text-sm font-semibold mt-2 mb-1">{s.title}</div>
              <p className="text-xs text-mute leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
