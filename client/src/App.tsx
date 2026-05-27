import { useState, useCallback, useEffect } from "react";
import {
  usePortfolio,
  useAnalysis,
  useHistory,
  useSettings,
  usePlaybook,
  useWebhookTargets,
  useChanges,
  useRepoTags,
} from "./hooks/useApi.js";
import { useMesaEvents } from "./hooks/useMesaEvents.js";
import { Portfolio } from "./components/Portfolio.js";
import { ComparisonView } from "./components/ComparisonView.js";
import { BranchVisualization, type VizPhase } from "./components/BranchVisualization.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { HistoryTimeline } from "./components/HistoryTimeline.js";
import { PlaybookView } from "./components/PlaybookView.js";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { ChangeTimeline } from "./components/ChangeTimeline.js";

export default function App() {
  const { portfolio, loading, refresh: refreshPortfolio } = usePortfolio();
  const { rounds, refresh: refreshHistory } = useHistory();
  const { backends, loading: settingsLoading, mesaInfo, keys, saveKeys, clearKeys, resetDemo, switchBackend } = useSettings();
  const [refreshKey, setRefreshKey] = useState(0);
  const { content: playbookContent } = usePlaybook(refreshKey);
  const { targets: webhookTargets, create: createWebhookTarget, remove: deleteWebhookTarget } = useWebhookTargets();
  const { changes, loading: changesLoading } = useChanges(refreshKey);
  const { tags: repoTags, update: updateRepoTags } = useRepoTags();

  const onComplete = useCallback(() => {
    refreshPortfolio();
    refreshHistory();
    setRefreshKey((k) => k + 1);
  }, [refreshPortfolio, refreshHistory]);

  const { state, analyze, replay, merge, dismiss } = useAnalysis(onComplete);
  const { events: mesaEvents, connected: sseConnected } = useMesaEvents();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasOpenedSettings, setHasOpenedSettings] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [lastMergedAgent, setLastMergedAgent] = useState<string | undefined>();
  const [vizGeneration, setVizGeneration] = useState(0);

  useEffect(() => {
    if (state.status === "done" || state.status === "idle") {
      refreshHistory();
      setRefreshKey((k) => k + 1);
    }
  }, [state.status, refreshHistory]);

  useEffect(() => {
    if (state.status === "loading") {
      setVizGeneration((g) => g + 1);
    }
    if (state.status === "merging") {
      setLastMergedAgent(state.agentName);
    }
    if (state.status === "idle" && lastMergedAgent) {
      setShowComplete(true);
      const timer = setTimeout(() => {
        setShowComplete(false);
        setLastMergedAgent(undefined);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [state.status, lastMergedAgent]);

  const vizPhase: VizPhase | null = (() => {
    if (showComplete) return "complete";
    if (state.status === "loading") {
      const hasStarted = mesaEvents.some((e) => e.type === "analysis_started");
      return hasStarted ? "analyze" : "fork";
    }
    if (state.status === "done") return "done";
    if (state.status === "merging") return "merge";
    return null;
  })();

  const allBranches = state.status === "done" ? state.results.map((r) => r.branch) : [];

  const handleAccept = async (branch: string) => {
    const agent = state.status === "done"
      ? state.results.find((r) => r.branch === branch)?.agentName
      : undefined;
    await merge(branch, allBranches, agent);
  };

  const handleDismiss = async () => {
    await dismiss(allBranches);
  };

  const activeBackend = backends.find((b) => b.active);

  return (
    <div className="min-h-screen text-ink">
      {/* Top navigation strip */}
      <header className="border-b border-line">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-ink flex items-center justify-center text-canvas font-display italic text-base leading-none">
              <span style={{ transform: "translateY(-1px)" }}>m</span>
            </div>
            <span className="font-mono text-xs tracking-[0.2em] uppercase">Mesa</span>
            <span className="text-mute-2 mx-2">·</span>
            <span className="font-display italic text-base text-ink-2">Portfolio Advisor</span>
          </div>
          <div className="flex items-center gap-6">
            {activeBackend && (
              <div className="hidden md:flex items-center gap-2 font-mono text-xs text-mute">
                <span className="w-1.5 h-1.5 rounded-full bg-up inline-block" />
                <span>backend: {activeBackend.name}</span>
              </div>
            )}
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.2 · alpha</span>
            <div className="relative">
              <button
                onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }}
                className="text-ink-2 hover:text-mesa transition-colors p-1"
                aria-label="Open settings"
                title="Settings"
              >
                <SettingsCog />
              </button>
              {!keys.anthropic && !settingsOpen && !hasOpenedSettings && (
                <div className="absolute right-0 top-full mt-2 settings-callout">
                  <span className="absolute -top-1 right-3 w-2 h-2 bg-ink rotate-45" />
                  <div className="bg-ink text-canvas px-4 py-2.5 font-mono text-[11px] tracking-wide whitespace-nowrap">
                    Add API keys to use the demo
                  </div>
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
        {/* Hero / Intro */}
        <section className="mb-20 reveal">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="section-label mb-4">A demonstration · multi-agent versioned workflows</div>
              <h1 className="display-heading text-6xl md:text-7xl leading-[0.95] tracking-tight">
                Three agents,<br />
                three branches,<br />
                <span className="italic text-mesa">one merge.</span>
              </h1>
            </div>
            <div className="col-span-12 md:col-span-4">
              <p className="serif-quote text-lg leading-relaxed text-ink-2 mb-6">
                Each agent forks the portfolio, writes its observations to a shared <span className="font-mono not-italic text-ink">playbook.md</span>, and proposes trades on an isolated branch. Their accumulated reasoning lives on Mesa — pick a strategy, or replay any past round.
              </p>
              <button
                onClick={analyze}
                disabled={state.status === "loading" || !keys.anthropic}
                className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-mono text-xs tracking-widest uppercase">
                  {state.status === "loading" ? "Analysing" : "Run analysis"}
                </span>
                <span className="font-mono text-base group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
              {!keys.anthropic && (
                <button
                  onClick={() => { setSettingsOpen(true); setHasOpenedSettings(true); }}
                  className="section-label text-mesa hover:underline cursor-pointer mt-3 block text-left"
                >
                  Add your Anthropic API key in Settings to begin →
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="hairline mb-20" />

        {/* Section 01: Portfolio */}
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2">
            <div className="section-number">01</div>
            <div className="section-label mt-4">Position</div>
          </aside>
          <div className="col-span-12 md:col-span-10">
            {loading && (
              <div className="section-label fade-in">Loading portfolio…</div>
            )}
            {portfolio && <Portfolio data={portfolio} />}
          </div>
        </div>

        {/* Section 02: Analysis */}
        {(state.status === "loading" || state.status === "done" || state.status === "error" || state.status === "merging" || showComplete) && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2">
                <div className="section-number">02</div>
                <div className="section-label mt-4">Analysis</div>
              </aside>
              <div className="col-span-12 md:col-span-10">
                {state.status === "error" && (
                  <div className="border border-down/30 bg-down/5 p-8 fade-in">
                    <div className="section-label text-down mb-2">Error</div>
                    <p className="font-mono text-sm text-down mb-4">{state.message}</p>
                    <button
                      onClick={analyze}
                      className="font-mono text-xs uppercase tracking-widest text-down hover:underline"
                    >
                      Retry →
                    </button>
                  </div>
                )}

                {vizPhase && (
                  <BranchVisualization
                    key={vizGeneration}
                    phase={vizPhase}
                    events={mesaEvents}
                    winnerAgent={
                      state.status === "merging"
                        ? state.agentName
                        : showComplete
                        ? lastMergedAgent
                        : undefined
                    }
                  />
                )}

                {state.status === "done" && (
                  <ComparisonView
                    results={state.results}
                    onAccept={handleAccept}
                    onDismiss={handleDismiss}
                    isReplay={state.isReplay}
                    mergedAgent={state.mergedAgent}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* Section 03: History */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2">
            <div className="section-number">03</div>
            <div className="section-label mt-4">History</div>
          </aside>
          <div className="col-span-12 md:col-span-10">
            <HistoryTimeline
              rounds={rounds}
              onReplay={replay}
              replayDisabled={state.status === "loading"}
            />
          </div>
        </div>

        {/* Section 04: Playbook */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2">
            <div className="section-number">04</div>
            <div className="section-label mt-4">Playbook</div>
          </aside>
          <div className="col-span-12 md:col-span-10">
            <PlaybookView content={playbookContent} />
          </div>
        </div>

        {/* Section 05: Activity */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2">
            <div className="section-number">05</div>
            <div className="section-label mt-4">Activity</div>
          </aside>
          <div className="col-span-12 md:col-span-10">
            <ActivityFeed events={mesaEvents} connected={sseConnected} />
          </div>
        </div>

        {/* Section 06: Change Log */}
        <div className="hairline mb-20" />
        <div className="grid grid-cols-12 gap-8 mb-20">
          <aside className="col-span-12 md:col-span-2">
            <div className="section-number">06</div>
            <div className="section-label mt-4">Change log</div>
          </aside>
          <div className="col-span-12 md:col-span-10">
            <ChangeTimeline changes={changes} loading={changesLoading} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line mt-32">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 md:col-span-6">
              <div className="font-display italic text-2xl mb-2">
                A Mesa demonstration.
              </div>
              <p className="text-sm text-mute max-w-md">
                Built to explore versioned filesystems for multi-agent workflows. Real market data via Yahoo Finance. Three agents reasoned by Claude.
              </p>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="section-label mb-3">Built with</div>
              <ul className="font-mono text-xs space-y-1.5 text-ink-2">
                <li>@mesadev/sdk</li>
                <li>@anthropic-ai/sdk</li>
                <li>yahoo-finance2</li>
                <li>react · vite · tailwind</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {/* Settings flyout */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        backends={backends}
        loading={settingsLoading}
        mesaInfo={mesaInfo}
        keys={keys}
        onSaveKeys={saveKeys}
        onClearKeys={clearKeys}
        onReset={async () => {
          const result = await resetDemo();
          if (result.ok) {
            refreshPortfolio();
            refreshHistory();
            setRefreshKey((k) => k + 1);
          }
          return result;
        }}
        onSwitchBackend={async (backend) => {
          const result = await switchBackend(backend);
          if (result.ok) {
            refreshPortfolio();
            refreshHistory();
            setRefreshKey((k) => k + 1);
          }
          return result;
        }}
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
