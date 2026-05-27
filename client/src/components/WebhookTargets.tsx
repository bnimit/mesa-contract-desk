import { useState } from "react";
import type { WebhookTarget } from "../types.js";

const ALL_EVENTS = [
  "repo.created", "repo.updated", "repo.deleted",
  "bookmark.created", "bookmark.deleted", "bookmark.moved", "bookmark.merged",
  "change.created", "change.evolved", "push",
] as const;

interface WebhookTargetsProps {
  targets: WebhookTarget[];
  onCreate: (url: string, name?: string, events?: string[]) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<void>;
  isMesaBackend: boolean;
}

export function WebhookTargets({ targets, onCreate, onDelete, isMesaBackend }: WebhookTargetsProps) {
  const [showForm, setShowForm] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isMesaBackend) {
    return (
      <div className="pt-6 border-t border-line">
        <div className="section-label mb-3">Webhook targets</div>
        <p className="serif-quote text-sm text-mute leading-relaxed">
          Webhook target management requires the Mesa SDK or fs.mount backend. Switch backends above to enable.
        </p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!urlInput.trim()) return;
    setSaving(true);
    setError(null);
    const events = selectedEvents.size > 0 ? Array.from(selectedEvents) : undefined;
    const result = await onCreate(urlInput.trim(), nameInput.trim() || undefined, events);
    setSaving(false);
    if (result.ok) {
      setUrlInput("");
      setNameInput("");
      setSelectedEvents(new Set());
      setShowForm(false);
    } else {
      setError(result.error ?? "Failed to create target");
    }
  };

  const toggleEvent = (evt: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(evt)) next.delete(evt);
      else next.add(evt);
      return next;
    });
  };

  return (
    <div className="pt-6 border-t border-line">
      <div className="flex items-center justify-between mb-4">
        <div className="section-label">Webhook targets</div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="font-mono text-[10px] uppercase tracking-widest text-mesa hover:text-ink transition-colors"
        >
          {showForm ? "Cancel" : "+ Add target"}
        </button>
      </div>

      <p className="serif-quote text-sm text-mute leading-relaxed mb-4">
        Register endpoints to receive real-time events from Mesa — branch operations, file changes, and merges.
      </p>

      {showForm && (
        <div className="border border-line p-4 mb-4 space-y-3">
          <div>
            <label className="font-mono text-[10px] tracking-wide text-mute mb-1 block">URL</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/webhook"
              className="w-full border border-line bg-transparent px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-wide text-mute mb-1 block">Name (optional)</label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="My webhook"
              className="w-full border border-line bg-transparent px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-wide text-mute mb-2 block">
              Events (leave empty for all)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_EVENTS.map((evt) => (
                <button
                  key={evt}
                  onClick={() => toggleEvent(evt)}
                  className={`font-mono text-[10px] px-2 py-1 border transition-colors ${
                    selectedEvents.has(evt)
                      ? "border-mesa text-mesa bg-mesa/5"
                      : "border-line text-mute hover:border-ink/30"
                  }`}
                >
                  {evt}
                </button>
              ))}
            </div>
          </div>
          {error && <div className="text-sm font-mono text-down">{error}</div>}
          <button
            onClick={handleCreate}
            disabled={saving || !urlInput.trim()}
            className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Creating…" : "Create target"}
          </button>
        </div>
      )}

      {targets.length === 0 && !showForm && (
        <div className="font-mono text-xs text-mute-2 py-3">No webhook targets configured</div>
      )}

      {targets.length > 0 && (
        <div className="space-y-2">
          {targets.map((t) => (
            <div key={t.id} className="border border-line p-3 flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-up mt-2 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-ink truncate">{t.url}</div>
                {t.name && (
                  <div className="font-mono text-[10px] text-mute mt-0.5">{t.name}</div>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {t.events.map((evt) => (
                    <span key={evt} className="font-mono text-[9px] px-1.5 py-0.5 bg-ink/5 text-mute">
                      {evt}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => onDelete(t.id)}
                className="font-mono text-[10px] text-mute hover:text-down transition-colors shrink-0"
                title="Delete target"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
