import { useState, useEffect, useCallback } from "react";
import type {
  StorageBackend,
  WebhookTarget,
  RepoTags,
  Contract,
  ReviewState,
  AuditEvent,
  Persona,
  Department,
} from "../types.js";

export function usePersonas() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  useEffect(() => { fetch("/api/personas").then((r) => r.json()).then((d) => setPersonas(d.personas ?? [])).catch(() => {}); }, []);
  return { personas };
}

export function useSamples() {
  const [samples, setSamples] = useState<{ id: string; title: string; cannedAvailable: boolean }[]>([]);
  useEffect(() => { fetch("/api/samples").then((r) => r.json()).then((d) => setSamples(d.samples ?? [])).catch(() => {}); }, []);
  return { samples };
}

export function useContract(refreshKey?: unknown) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setContract(await (await fetch("/api/contract")).json()); }
    catch { /* */ } finally { setLoading(false); }
  }, []);
  const loadSample = useCallback(async (id: string) => {
    const r = await fetch("/api/contract/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const d = await r.json(); if (r.ok) setContract(d.contract); return d;
  }, []);
  const uploadFile = useCallback(async (file: File) => {
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await fetch("/api/contract/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({ error: "Upload failed" }));
      if (r.ok) { setContract(d.contract); return { ok: true, contract: d.contract }; }
      return { ok: false, error: d.error };
    } catch {
      return { ok: false, error: "Upload failed" };
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);
  return { contract, loading, refresh, loadSample, uploadFile };
}

export function useReview(onChange?: () => void) {
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const refreshActive = useCallback(async () => {
    try { const d = await (await fetch("/api/review/active")).json(); setReview(d.review); } catch { /* */ }
  }, []);
  useEffect(() => { refreshActive(); }, [refreshActive]);
  const post = useCallback(async (path: string, body: object) => {
    setBusy(true);
    try { const d = await (await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(); onChange?.(); return d; }
    finally { setBusy(false); }
  }, [onChange]);
  const start = useCallback(async (departments: Department[]) => { setBusy(true); try { const r = await fetch("/api/review/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departments }) }); const d = await r.json(); if (r.ok) setReview(d); onChange?.(); return d; } finally { setBusy(false); } }, [onChange]);
  const accept = useCallback(async (decisionId: string, department: Department) => { if (!review) return; setReview(await post("/api/review/accept", { id: review.id, decisionId, department })); }, [review, post]);
  const skip = useCallback(async (decisionId: string) => { if (!review) return; setReview(await post("/api/review/skip", { id: review.id, decisionId })); }, [review, post]);
  const merge = useCallback(async () => { if (!review) return; await post("/api/review/merge", { id: review.id }); setReview(null); onChange?.(); }, [review, post, onChange]);
  const cancel = useCallback(async () => { await post("/api/review/cancel", {}); setReview(null); onChange?.(); }, [post, onChange]);
  return { review, busy, start, accept, skip, merge, cancel, refreshActive };
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
