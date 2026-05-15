import { useState, useCallback } from "react";
import {
  usePortfolio,
  useAnalysis,
  useHistory,
  useSettings,
} from "./hooks/useApi.js";
import { Portfolio } from "./components/Portfolio.js";
import { ComparisonView } from "./components/ComparisonView.js";
import { AnalysisLoading } from "./components/AnalysisLoading.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { HistoryTimeline } from "./components/HistoryTimeline.js";

export default function App() {
  const { portfolio, loading, refresh: refreshPortfolio } = usePortfolio();
  const { rounds, refresh: refreshHistory } = useHistory();
  const { backends, loading: settingsLoading } = useSettings();

  const onComplete = useCallback(() => {
    refreshPortfolio();
    refreshHistory();
  }, [refreshPortfolio, refreshHistory]);

  const { state, analyze, merge, dismiss } = useAnalysis(onComplete);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allBranches = state.status === "done" ? state.results.map((r) => r.branch) : [];

  const handleAccept = async (branch: string) => {
    await merge(branch, allBranches);
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
            <span className="font-mono text-xs text-mute hidden sm:inline">v0.1 · alpha</span>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-ink-2 hover:text-mesa transition-colors p-1"
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsCog />
            </button>
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
                Each AI agent forks the portfolio, analyses it through its own lens, and proposes trades on an isolated branch. Past predictions are read from Mesa history as cheap agent memory.
              </p>
              <button
                onClick={analyze}
                disabled={state.status === "loading"}
                className="group inline-flex items-center gap-3 px-6 py-3 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-mono text-xs tracking-widest uppercase">
                  {state.status === "loading" ? "Analysing" : "Run analysis"}
                </span>
                <span className="font-mono text-base group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </button>
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
        {(state.status === "loading" || state.status === "done" || state.status === "error") && (
          <>
            <div className="hairline mb-20" />
            <div className="grid grid-cols-12 gap-8 mb-20">
              <aside className="col-span-12 md:col-span-2">
                <div className="section-number">02</div>
                <div className="section-label mt-4">Analysis</div>
              </aside>
              <div className="col-span-12 md:col-span-10">
                {state.status === "loading" && <AnalysisLoading />}

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

                {state.status === "done" && (
                  <ComparisonView
                    results={state.results}
                    onAccept={handleAccept}
                    onDismiss={handleDismiss}
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
            <HistoryTimeline rounds={rounds} />
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
