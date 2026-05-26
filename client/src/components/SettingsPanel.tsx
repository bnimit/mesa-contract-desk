import { useEffect, useState } from "react";
import type { StorageBackend } from "../types.js";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  backends: StorageBackend[];
  loading: boolean;
  mesaInfo?: { org?: string; repo?: string; whoami?: string };
  keys: { mesa: boolean; anthropic: boolean };
  onSaveKeys: (keys: { mesa?: string; anthropic?: string }) => Promise<{ ok: boolean; error?: string }>;
  onClearKeys: () => Promise<{ ok: boolean }>;
  onReset: () => Promise<{ ok: boolean }>;
}

export function SettingsPanel({
  open,
  onClose,
  backends,
  loading,
  mesaInfo,
  keys,
  onSaveKeys,
  onClearKeys,
  onReset,
}: SettingsPanelProps) {
  const [anthropicInput, setAnthropicInput] = useState("");
  const [mesaInput, setMesaInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSave = async () => {
    const keysToSave: { mesa?: string; anthropic?: string } = {};
    if (anthropicInput.trim()) keysToSave.anthropic = anthropicInput.trim();
    if (mesaInput.trim()) keysToSave.mesa = mesaInput.trim();
    if (!keysToSave.anthropic && !keysToSave.mesa) return;

    setSaving(true);
    setError(null);
    const result = await onSaveKeys(keysToSave);
    setSaving(false);
    if (result.ok) {
      setAnthropicInput("");
      setMesaInput("");
    } else {
      setError(result.error ?? "Failed to save keys");
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setError(null);
    await onClearKeys();
    setSaving(false);
    setAnthropicInput("");
    setMesaInput("");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-ink/20 z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Flyout */}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full max-w-md bg-canvas border-l border-line z-50 overflow-y-auto transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between px-8 py-6 border-b border-line">
          <div>
            <div className="section-label">Settings</div>
            <h2 className="display-heading text-2xl mt-1">Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-mute hover:text-ink transition-colors font-mono text-lg"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <div className="px-8 py-6">
          {/* API Keys Section */}
          <div className="mb-10">
            <div className="section-label mb-4">API Keys</div>
            <p className="serif-quote text-sm text-ink-2 leading-relaxed mb-6">
              Keys are encrypted and stored locally. They persist across server restarts and are never sent to any third party.
            </p>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 font-mono text-xs tracking-wide text-ink mb-2">
                  Anthropic API Key
                  {keys.anthropic && <span className="text-up text-sm">●</span>}
                </label>
                <input
                  type="password"
                  value={anthropicInput}
                  onChange={(e) => setAnthropicInput(e.target.value)}
                  placeholder={keys.anthropic ? "Configured — enter new key to replace" : "sk-ant-..."}
                  className="w-full border border-line bg-transparent px-4 py-2.5 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 font-mono text-xs tracking-wide text-ink mb-2">
                  Mesa API Key
                  {keys.mesa && <span className="text-up text-sm">●</span>}
                </label>
                <input
                  type="password"
                  value={mesaInput}
                  onChange={(e) => setMesaInput(e.target.value)}
                  placeholder={keys.mesa ? "Configured — enter new key to replace" : "mesa_..."}
                  className="w-full border border-line bg-transparent px-4 py-2.5 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
                />
                <p className="text-xs text-mute mt-1.5">
                  Optional — without it, the local filesystem backend is used.
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 text-sm font-mono text-down">{error}</div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving || (!anthropicInput.trim() && !mesaInput.trim())}
                className="font-mono text-xs uppercase tracking-widest px-4 py-2 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Save keys"}
              </button>
              {(keys.mesa || keys.anthropic) && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-line text-ink hover:border-down hover:text-down transition-colors disabled:opacity-40"
                >
                  Clear all keys
                </button>
              )}
            </div>
          </div>

          {/* Storage backend section */}
          <div className="pt-6 border-t border-line">
            <div className="section-label mb-4">Storage backend</div>
            <p className="serif-quote text-base text-ink-2 leading-relaxed mb-8">
              Mesa is designed around a versioned filesystem interface. This demo can run against either a local filesystem fallback or the real Mesa SDK — same API, different backend.
            </p>

            {loading && <div className="section-label">Loading…</div>}

            <ul className="space-y-4">
              {backends.map((b) => (
                <li
                  key={b.name}
                  className={`border p-6 transition-colors ${
                    b.active
                      ? "border-ink bg-canvas"
                      : b.available
                      ? "border-line hover:border-ink/40"
                      : "border-line opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm tracking-wide text-ink">{b.label}</div>
                      {b.active && (
                        <div className="section-label text-mesa mt-1">● Active</div>
                      )}
                      {!b.available && !b.active && (
                        <div className="section-label text-mute mt-1">Unavailable · add Mesa key above</div>
                      )}
                    </div>
                    <button
                      disabled={!b.available || b.active}
                      className="font-mono text-xs uppercase tracking-widest text-ink border border-line px-3 py-1.5 hover:border-ink hover:bg-ink hover:text-canvas transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink"
                      title={
                        b.active
                          ? "Already active"
                          : !b.available
                          ? "Add Mesa API key above"
                          : "Switch backend"
                      }
                    >
                      {b.active ? "Active" : "Switch"}
                    </button>
                  </div>
                  <p className="text-sm text-ink-2 leading-relaxed">{b.description}</p>
                </li>
              ))}
            </ul>
          </div>

          {mesaInfo && (
            <div className="mt-8 pt-6 border-t border-line">
              <div className="section-label mb-3">Mesa connection</div>
              <div className="font-mono text-xs space-y-2 text-ink-2">
                <div className="flex justify-between">
                  <span className="text-mute">org</span>
                  <span>{mesaInfo.org}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">repo</span>
                  <span>{mesaInfo.repo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-mute">key</span>
                  <span>{mesaInfo.whoami}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-line">
            <div className="section-label mb-3">How the swap works</div>
            <p className="serif-quote text-sm text-mute leading-relaxed">
              Every Mesa operation in this app — read, write, branch, merge, list — goes through a single <span className="font-mono not-italic text-ink-2">MesaService</span> interface. Switching backends replaces the implementation behind that interface. No agent code, no API route, no UI component changes.
            </p>
          </div>

          <div className="mt-10 pt-6 border-t border-line">
            <div className="section-label mb-3">Reset demo</div>
            <p className="serif-quote text-sm text-mute leading-relaxed mb-4">
              Clear all history, reset the playbook, and restore the portfolio to its defaults. API keys are kept.
            </p>
            <button
              onClick={async () => {
                setSaving(true);
                await onReset();
                setSaving(false);
              }}
              disabled={saving}
              className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-down/40 text-down hover:bg-down/10 transition-colors disabled:opacity-40"
            >
              {saving ? "Resetting…" : "Reset all data"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
