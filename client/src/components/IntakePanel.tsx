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
      <div className="section-label mb-5">Set up a review</div>

      {/* 1 · Choose a contract */}
      <div className="mb-7">
        <div className="text-sm font-semibold mb-3">1 · Choose a contract</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Upload card */}
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-mesa/40 bg-mesa-soft/40 hover:border-mesa hover:bg-mesa-soft/70 transition-colors p-5 text-center"
          >
            <div className="text-2xl">⬆️</div>
            <div className="text-sm font-semibold mt-1">Upload a contract</div>
            <div className="text-[11px] text-mute">PDF · DOCX · TXT</div>
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />

          {/* Samples */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-mute">…or start with a sample</div>
            {samples.map((s) => {
              const isMsa = s.title.includes("Master Services Agreement");
              const active = contractTitle === s.title;
              return (
                <button
                  key={s.id}
                  onClick={() => onLoadSample(s.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${active ? "border-mesa bg-mesa-soft/40" : "border-line hover:border-mesa/50"}`}
                >
                  <span className="text-lg shrink-0">📄</span>
                  <span className="text-xs font-semibold flex-1">{s.title}</span>
                  {isMsa && <span className="pill pill-ok shrink-0">runs offline</span>}
                </button>
              );
            })}
          </div>
        </div>
        {contractTitle && <div className="text-xs text-mute mt-2">Loaded: <span className="text-ink font-semibold">{contractTitle}</span></div>}
      </div>

      {/* 2 · Choose reviewers */}
      <div className="mb-7">
        <div className="text-sm font-semibold mb-1">2 · Choose reviewers <span className="text-mute font-normal">(2–4)</span></div>
        <div className="text-[11px] text-mute mb-3">Each reviews the contract from a different vantage point.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {personas.map((p) => {
            const on = selected.includes(p.id);
            const locked = (!p.cannedAvailable && !hasKey && !on) || (selected.length >= 4 && !on);
            return (
              <button
                key={p.id}
                disabled={locked}
                onClick={() => onToggle(p.id)}
                className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${locked ? "opacity-50 cursor-not-allowed border-line" : ""}`}
                style={on ? { borderColor: p.color, background: p.color + "12" } : !locked ? { borderColor: "var(--color-line)" } : undefined}
              >
                {on && <span className="absolute top-2.5 right-3 text-sm font-bold" style={{ color: p.color }}>✓</span>}
                <span className="text-3xl leading-none shrink-0">{p.icon}</span>
                <span className="min-w-0">
                  <span className="text-sm font-bold block" style={{ color: on ? p.color : "var(--color-ink)" }}>
                    {p.label}
                    {!p.cannedAvailable && <span className="text-mute font-normal text-[10px]"> 🔑</span>}
                  </span>
                  <span className="text-[10px] text-mute block mt-0.5">{p.domain}</span>
                  <span className="text-[11px] text-ink-2 italic block mt-1">“{p.pitch}”</span>
                  {!p.cannedAvailable && !hasKey && !on && <span className="text-[10px] text-mute block mt-1">needs an Anthropic key</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onRun}
          disabled={!canRun || busy}
          className="font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-xl bg-mesa text-white hover:bg-[color:var(--color-up)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Running…" : `Run review · ${selected.length} reviewer${selected.length === 1 ? "" : "s"}`}
        </button>
        {needsKey && !hasKey && <span className="text-xs text-mute">This combination needs an Anthropic key (Settings).</span>}
      </div>
    </div>
  );
}
