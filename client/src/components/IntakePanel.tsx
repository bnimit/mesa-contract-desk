import { useRef } from "react";
import type { Persona, Department } from "../types.js";

interface Props {
  personas: Persona[];
  contractTitle: string | null;
  samples: { id: string; title: string }[];
  onUpload: (file: File) => void;
  onLoadSample: (id: string) => void;
  selected: Department[];
  onToggle: (id: Department) => void;
  hasKey: boolean;
  onRun: () => void;
  busy: boolean;
}

export function IntakePanel({ personas, contractTitle, samples, onUpload, onLoadSample, selected, onToggle, hasKey, onRun, busy }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isDefaultMsa = contractTitle?.includes("Master Services Agreement");
  const allCore = selected.every((d) => ["legal", "finance", "security"].includes(d));
  const offlineOk = isDefaultMsa && allCore;
  const needsKey = !offlineOk;
  const canRun = !!contractTitle && selected.length >= 2 && selected.length <= 4 && (hasKey || offlineOk);

  return (
    <div className="card p-6">
      <div className="section-label mb-4">Set up a review</div>

      {/* Document */}
      <div className="mb-6">
        <div className="text-sm font-semibold mb-2">1 · Choose a contract</div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="font-mono text-xs uppercase tracking-widest px-4 py-2 rounded-lg bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors">Upload PDF / DOCX / TXT</button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          <span className="text-mute text-sm">or sample:</span>
          {samples.map((s) => (
            <button key={s.id} onClick={() => onLoadSample(s.id)} className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-line hover:border-mesa transition-colors">{s.title}</button>
          ))}
        </div>
        {contractTitle && <div className="text-xs text-mute mt-2">Loaded: <span className="text-ink">{contractTitle}</span></div>}
        {!hasKey && <div className="text-xs text-mute mt-1">Upload and non-default contracts need an Anthropic key (Settings).</div>}
      </div>

      {/* Reviewers */}
      <div className="mb-6">
        <div className="text-sm font-semibold mb-2">2 · Choose reviewers <span className="text-mute font-normal">(2–4)</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {personas.map((p) => {
            const on = selected.includes(p.id);
            const locked = !p.cannedAvailable && !hasKey && !on;
            return (
              <button key={p.id} disabled={locked} onClick={() => onToggle(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${on ? "border-ink bg-ink/[0.03]" : "border-line hover:border-ink/30"} ${locked ? "opacity-40 cursor-not-allowed" : ""}`}>
                <span className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: p.color }} />
                <span>
                  <span className="text-sm font-semibold block">{p.label}{!p.cannedAvailable && <span className="text-mute font-normal"> · needs key</span>}</span>
                  <span className="text-xs text-mute">{p.domain}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={onRun} disabled={!canRun || busy} className="font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-xl bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {busy ? "Running…" : `Run review · ${selected.length} reviewer${selected.length === 1 ? "" : "s"}`}
      </button>
      {needsKey && !hasKey && <span className="ml-3 text-xs text-mute">This combination needs an Anthropic key.</span>}
    </div>
  );
}
