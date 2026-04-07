import type { CSSProperties, RefObject } from "react";
import { Check, Trash2, Clock, RotateCcw, ChevronsRight } from "lucide-react";
import type { Stats } from "../types";

interface Props {
  onKeep: () => void;
  onDelete: () => void;
  onLater: () => void;
  onUndo: () => void;
  onSkip: () => void;
  btnKeepRef: RefObject<HTMLButtonElement | null>;
  btnDeleteRef: RefObject<HTMLButtonElement | null>;
  btnLaterRef: RefObject<HTMLButtonElement | null>;
  btnUndoRef: RefObject<HTMLButtonElement | null>;
  btnSkipRef: RefObject<HTMLButtonElement | null>;
  stats: Stats;
}

function Badge({ count, color }: { count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span style={{
      position: 'absolute', top: '4px', right: '4px',
      minWidth: '16px', height: '16px',
      background: color, borderRadius: '8px',
      fontSize: '0.6rem', fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 3px', lineHeight: 1,
      color: '#000', pointerEvents: 'none',
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

const base: CSSProperties = {
  border: "none",
  borderRadius: "var(--radius)",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "3px",
  padding: 0,
};

export default function DPad({
  onKeep,
  onDelete,
  onLater,
  onUndo,
  onSkip,
  btnKeepRef,
  btnDeleteRef,
  btnLaterRef,
  btnUndoRef,
  btnSkipRef,
  stats,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateAreas: '". top ." "left mid right" ". bot ."',
        gridTemplateColumns: "60px 60px 60px",
        gridTemplateRows: "60px 60px 60px",
        gap: "3px",
      }}
    >
      {/* Undo */}
      <button
        ref={btnUndoRef}
        type="button"
        onClick={onUndo}
        className="action-btn"
        style={{
          ...base,
          gridArea: "top",
          background: "#1a1a3e",
          border: "1px solid #2d2d6b",
          color: "var(--back)",
        }}
      >
        <RotateCcw size={18} strokeWidth={1.8} />
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          Undo
        </span>
      </button>

      {/* Delete */}
      <button
        ref={btnDeleteRef}
        type="button"
        onClick={onDelete}
        className="action-btn"
        style={{
          ...base,
          gridArea: "left",
          background: "#2a0e14",
          border: "1px solid #4d1520",
          color: "var(--delete)",
          position: "relative",
        }}
      >
        <Badge count={stats.deleted} color="var(--delete)" />
        <Trash2 size={18} strokeWidth={1.8} />
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          Delete
        </span>
      </button>

      {/* Skip */}
      <button
        ref={btnSkipRef}
        type="button"
        onClick={onSkip}
        className="action-btn"
        style={{
          ...base,
          gridArea: "mid",
          background: "var(--surface-2)",
          border: "1px solid var(--border-2)",
          color: "var(--muted)",
        }}
      >
        <ChevronsRight size={15} strokeWidth={1.8} />
        <span style={{ fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", opacity: 0.6 }}>
          Skip
        </span>
      </button>

      {/* Keep */}
      <button
        ref={btnKeepRef}
        type="button"
        onClick={onKeep}
        className="action-btn"
        style={{
          ...base,
          gridArea: "right",
          background: "#062318",
          border: "1px solid #0d3d28",
          color: "var(--keep)",
          position: "relative",
        }}
      >
        <Badge count={stats.kept} color="var(--keep)" />
        <Check size={18} strokeWidth={1.8} />
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          Keep
        </span>
      </button>

      {/* Later */}
      <button
        ref={btnLaterRef}
        type="button"
        onClick={onLater}
        className="action-btn"
        style={{
          ...base,
          gridArea: "bot",
          background: "#2a1a04",
          border: "1px solid #4a2e08",
          color: "var(--later)",
          position: "relative",
        }}
      >
        <Badge count={stats.later} color="var(--later)" />
        <Clock size={18} strokeWidth={1.8} />
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          Later
        </span>
      </button>
    </div>
  );
}
