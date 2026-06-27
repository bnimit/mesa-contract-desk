import type { Contract } from "../types.js";

export function ContractView({ contract }: { contract: Contract }) {
  return (
    <div className="border border-line">
      <header className="px-6 py-4 border-b border-line flex items-baseline justify-between">
        <div>
          <div className="display-heading text-xl">{contract.meta.title}</div>
          <div className="font-mono text-[11px] text-mute mt-1">{contract.meta.parties.join("  ·  ")}</div>
        </div>
        <div className="font-mono text-xs text-mute">
          v{contract.meta.version}
          {contract.meta.lastApproved && <span className="text-mute-2"> · approved</span>}
        </div>
      </header>
      <div className="divide-y divide-line/60">
        {contract.clauses.map((c, i) => (
          <div key={c.id} className="px-6 py-4 reveal" style={{ animationDelay: `${0.02 * i}s` }}>
            <div className="font-mono text-xs tracking-wide text-ink mb-1">{c.heading}</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
