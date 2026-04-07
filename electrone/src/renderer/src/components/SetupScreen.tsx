import { useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { apiSetFolder, apiOpenFolderDialog } from "../api";
import type { Stats } from "../types";

interface Props {
  onFolderSelected: (folder: string, stats: Stats, startDone: boolean) => void;
}

export default function SetupScreen({ onFolderSelected }: Props) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleBrowse() {
    const path = await apiOpenFolderDialog();
    if (!path) return;

    setLoading(true);
    setError("");
    try {
      const data = await apiSetFolder(path);
      if (data.total === 0 && !data.stats.kept && !data.stats.deleted && !data.stats.later) {
        setError("No images or videos found in that folder.");
        setLoading(false);
        return;
      }
      onFolderSelected(
        path,
        data.stats,
        (data.index ?? 0) >= data.total,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open folder.");
      setLoading(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center w-full h-screen"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-72 flex flex-col gap-6 p-8"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
        }}
      >
        {/* Header */}
        <div className="flex flex-col mx-auto gap-1">
          <h1
            className="text-xl font-semibold text-center tracking-tight"
            style={{ color: "var(--keep)" }}
          >
            Image Chooser
          </h1>
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
            Sort your media, quickly.
          </p>
        </div>

        {/* Browse button */}
        <button
          type="button"
          onClick={() => void handleBrowse()}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: loading ? "var(--surface-2)" : "#065f46",
            color: loading ? "var(--muted)" : "#d1fae5",
            border: "1px solid",
            borderColor: loading ? "var(--border)" : "#10b981",
            borderRadius: "var(--radius)",
            cursor: loading ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = "#047857";
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = "#065f46";
          }}
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Loading…</span>
            </>
          ) : (
            <>
              <FolderOpen size={15} />
              <span>Choose folder</span>
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs" style={{ color: "var(--delete)" }}>
            {error}
          </p>
        )}

        {/* Hints */}
        <div className="grid grid-cols-2 mx-auto gap-1.5">
          {[
            ["←", "Delete"],
            ["→", "Keep"],
            ["↓", "Later"],
            ["↑", "Undo"],
            ["Space", "Skip"],
            ["Shift", "Sound"],
            ["Escape", "Folder choose"],
          ].map(([key, label]) => (
            <div
              key={key}
              className="flex mx-auto last:col-span-2 cursor-default items-center gap-2"
            >
              <kbd
                className="inline-flex items-center justify-center text-xs px-1.5 py-0.5 font-mono"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border-2)",
                  borderRadius: "4px",
                  color: "var(--muted)",
                  minWidth: "22px",
                }}
              >
                {key}
              </kbd>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
