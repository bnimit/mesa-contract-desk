import { useEffect } from "react";
import type { StorageBackend } from "../types.js";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  backends: StorageBackend[];
  loading: boolean;
}

export function SettingsPanel({ open, onClose, backends, loading }: SettingsPanelProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

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
            <h2 className="display-heading text-2xl mt-1">Storage backend</h2>
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
                      <div className="section-label text-mute mt-1">Unavailable · awaiting access</div>
                    )}
                  </div>
                  <button
                    disabled={!b.available || b.active}
                    className="font-mono text-xs uppercase tracking-widest text-ink border border-line px-3 py-1.5 hover:border-ink hover:bg-ink hover:text-canvas transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink"
                    title={
                      b.active
                        ? "Already active"
                        : !b.available
                        ? "Add MESA_API_KEY to .env"
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

          <div className="mt-10 pt-6 border-t border-line">
            <div className="section-label mb-3">How the swap works</div>
            <p className="serif-quote text-sm text-mute leading-relaxed">
              Every Mesa operation in this app — read, write, branch, merge, list — goes through a single <span className="font-mono not-italic text-ink-2">MesaService</span> interface. Switching backends replaces the implementation behind that interface. No agent code, no API route, no UI component changes.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
