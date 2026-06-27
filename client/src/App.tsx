import { useState, useCallback, useEffect } from "react";
import { useSettings, useWebhookTargets, useRepoTags, useContract, useReview, useAuditTrail, usePersonas, useSamples } from "./hooks/useApi.js";
import { useMesaEvents } from "./hooks/useMesaEvents.js";
import { IntakePanel } from "./components/IntakePanel.js";
import { CherryPickReview } from "./components/CherryPickReview.js";
import { AuditTrail } from "./components/AuditTrail.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { BranchVisualization, type VizPhase } from "./components/BranchVisualization.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { HowItWorks } from "./components/HowItWorks.js";
import type { Department } from "./types.js";

export default function App() {
  const { backends, loading: settingsLoading, mesaInfo, keys, saveKeys, clearKeys, resetDemo, switchBackend } = useSettings();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { personas } = usePersonas();
  const { samples } = useSamples();
  const { contract, refresh: refreshContract, loadSample, uploadFile } = useContract(refreshKey);
  const onReviewChange = useCallback(() => { refreshContract(); bump(); }, [refreshContract, bump]);
  const { review, busy, start, accept, skip, merge } = useReview(onReviewChange);
  const { events: auditEvents } = useAuditTrail(refreshKey);
  const { targets: webhookTargets, create: createWebhookTarget, remove: deleteWebhookTarget } = useWebhookTargets();
  const { tags: repoTags, update: updateRepoTags } = useRepoTags();
  const { events: mesaEvents, connected: sseConnected } = useMesaEvents();

  const [selected, setSelected] = useState<Department[]>(["legal", "finance", "security"]);
  const toggle = (id: Department) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [vizPhase, setVizPhase] = useState<VizPhase | null>(null);
  const [mergeViz, setMergeViz] = useState(false);

  // Drive the pipeline animation from real workflow state.
  useEffect(() => {
    if (mergeViz) return; // hold merge/complete window
    if (busy && !review) {
      const started = mesaEvents.some((e) => e.type === "analysis_started");
      setVizPhase(started ? "analyze" : "fork");
      return;
    }
    if (!review) { setVizPhase(null); return; }
    // review exists and status === "merging" → all branch analysis done
    setVizPhase("done");
  }, [review, busy, mesaEvents, mergeViz]);

  const handleMerge = useCallback(async () => {
    setMergeViz(true); setVizPhase("merge");
    setTimeout(() => setVizPhase("complete"), 700);
    try { await merge(); } finally { setTimeout(() => { setMergeViz(false); setVizPhase(null); }, 1700); }
  }, [merge]);

  const activeBackend = backends.find((b) => b.active);

  const vizDepartments = (review?.departments ?? selected).map((id) => {
    const p = personas.find((x) => x.id === id);
    return { id, label: p?.label ?? id, color: p?.color ?? "#34d399" };
  });

  return (
    <div className="min-h-screen text-ink">
      <header className="border-b border-line bg-canvas/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-mesa flex items-center justify-center text-white font-display italic text-sm leading-none">m</div>
            <span className="font-mono text-xs tracking-[0.14em] uppercase">Mesa</span>
            <span className="text-mute-2">·</span>
            <span className="font-display italic text-base text-ink-2">Contract Desk</span>
          </div>
          <div className="flex items-center gap-4">
            {activeBackend && (
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-mute">
                <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                <span>backend: {activeBackend.name}</span>
              </div>
            )}
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.3</span>
            {(keys.mesa || keys.anthropic) && (
              <button onClick={() => setShowClearConfirm(true)} className="font-mono text-[10px] uppercase tracking-widest text-mute hover:text-down border border-line rounded-md hover:border-down/40 px-3 py-1.5 transition-colors">
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
                  <div className="bg-ink text-white px-4 py-2.5 rounded-lg font-mono text-[11px] tracking-wide whitespace-nowrap">Add API keys to use the demo</div>
                </div>
              )}
              {!keys.anthropic && !hasOpenedSettings && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mesa settings-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-8 py-14">
        {/* Hero */}
        <section className="rounded-2xl bg-gradient-to-b from-canvas to-canvas-2 border border-line px-9 py-12 mb-8 reveal">
          <div className="pill pill-ok mb-4">Counsel-in-the-loop · versioned filesystem</div>
          <h1 className="display-heading text-5xl md:text-6xl leading-[1.04] max-w-2xl">
            Your departments redline in parallel,<br /><span className="text-mesa">you merge the best of each.</span>
          </h1>
        </section>

        {/* How it works */}
        <section className="mb-8"><HowItWorks /></section>

        {/* Intake — shown when no active review */}
        {!review && (
          <section className="mb-8">
            <IntakePanel
              personas={personas}
              contractTitle={contract?.meta.title ?? null}
              samples={samples}
              onUpload={uploadFile}
              onLoadSample={loadSample}
              selected={selected}
              onToggle={toggle}
              hasKey={keys.anthropic}
              onRun={() => start(selected)}
              busy={busy}
            />
          </section>
        )}

        {/* Pipeline animation — visible during fork/analyze/done/merge/complete */}
        {vizPhase && (
          <section className="mb-8">
            <div className="panel-dark p-5">
              <BranchVisualization
                phase={vizPhase}
                departments={vizDepartments}
                events={mesaEvents}
                mergeAll={mergeViz}
              />
            </div>
          </section>
        )}

        {/* Cherry-pick review — shown when review is active */}
        {review && review.status === "merging" && (
          <section className="mb-8">
            <div className="section-label mb-3">Review</div>
            <CherryPickReview
              review={review}
              personas={personas}
              onAccept={accept}
              onSkip={skip}
              onMerge={handleMerge}
              busy={busy}
            />
          </section>
        )}

        {/* Audit trail */}
        <section className="mb-8">
          <div className="section-label mb-3">Audit trail</div>
          <AuditTrail events={auditEvents} />
        </section>

        {/* Activity */}
        <section className="mb-8">
          <div className="section-label mb-3">Activity</div>
          <ActivityFeed events={mesaEvents} connected={sseConnected} />
        </section>
      </main>

      <footer className="border-t border-line mt-32">
        <div className="max-w-6xl mx-auto px-8 py-12">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-6">
              <div className="font-display italic text-2xl mb-2 text-ink">A Mesa demonstration.</div>
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
