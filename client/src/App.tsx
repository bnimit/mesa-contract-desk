import { useState, useCallback, useEffect } from "react";
import { useSettings, useWebhookTargets, useRepoTags, useContract, useReview, useAuditTrail } from "./hooks/useApi.js";
import { useMesaEvents } from "./hooks/useMesaEvents.js";
import { ContractView } from "./components/ContractView.js";
import { RedlineComparison } from "./components/RedlineComparison.js";
import { ApprovalGate } from "./components/ApprovalGate.js";
import { AuditTrail } from "./components/AuditTrail.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { BranchVisualization, type VizPhase } from "./components/BranchVisualization.js";
import { SettingsPanel } from "./components/SettingsPanel.js";

export default function App() {
  const { backends, loading: settingsLoading, mesaInfo, keys, saveKeys, clearKeys, resetDemo, switchBackend } = useSettings();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { contract, refresh: refreshContract } = useContract(refreshKey);
  const onReviewChange = useCallback(() => { refreshContract(); bump(); }, [refreshContract, bump]);
  const { review, strategies, busy, start, pick, approve, reject, rollback, merge } = useReview(onReviewChange);
  const { events: auditEvents } = useAuditTrail(refreshKey);
  const { targets: webhookTargets, create: createWebhookTarget, remove: deleteWebhookTarget } = useWebhookTargets();
  const { tags: repoTags, update: updateRepoTags } = useRepoTags();
  const { events: mesaEvents, connected: sseConnected } = useMesaEvents();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [vizGeneration, setVizGeneration] = useState(0);

  useEffect(() => { if (busy) setVizGeneration((g) => g + 1); }, [busy]);

  const activeBackend = backends.find((b) => b.active);
  const phase: "idle" | "picking" | "gating" = !review ? "idle" : review.status === "picking" ? "picking" : "gating";
  const vizPhase: VizPhase | null = phase === "picking" ? "analyze" : phase === "gating" ? "done" : null;

  return (
    <div className="min-h-screen text-ink">
      <header className="border-b border-line">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-ink flex items-center justify-center text-canvas font-display italic text-base leading-none">
              <span style={{ transform: "translateY(-1px)" }}>m</span>
            </div>
            <span className="font-mono text-xs tracking-[0.2em] uppercase">Mesa</span>
            <span className="text-mute-2 mx-2">·</span>
            <span className="font-display italic text-base text-ink-2">Contract Desk</span>
          </div>
          <div className="flex items-center gap-6">
            {activeBackend && (
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-mute">
                <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                <span>backend: {activeBackend.name}</span>
              </div>
            )}
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.3 · alpha</span>
            {(keys.mesa || keys.anthropic) && (
              <button onClick={() => setShowClearConfirm(true)} className="font-mono text-[10px] uppercase tracking-widest text-mute hover:text-down border border-line hover:border-down/40 px-3 py-1 transition-colors">
                Clear all keys
              </button>
            )}
            <div className="relative">
              <button onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }} className="text-ink-2 hover:text-mesa transition-colors p-1" aria-label="Open settings" title="Settings">
                <SettingsCog />
              </button>
              {!keys.anthropic && !settingsOpen && !hasOpenedSettings && (
                <div className="absolute right-0 top-full mt-2 settings-callout">
                  <span className="absolute -top-1 right-3 w-2 h-2 bg-ink rotate-45" />
                  <div className="bg-ink text-canvas px-4 py-2.5 font-mono text-[11px] tracking-wide whitespace-nowrap">Add API keys to use the demo</div>
                </div>
              )}
              {!keys.anthropic && !hasOpenedSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mesa settings-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-16">
        <section className="mb-20 reveal">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="section-label mb-4">A demonstration · human-in-the-loop contract review</div>
              <h1 className="display-heading text-6xl md:text-7xl leading-[0.95] tracking-tight">
                Three agents redline,<br />one human approves,<br /><span className="italic text-mesa">every change on the record.</span>
              </h1>
            </div>
            <div className="col-span-12 md:col-span-4">
              <p className="serif-quote text-lg leading-relaxed text-ink-2 mb-6">
                Three attorneys fork the contract on Mesa, each proposing a different redline posture. You approve clause-by-clause through a gate that pauses and resumes from exact state — and every decision is preserved immutably.
              </p>
              <button onClick={start} disabled={busy || !!review} className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <span className="font-mono text-xs tracking-widest uppercase">{busy ? "Working" : review ? "Review in progress" : "Run review"}</span>
                <span className="font-mono text-base group-hover:translate-x-1 transition-transform">→</span>
              </button>
              {!keys.anthropic && (
                <button onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }} className="section-label text-mesa hover:underline cursor-pointer mt-3 block text-left">
                  Runs with canned redlines — add an Anthropic key for live agents →
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="hairline mb-20" />

        {/* 01 Contract */}
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">01</div><div className="section-label mt-4">Contract</div></aside>
          <div className="col-span-12 md:col-span-10">{contract && <ContractView contract={contract} />}</div>
        </div>

        {/* 02 Review (swarm + pick) */}
        {review && review.status === "picking" && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2"><div className="section-number">02</div><div className="section-label mt-4">Review</div></aside>
              <div className="col-span-12 md:col-span-10">
                {vizPhase && <BranchVisualization key={vizGeneration} phase={vizPhase} events={mesaEvents} />}
                <div className="mt-8"><RedlineComparison strategies={strategies} onPick={pick} busy={busy} /></div>
              </div>
            </div>
          </>
        )}

        {/* 03 Approval gate */}
        {review && review.status === "gating" && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2"><div className="section-number">03</div><div className="section-label mt-4">Approve</div></aside>
              <div className="col-span-12 md:col-span-10">
                <ApprovalGate review={review} onApprove={approve} onReject={reject} onRollback={rollback} onMerge={merge} busy={busy} />
              </div>
            </div>
          </>
        )}

        {/* 04 Audit trail */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">04</div><div className="section-label mt-4">Audit</div></aside>
          <div className="col-span-12 md:col-span-10"><AuditTrail events={auditEvents} /></div>
        </div>

        {/* 05 Activity */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2"><div className="section-number">05</div><div className="section-label mt-4">Activity</div></aside>
          <div className="col-span-12 md:col-span-10"><ActivityFeed events={mesaEvents} connected={sseConnected} /></div>
        </div>
      </main>

      <footer className="border-t border-line mt-32">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-6">
              <div className="font-display italic text-2xl mb-2">A Mesa demonstration.</div>
              <p className="text-sm text-mute max-w-md">Human-in-the-loop contract redlining on a versioned filesystem. Branch, approve, audit, roll back — agents reasoned by Claude.</p>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="section-label mb-3">Built with</div>
              <ul className="font-mono text-xs space-y-1.5 text-ink-2"><li>@mesadev/sdk</li><li>@anthropic-ai/sdk</li><li>react · vite · tailwind</li></ul>
            </div>
          </div>
        </div>
      </footer>

      {showClearConfirm && (
        <div className="fixed inset-0 bg-ink/30 z-[60] flex items-center justify-center" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-canvas border border-line p-8 max-w-sm mx-4 reveal" onClick={(e) => e.stopPropagation()}>
            <div className="section-label text-down mb-3">Clear all API keys?</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed mb-6">This removes your Anthropic and Mesa keys from the encrypted store and resets the backend to local filesystem.</p>
            <div className="flex gap-3">
              <button onClick={async () => { await clearKeys(); setShowClearConfirm(false); }} className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-down text-canvas hover:bg-down/80 transition-colors">Clear keys</button>
              <button onClick={() => setShowClearConfirm(false)} className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-line text-ink hover:border-ink transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backends={backends}
        loading={settingsLoading}
        mesaInfo={mesaInfo}
        keys={keys}
        onSaveKeys={saveKeys}
        onClearKeys={clearKeys}
        onReset={async () => { const r = await resetDemo(); if (r.ok) { refreshContract(); bump(); } return r; }}
        onSwitchBackend={async (b) => { const r = await switchBackend(b); if (r.ok) { refreshContract(); bump(); } return r; }}
        webhookTargets={webhookTargets}
        onCreateWebhookTarget={createWebhookTarget}
        onDeleteWebhookTarget={deleteWebhookTarget}
        repoTags={repoTags}
        onUpdateRepoTags={updateRepoTags}
      />
    </div>
  );
}

function SettingsCog() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
