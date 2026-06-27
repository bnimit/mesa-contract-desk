import { useState, useEffect, useCallback } from "react";
import type {
  StorageBackend,
  WebhookTarget,
  MesaChange,
  RepoTags,
  Contract,
  RedlineStrategy,
  ReviewState,
  AuditEvent,
  Posture,
} from "../types.js";

export function useContract(refreshKey?: unknown) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/contract");
      setContract(await res.json());
    } catch { console.error("Failed to fetch contract"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { contract, loading, refresh };
}

export function useReview(onChange?: () => void) {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [strategies, setStrategies] = useState<RedlineStrategy[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshActive = useCallback(async () => {
    const res = await fetch("/api/review/active");
    const data = await res.json();
    const r: ReviewState | null = data.review;
    setReview(r);
    if (r) {
      setReviewId(r.id);
      if (r.status === "picking" && r.strategies) setStrategies(r.strategies);
    }
  }, []);

  useEffect(() => { refreshActive(); }, [refreshActive]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/review/start", { method: "POST" });
      const data = await res.json();
      setReviewId(data.id);
      setStrategies(data.strategies);
      await refreshActive();
    } finally { setBusy(false); }
  }, [refreshActive]);

  const post = useCallback(async (path: string, body: object) => {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      onChange?.();
      return data;
    } finally { setBusy(false); }
  }, [onChange]);

  const pick = useCallback(async (posture: Posture) => {
    const id = reviewId; if (!id) return;
    const state = await post("/api/review/pick", { id, posture });
    setReview(state);
  }, [reviewId, post]);

  const approve = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/approve", { id })); }, [reviewId, post]);
  const reject = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/reject", { id })); }, [reviewId, post]);
  const rollback = useCallback(async () => { const id = reviewId; if (!id) return; setReview(await post("/api/review/rollback", { id })); }, [reviewId, post]);
  const merge = useCallback(async () => {
    const id = reviewId; if (!id) return;
    await post("/api/review/merge", { id });
    setReview(null); setStrategies([]); setReviewId(null);
    onChange?.();
  }, [reviewId, post, onChange]);

  return { review, strategies, reviewId, busy, start, pick, approve, reject, rollback, merge, refreshActive };
}

export function useAuditTrail(refreshKey: unknown) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setEvents(data.events ?? []);
    } catch { console.error("Failed to fetch audit"); }
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { events, refresh };
}

export function useSettings() {
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesaInfo, setMesaInfo] = useState<{ org?: string; repo?: string; whoami?: string; tags?: Record<string, string> } | undefined>();
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

  const switchBackend = useCallback(async (backend: string) => {
    const res = await fetch("/api/settings/backend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backend }),
    });
    const data = await res.json();
    if (data.ok) {
      await refresh();
    }
    return data;
  }, [refresh]);

  return { backends, loading, refresh, mesaInfo, keys, saveKeys, clearKeys, resetDemo, switchBackend };
}

export function useWebhookTargets() {
  const [targets, setTargets] = useState<WebhookTarget[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks/targets");
      const data = await res.json();
      setTargets(data.targets ?? []);
    } catch {
      console.error("Failed to fetch webhook targets");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (url: string, name?: string, events?: string[]) => {
    const res = await fetch("/api/webhooks/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, name, events }),
    });
    const data = await res.json();
    if (data.ok) await refresh();
    return data;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/webhooks/targets/${id}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return { targets, loading, refresh, create, remove };
}

export function useChanges(refreshKey: unknown) {
  const [changes, setChanges] = useState<MesaChange[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/changes?limit=30");
      const data = await res.json();
      setChanges(data.changes ?? []);
    } catch {
      console.error("Failed to fetch changes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  return { changes, loading, refresh };
}

export function useRepoTags() {
  const [tags, setTags] = useState<RepoTags>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/repo/tags");
      const data = await res.json();
      setTags(data.tags ?? {});
    } catch {
      console.error("Failed to fetch repo tags");
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (newTags: Record<string, string | null>) => {
    const res = await fetch("/api/repo/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    const data = await res.json();
    if (data.ok) setTags(data.tags);
    return data;
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { tags, loading, refresh, update };
}
