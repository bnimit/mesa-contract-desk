import { useState, useEffect, useCallback } from "react";
import type {
  PortfolioWithPrices,
  AnalysisState,
  HistoryRoundSummary,
  StorageBackend,
} from "../types.js";

export function usePortfolio() {
  const [portfolio, setPortfolio] = useState<PortfolioWithPrices | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolio");
      setPortfolio(await res.json());
    } catch {
      console.error("Failed to fetch portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);
  return { portfolio, loading, refresh };
}

export function useAnalysis(onComplete?: () => void) {
  const [state, setState] = useState<AnalysisState>({ status: "idle" });

  const analyze = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/analyze", { method: "POST" });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setState({ status: "done", timestamp: data.timestamp, results: data.results });
      onComplete?.();
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }, [onComplete]);

  const merge = useCallback(
    async (branch: string, allBranches: string[]) => {
      const res = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, allBranches }),
      });
      if (!res.ok) throw new Error("Merge failed");
      setState({ status: "idle" });
      onComplete?.();
    },
    [onComplete]
  );

  const dismiss = useCallback(
    async (allBranches: string[]) => {
      await fetch("/api/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allBranches }),
      });
      setState({ status: "idle" });
      onComplete?.();
    },
    [onComplete]
  );

  return { state, analyze, merge, dismiss };
}

export function useHistory() {
  const [rounds, setRounds] = useState<HistoryRoundSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setRounds(data.rounds ?? []);
    } catch {
      console.error("Failed to fetch history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rounds, loading, refresh };
}

export function useSettings() {
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBackends(data.backends ?? []);
    } catch {
      console.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { backends, loading, refresh };
}
