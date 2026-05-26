import { useState, useEffect, useCallback } from "react";
import type {
  PortfolioWithPrices,
  AnalysisState,
  HistoryRoundSummary,
  StorageBackend,
  MesaDiffEntry,
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
      let diffs: Record<string, MesaDiffEntry[]> | undefined;
      if (data.changeIds) {
        diffs = {};
        for (const [branch, ids] of Object.entries(data.changeIds as Record<string, { base: string; head: string }>)) {
          if (ids.base && ids.head) {
            try {
              const diffRes = await fetch(`/api/diff?base=${ids.base}&head=${ids.head}`);
              const diffData = await diffRes.json();
              if (diffData.diff) diffs[branch] = diffData.diff.entries;
            } catch { /* skip */ }
          }
        }
      }
      setState({ status: "done", timestamp: data.timestamp, results: data.results, diffs });
      onComplete?.();
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }, [onComplete]);

  const replay = useCallback(
    async (from: number) => {
      setState({ status: "loading" });
      try {
        const res = await fetch("/api/replay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from }),
        });
        if (!res.ok) throw new Error("Replay failed");
        const data = await res.json();
        let diffs: Record<string, MesaDiffEntry[]> | undefined;
        if (data.changeIds) {
          diffs = {};
          for (const [branch, ids] of Object.entries(data.changeIds as Record<string, { base: string; head: string }>)) {
            if (ids.base && ids.head) {
              try {
                const diffRes = await fetch(`/api/diff?base=${ids.base}&head=${ids.head}`);
                const diffData = await diffRes.json();
                if (diffData.diff) diffs[branch] = diffData.diff.entries;
              } catch { /* skip */ }
            }
          }
        }
        setState({ status: "done", timestamp: data.timestamp, results: data.results, diffs });
        onComplete?.();
      } catch (e) {
        setState({ status: "error", message: e instanceof Error ? e.message : "Unknown error" });
      }
    },
    [onComplete]
  );

  const merge = useCallback(
    async (branch: string, allBranches: string[], agentName?: string) => {
      setState({ status: "merging", agentName: agentName ?? branch });
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
      setState({ status: "merging", agentName: "all branches" });
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

  return { state, analyze, replay, merge, dismiss };
}

export function usePlaybook(refreshKey: unknown) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/playbook");
      const data = await res.json();
      setContent(data.content ?? "");
    } catch {
      console.error("Failed to fetch playbook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return { content, loading, refresh };
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
  const [mesaInfo, setMesaInfo] = useState<{ org?: string; repo?: string; whoami?: string } | undefined>();
  const [keys, setKeys] = useState<{ mesa: boolean; anthropic: boolean }>({ mesa: false, anthropic: false });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setBackends(data.backends ?? []);
      setMesaInfo(data.mesaInfo);
      setKeys(data.keys ?? { mesa: false, anthropic: false });
    } catch {
      console.error("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const saveKeys = useCallback(async (keysToSave: { mesa?: string; anthropic?: string }) => {
    const res = await fetch("/api/settings/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keysToSave),
    });
    const data = await res.json();
    if (data.ok) {
      await refresh();
    }
    return data;
  }, [refresh]);

  const clearKeys = useCallback(async () => {
    const res = await fetch("/api/settings/keys", { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      await refresh();
    }
    return data;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetDemo = useCallback(async () => {
    const res = await fetch("/api/reset", { method: "POST" });
    return await res.json();
  }, []);

  return { backends, loading, refresh, mesaInfo, keys, saveKeys, clearKeys, resetDemo };
}
