import { useEffect, useRef, useState } from "react";
import { ChevronLeft, FolderOpen, Plus, Trash2 } from "lucide-react";
import {
  apiGetDisplaySettings,
  apiGetShortcuts,
  apiOpenFolderDialog,
  apiSaveDisplaySettings,
  apiSaveShortcuts,
} from "../api";
import type { DisplaySettings, ShortcutFolder, ShortcutLayout } from "../types";
import { folderBaseName } from "../utils";

interface Props {
  onBack: () => void;
}

interface Row extends ShortcutFolder {
  id: number;
}

const LAYOUT_OPTIONS: { value: ShortcutLayout; label: string }[] = [
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

function nextFreeKey(existing: Row[]): string {
  const used = new Set(existing.map(s => s.key));
  const pool = "0123456789abcdefghijklmnopqrstuvwxyz";
  for (const c of pool) if (!used.has(c)) return c;
  return "";
}

export default function SettingsScreen({ onBack }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [display, setDisplay] = useState<DisplaySettings>({ truncateLength: 10, layout: "bottom" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    void (async () => {
      const [list, displaySettings] = await Promise.all([apiGetShortcuts(), apiGetDisplaySettings()]);
      setRows(list.map(s => ({ ...s, id: nextId.current++ })));
      setDisplay(displaySettings);
      setLoading(false);
    })();
  }, []);

  function updateKey(id: number, rawKey: string) {
    const key = rawKey.slice(-1).toLowerCase();
    setRows(prev => prev.map(s => (s.id === id ? { ...s, key } : s)));
    setSaved(false);
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(s => s.id !== id));
    setSaved(false);
  }

  async function addRow() {
    const folderPath = await apiOpenFolderDialog("Select folder for shortcut");
    if (!folderPath) return;
    setRows(prev => [...prev, { id: nextId.current++, key: nextFreeKey(prev), folderPath }]);
    setSaved(false);
  }

  async function changeFolder(id: number) {
    const folderPath = await apiOpenFolderDialog("Select folder for shortcut");
    if (!folderPath) return;
    setRows(prev => prev.map(s => (s.id === id ? { ...s, folderPath } : s)));
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    const keys = rows.map(s => s.key.trim().toLowerCase());
    for (const key of keys) {
      if (!/^[a-z0-9]$/.test(key)) {
        setError("Every shortcut needs a single letter or number key.");
        return;
      }
    }
    if (new Set(keys).size !== keys.length) {
      setError("Shortcut keys must be unique.");
      return;
    }
    setSaving(true);
    try {
      const [clean, cleanDisplay] = await Promise.all([
        apiSaveShortcuts(rows.map(s => ({ key: s.key.trim().toLowerCase(), folderPath: s.folderPath }))),
        apiSaveDisplaySettings(display),
      ]);
      setRows(clean.map(s => ({ ...s, id: nextId.current++ })));
      setDisplay(cleanDisplay);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center w-full h-screen"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-96 flex flex-col gap-5 p-8"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="flex items-center gap-1 text-xs transition-colors"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", padding: "4px 6px", borderRadius: "var(--radius)",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--text)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; }}
          >
            <ChevronLeft size={13} strokeWidth={2} />
            <span>Back</span>
          </button>
          <h1
            className="text-base font-semibold tracking-tight mx-auto pr-10"
            style={{ color: "var(--keep)" }}
          >
            Folder Shortcuts
          </h1>
        </div>

        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Assign a letter or number key to a folder. Pressing that key while viewing an image
          moves it there.
        </p>

        {/* Rows */}
        {loading ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "40vh" }}>
            {rows.length === 0 && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>No shortcuts yet.</p>
            )}
            {rows.map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <input
                  value={s.key}
                  onChange={e => updateKey(s.id, e.target.value)}
                  maxLength={1}
                  className="text-center text-sm font-mono font-semibold"
                  style={{
                    width: "32px", height: "32px",
                    background: "var(--bg)",
                    border: "1px solid var(--border-2)",
                    borderRadius: "6px",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void changeFolder(s.id)}
                  title={s.folderPath}
                  className="flex-1 flex items-center gap-1.5 text-xs text-left truncate transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--text)",
                    padding: "6px 8px",
                    cursor: "pointer",
                  }}
                >
                  <FolderOpen size={13} className="flex-shrink-0" style={{ color: "var(--muted)" }} />
                  <span className="truncate">{folderBaseName(s.folderPath)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(s.id)}
                  title="Remove"
                  className="flex items-center justify-center transition-colors"
                  style={{
                    width: "28px", height: "28px",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", borderRadius: "var(--radius)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = "var(--delete)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add row */}
        <button
          type="button"
          onClick={() => void addRow()}
          className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium transition-colors"
          style={{
            background: "var(--surface-2)",
            border: "1px dashed var(--border-2)",
            borderRadius: "var(--radius)",
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          <Plus size={13} />
          <span>Add shortcut folder</span>
        </button>

        {/* Display settings */}
        <div className="flex flex-col gap-3 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold pt-3" style={{ color: "var(--text)" }}>Display</p>

          {/* Truncation */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
              <input
                type="checkbox"
                checked={display.truncateLength === null}
                onChange={e =>
                  setDisplay(d => ({ ...d, truncateLength: e.target.checked ? null : 10 }))
                }
              />
              Don't truncate
            </label>
            <input
              type="number"
              min={1}
              disabled={display.truncateLength === null}
              value={display.truncateLength ?? 10}
              onChange={e =>
                setDisplay(d => ({ ...d, truncateLength: Math.max(1, Number(e.target.value) || 1) }))
              }
              className="text-xs disabled:opacity-40"
              style={{
                width: "56px", padding: "4px 6px",
                background: "var(--bg)", border: "1px solid var(--border-2)",
                borderRadius: "6px", color: "var(--text)",
              }}
            />
            <span className="text-xs" style={{ color: "var(--muted)" }}>characters</span>
          </div>

          {/* Layout */}
          <div className="flex items-center gap-2">
            <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>Show shortcuts:</span>
            <div className="flex gap-1">
              {LAYOUT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDisplay(d => ({ ...d, layout: opt.value }))}
                  className="text-xs transition-colors"
                  style={{
                    padding: "5px 10px",
                    background: display.layout === opt.value ? "var(--keep)" : "var(--surface-2)",
                    color: display.layout === opt.value ? "#04150e" : "var(--muted)",
                    border: "1px solid var(--border-2)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    fontWeight: display.layout === opt.value ? 700 : 500,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs" style={{ color: "var(--delete)" }}>{error}</p>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: "#065f46",
            color: "#d1fae5",
            border: "1px solid #10b981",
            borderRadius: "var(--radius)",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
