import { useState } from "react";
import type { RepoTags as RepoTagsType } from "../types.js";

interface RepoTagsProps {
  tags: RepoTagsType;
  onUpdate: (tags: Record<string, string | null>) => Promise<{ ok: boolean }>;
  isMesaBackend: boolean;
}

export function RepoTags({ tags, onUpdate, isMesaBackend }: RepoTagsProps) {
  const [showForm, setShowForm] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isMesaBackend) return null;

  const entries = Object.entries(tags);

  const handleAdd = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    await onUpdate({ [keyInput.trim()]: valueInput.trim() || "" });
    setSaving(false);
    setKeyInput("");
    setValueInput("");
    setShowForm(false);
  };

  const handleRemove = async (key: string) => {
    setSaving(true);
    await onUpdate({ [key]: null });
    setSaving(false);
  };

  return (
    <div className="mt-6 pt-6 border-t border-line">
      <div className="flex items-center justify-between mb-3">
        <div className="section-label">Repository tags</div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="font-mono text-[10px] uppercase tracking-widest text-mesa hover:text-ink transition-colors"
        >
          {showForm ? "Cancel" : "+ Add tag"}
        </button>
      </div>

      <p className="serif-quote text-sm text-mute leading-relaxed mb-4">
        Key-value metadata on the Mesa repository. Tags are visible to all API consumers and persist across operations.
      </p>

      {showForm && (
        <div className="border border-line p-3 mb-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="font-mono text-[10px] tracking-wide text-mute mb-1 block">Key</label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="environment"
              className="w-full border border-line bg-transparent px-2 py-1.5 font-mono text-xs text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="font-mono text-[10px] tracking-wide text-mute mb-1 block">Value</label>
            <input
              type="text"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder="demo"
              className="w-full border border-line bg-transparent px-2 py-1.5 font-mono text-xs text-ink placeholder:text-mute focus:outline-none focus:border-ink transition-colors"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !keyInput.trim()}
            className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 bg-ink text-canvas hover:bg-mesa transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {saving ? "…" : "Add"}
          </button>
        </div>
      )}

      {entries.length === 0 && !showForm && (
        <div className="font-mono text-xs text-mute-2 py-2">No tags set</div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="group flex items-center gap-1.5 border border-line px-2.5 py-1 hover:border-ink/30 transition-colors"
            >
              <span className="font-mono text-[10px] text-mesa">{key}</span>
              {value && (
                <>
                  <span className="text-mute-2 text-[10px]">=</span>
                  <span className="font-mono text-[10px] text-ink-2">{value}</span>
                </>
              )}
              <button
                onClick={() => handleRemove(key)}
                className="font-mono text-[10px] text-mute opacity-0 group-hover:opacity-100 hover:text-down transition-all ml-1"
                title="Remove tag"
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
