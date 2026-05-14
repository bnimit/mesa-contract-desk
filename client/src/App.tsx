import { usePortfolio, useAnalysis } from "./hooks/useApi.js";
import { Portfolio } from "./components/Portfolio.js";
import { ComparisonView } from "./components/ComparisonView.js";

export default function App() {
  const { portfolio, loading, refresh } = usePortfolio();
  const { state, analyze, merge, dismiss } = useAnalysis();

  const allBranches = state.status === "done" ? state.results.map((r) => r.branch) : [];

  const handleAccept = async (branch: string) => {
    await merge(branch, allBranches);
    refresh();
  };

  const handleDismiss = async () => {
    await dismiss(allBranches);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Mesa Portfolio Advisor</h1>
            <p className="text-gray-500 mt-1">Multi-agent analysis powered by Mesa versioned filesystem</p>
          </div>
          <button
            onClick={analyze}
            disabled={state.status === "loading"}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition"
          >
            {state.status === "loading" ? "Analyzing..." : "Run Analysis"}
          </button>
        </div>

        {loading && <div className="text-gray-400">Loading portfolio...</div>}
        {portfolio && <Portfolio data={portfolio} />}

        {state.status === "loading" && (
          <div className="mt-8 text-center text-gray-500">
            <div className="animate-pulse">Three agents are analyzing your portfolio on separate Mesa branches...</div>
          </div>
        )}

        {state.status === "error" && (
          <div className="mt-8 bg-red-50 text-red-700 p-4 rounded-lg">
            Error: {state.message}
            <button onClick={analyze} className="ml-4 underline">Retry</button>
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
  );
}
