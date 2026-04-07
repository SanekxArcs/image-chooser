import type { CSSProperties, RefObject } from 'react';

interface Props {
  onKeep: () => void;
  onDelete: () => void;
  onLater: () => void;
  onUndo: () => void;
  btnKeepRef: RefObject<HTMLButtonElement | null>;
  btnDeleteRef: RefObject<HTMLButtonElement | null>;
  btnLaterRef: RefObject<HTMLButtonElement | null>;
  btnUndoRef: RefObject<HTMLButtonElement | null>;
}

const btnBase: CSSProperties = {
  border: 'none',
  borderRadius: '14px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '1px',
  padding: 0,
  position: 'relative',
};

const undoStyle: CSSProperties = {
  ...btnBase,
  gridArea: 'top',
  background: '#16163a',
  color: 'var(--back)',
  boxShadow: '0 4px 18px rgba(99,102,241,0.25)',
};

const deleteStyle: CSSProperties = {
  ...btnBase,
  gridArea: 'left',
  background: '#2d1515',
  color: 'var(--delete)',
  boxShadow: '0 4px 18px rgba(239,68,68,0.25)',
};

const keepStyle: CSSProperties = {
  ...btnBase,
  gridArea: 'right',
  background: '#0d2b1a',
  color: 'var(--keep)',
  boxShadow: '0 4px 18px rgba(34,197,94,0.25)',
};

const laterStyle: CSSProperties = {
  ...btnBase,
  gridArea: 'bot',
  background: '#2b200a',
  color: 'var(--later)',
  boxShadow: '0 4px 18px rgba(245,158,11,0.25)',
};

export default function DPad({
  onKeep, onDelete, onLater, onUndo,
  btnKeepRef, btnDeleteRef, btnLaterRef, btnUndoRef,
}: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateAreas: '". top ." "left mid right" ". bot ."',
        gridTemplateColumns: '80px 64px 80px',
        gridTemplateRows: '80px 64px 80px',
        gap: '4px',
      }}
    >
      {/* Top: Undo */}
      <button
        ref={btnUndoRef}
        type="button"
        onClick={onUndo}
        style={undoStyle}
        className="action-btn"
      >
        <span style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1 }}>↑</span>
        <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>↺</span>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.8 }}>Undo</span>
      </button>

      {/* Left: Delete */}
      <button
        ref={btnDeleteRef}
        type="button"
        onClick={onDelete}
        style={deleteStyle}
        className="action-btn"
      >
        <span style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1 }}>←</span>
        <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>🗑</span>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.8 }}>Delete</span>
      </button>

      {/* Center: decorative nub */}
      <div
        style={{
          gridArea: 'mid',
          background: '#1e1e2e',
          border: '1px solid var(--border)',
          borderRadius: '8px',
        }}
      />

      {/* Right: Keep */}
      <button
        ref={btnKeepRef}
        type="button"
        onClick={onKeep}
        style={keepStyle}
        className="action-btn"
      >
        <span style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1 }}>→</span>
        <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>✓</span>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.8 }}>Keep</span>
      </button>

      {/* Bottom: Later */}
      <button
        ref={btnLaterRef}
        type="button"
        onClick={onLater}
        style={laterStyle}
        className="action-btn"
      >
        <span style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1 }}>↓</span>
        <span style={{ fontSize: '1.35rem', lineHeight: 1 }}>🕐</span>
        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', opacity: 0.8 }}>Later</span>
      </button>
    </div>
  );
}
