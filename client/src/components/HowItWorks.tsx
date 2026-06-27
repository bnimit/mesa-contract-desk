const STEPS = [
  { n: "①", title: "Review", body: "2–4 department reviewers redline their own domain on isolated Mesa branches, in parallel." },
  { n: "②", title: "Cherry-pick", body: "You pick the best edit per clause from any team, or keep the original." },
  { n: "③", title: "Merge", body: "Accepted edits land on main as a clean new version." },
  { n: "④", title: "Audit", body: "Every decision kept immutably — which team, which clause, and why." },
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
