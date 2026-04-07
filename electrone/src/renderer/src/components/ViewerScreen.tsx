import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronLeft } from 'lucide-react';

import type { Action, MediaItem, Stats } from '../types';
import { apiAction, apiApplyPending, apiBack, apiCurrent, apiGetMediaPath, apiSkip } from '../api';
import DoneScreen from './DoneScreen';
import DPad from './DPad';

interface Props {
  initialStats: Stats;
  startDone: boolean;
  onChooseAnother: () => void;
}

interface ImageState {
  prev: MediaItem;
  main: MediaItem;
  peek1: MediaItem;
  showPeek1: boolean;
  filename: string;
  index: number;
  total: number;
  done: boolean;
}

const EMPTY: MediaItem = { url: null, isVideo: false };
const EXIT_DIR: Record<Action, string> = { keep: 'right', delete: 'left', later: 'down' };

function loadMedia(item: MediaItem): Promise<void> {
  return new Promise(resolve => {
    if (!item.url || item.isVideo) { resolve(); return; }
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = item.url;
  });
}

async function fetchNextState(): Promise<ImageState> {
  const data = await apiCurrent();
  if (data.done) {
    return { prev: EMPTY, main: EMPTY, peek1: EMPTY, showPeek1: false, filename: '', index: 0, total: data.total ?? 0, done: true };
  }
  const { total, index, filename } = data;
  const remaining = total - (index ?? 0) - 1;
  const mainMedia = await apiGetMediaPath(0);
  const peek1Media = remaining >= 1 ? await apiGetMediaPath(1) : EMPTY;
  await Promise.all([loadMedia(mainMedia), remaining >= 1 ? loadMedia(peek1Media) : Promise.resolve()]);
  return { prev: EMPTY, main: mainMedia, peek1: peek1Media, showPeek1: remaining >= 1, filename: filename ?? '', index: index ?? 0, total, done: false };
}

const labelBase: React.CSSProperties = {
  position: 'absolute', top: '14px',
  fontSize: '0.65rem', fontWeight: 700, padding: '3px 8px',
  borderRadius: '4px', letterSpacing: '1.5px',
  textTransform: 'uppercase', opacity: 0, pointerEvents: 'none',
};

export default function ViewerScreen({ initialStats, startDone, onChooseAnother }: Props) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [imgState, setImgState] = useState<ImageState>({
    prev: EMPTY, main: EMPTY, peek1: EMPTY, showPeek1: false,
    filename: '', index: 0, total: 0, done: startDone,
  });
  const [isMuted, setIsMuted] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const busyRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const labelKeepRef = useRef<HTMLDivElement>(null);
  const labelDeleteRef = useRef<HTMLDivElement>(null);
  const labelLaterRef = useRef<HTMLDivElement>(null);
  const btnKeepRef = useRef<HTMLButtonElement>(null);
  const btnDeleteRef = useRef<HTMLButtonElement>(null);
  const btnLaterRef = useRef<HTMLButtonElement>(null);
  const btnUndoRef = useRef<HTMLButtonElement>(null);
  const btnSkipRef = useRef<HTMLButtonElement>(null);

  const resetLabels = useCallback(() => {
    if (labelKeepRef.current)   labelKeepRef.current.style.opacity   = '0';
    if (labelDeleteRef.current) labelDeleteRef.current.style.opacity = '0';
    if (labelLaterRef.current)  labelLaterRef.current.style.opacity  = '0';
  }, []);

  // Preserve current main as prev when applying new state
  const applyState = useCallback((newState: ImageState) => {
    resetLabels();
    setImgState(cur => ({ ...newState, prev: cur.main }));
  }, [resetLabels]);

  const withTransition = useCallback(async (exitDir: string, fetchFn: () => Promise<ImageState>) => {
    const newState = await fetchFn();
    document.documentElement.dataset.exit = exitDir;
    if (document.startViewTransition) {
      await document.startViewTransition(() => { flushSync(() => applyState(newState)); }).finished;
    } else {
      applyState(newState);
    }
    delete document.documentElement.dataset.exit;
  }, [applyState]);

  useEffect(() => {
    if (startDone) return;
    void fetchNextState().then(state => setImgState(state));
  }, [startDone]);

  // Apply all queued file moves when processing is done
  useEffect(() => {
    if (!imgState.done) return;
    setIsApplying(true);
    void apiApplyPending().finally(() => setIsApplying(false));
  }, [imgState.done]);

  // Wrap onChooseAnother to flush pending moves first
  const handleChooseAnother = useCallback(() => {
    if (busyRef.current) return;
    setIsApplying(true);
    void apiApplyPending().finally(() => {
      setIsApplying(false);
      onChooseAnother();
    });
  }, [onChooseAnother]);

  const flash = useCallback((btn: HTMLButtonElement | null) => {
    if (!btn) return;
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
  }, []);

  const doAction = useCallback((action: Action) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const labelMap = { keep: labelKeepRef, delete: labelDeleteRef, later: labelLaterRef };
    const labelEl = labelMap[action].current;
    if (labelEl) labelEl.style.opacity = '1';
    setStats(prev => ({
      kept:    action === 'keep'   ? prev.kept + 1    : prev.kept,
      deleted: action === 'delete' ? prev.deleted + 1 : prev.deleted,
      later:   action === 'later'  ? prev.later + 1   : prev.later,
    }));
    void (async () => {
      await apiAction(action);
      await withTransition(EXIT_DIR[action], fetchNextState);
      busyRef.current = false;
    })();
  }, [withTransition]);

  const doSkip = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    void (async () => {
      await apiSkip();
      await withTransition('skip', fetchNextState);
      busyRef.current = false;
    })();
  }, [withTransition]);

  const doBack = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    void (async () => {
      const data = await apiBack();
      if (data.undoneAction) {
        setStats(prev => ({
          kept:    data.undoneAction === 'keep'   ? Math.max(0, prev.kept - 1)    : prev.kept,
          deleted: data.undoneAction === 'delete' ? Math.max(0, prev.deleted - 1) : prev.deleted,
          later:   data.undoneAction === 'later'  ? Math.max(0, prev.later - 1)   : prev.later,
        }));
      }
      await withTransition('undo', fetchNextState);
      busyRef.current = false;
    })();
  }, [withTransition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (imgState.done) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight': flash(btnKeepRef.current);   doAction('keep');   break;
        case 'ArrowLeft':  flash(btnDeleteRef.current); doAction('delete'); break;
        case 'ArrowDown':  flash(btnLaterRef.current);  doAction('later');  break;
        case 'ArrowUp':    flash(btnUndoRef.current);   doBack();           break;
        case ' ':          e.preventDefault(); flash(btnSkipRef.current); doSkip(); break;
        case 'Escape':     handleChooseAnother(); break;
        case 'Shift':      setIsMuted(prev => !prev); break;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [doAction, doBack, doSkip, flash, imgState.done, handleChooseAnother]);

  // Drag on main card
  useEffect(() => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    let dragStart: { x: number; y: number } | null = null;

    function onPointerDown(e: PointerEvent) {
      dragStart = { x: e.clientX, y: e.clientY };
      card.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      card.style.transform = `translate(${dx * 0.4}px, ${dy * 0.2}px) rotate(${dx * 0.025}deg)`;
      const t = 60;
      if (labelKeepRef.current)
        labelKeepRef.current.style.opacity = dx > t ? String(Math.min((dx - t) / 60, 1)) : '0';
      if (labelDeleteRef.current)
        labelDeleteRef.current.style.opacity = dx < -t ? String(Math.min((-dx - t) / 60, 1)) : '0';
      if (labelLaterRef.current)
        labelLaterRef.current.style.opacity = dy > t ? String(Math.min((dy - t) / 60, 1)) : '0';
    }
    function onPointerUp(e: PointerEvent) {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragStart = null;
      card.style.transform = '';
      resetLabels();
      if (dx > 100)       doAction('keep');
      else if (dx < -100) doAction('delete');
      else if (dy > 100)  doAction('later');
    }
    card.addEventListener('pointerdown', onPointerDown);
    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    return () => {
      card.removeEventListener('pointerdown', onPointerDown);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
    };
  }, [doAction, resetLabels]);

  const { index, total, filename, done, main, peek1, prev, showPeek1 } = imgState;
  const left = total - index;

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100vh', background: 'var(--bg)' }}>

      {/* Applying overlay */}
      {isApplying && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: 'var(--text)', fontSize: '0.9rem', fontWeight: 500 }}>
            Applying changes…
          </span>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 flex items-center relative px-3" style={{ height: '36px' }}>
        {/* Folder button (Esc) */}
        <button
          type="button"
          onClick={handleChooseAnother}
          title="Back to folder (Esc)"
          className="flex items-center gap-1 text-xs transition-colors"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', padding: '4px 6px',
            borderRadius: 'var(--radius)',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}
        >
          <ChevronLeft size={13} strokeWidth={2} />
          <span>Folder</span>
        </button>

        {/* Filename */}
        <span
          className="absolute left-0 right-0 text-center text-xs truncate pointer-events-none"
          style={{ color: 'var(--text)', opacity: done ? 0 : 0.75, paddingInline: '80px' }}
        >
          {filename}
        </span>

        {/* Count */}
        <span className="ml-auto text-xs tabular-nums font-medium" style={{ color: 'var(--muted)' }}>
          {done ? '' : `${left} left`}
        </span>
      </div>

      {/* Separator */}
      <div style={{ height: '1px', flexShrink: 0, background: 'var(--border)' }} />

      {/* ── Media area ── */}
      {done ? (
        <div className="flex-1 flex items-center justify-center">
          <DoneScreen stats={stats} onChooseAnother={handleChooseAnother} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex gap-1.5 p-1.5">

          {/* Left — prev media */}
          <SidePanel media={prev} side="left" />

          {/* Center — main card (drag target) */}
          <div
            ref={cardRef}
            className="flex-1 min-w-0 relative overflow-hidden"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              userSelect: 'none',
            }}
          >
            {main.url && (main.isVideo ? (
              <video
                key={main.url}
                src={main.url} autoPlay loop muted={isMuted} playsInline draggable={false}
                onError={() => {
                  console.error('Video error:', main.url);
                  // Optionally skip automatically if it's broken
                  // doSkip(); 
                }}
                onCanPlay={() => {
                  // Video is ready, maybe hide a loader if we had one
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', viewTransitionName: 'main-card' }}
              />
            ) : (
              <img
                src={main.url} alt="" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', viewTransitionName: 'main-card' }}
              />
            ))}
            {/* Drag labels */}
            <div ref={labelKeepRef}   style={{ ...labelBase, right: '12px', background: 'rgba(5,25,15,0.9)', border: '1px solid var(--keep)',   color: 'var(--keep)'   }}>Keep</div>
            <div ref={labelDeleteRef} style={{ ...labelBase, left: '12px',  background: 'rgba(25,5,10,0.9)', border: '1px solid var(--delete)', color: 'var(--delete)' }}>Delete</div>
            <div ref={labelLaterRef}  style={{ ...labelBase, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,15,5,0.9)', border: '1px solid var(--later)',  color: 'var(--later)'  }}>Later</div>
          </div>

          {/* Right — next media */}
          {showPeek1 && <SidePanel media={peek1} side="right" />}
          {!showPeek1 && <div style={{ width: '144px', flexShrink: 0 }} />}

        </div>
      )}

      {/* ── Buttons ── */}
      {!done && (
        <div className="flex-shrink-0 flex justify-center py-2.5">
          <DPad
            onKeep={() => { flash(btnKeepRef.current); doAction('keep'); }}
            onDelete={() => { flash(btnDeleteRef.current); doAction('delete'); }}
            onLater={() => { flash(btnLaterRef.current); doAction('later'); }}
            onUndo={() => { flash(btnUndoRef.current); doBack(); }}
            onSkip={() => { flash(btnSkipRef.current); doSkip(); }}
            btnKeepRef={btnKeepRef}
            btnDeleteRef={btnDeleteRef}
            btnLaterRef={btnLaterRef}
            btnUndoRef={btnUndoRef}
            btnSkipRef={btnSkipRef}
            stats={stats}
          />
        </div>
      )}
    </div>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

function SidePanel({ media, side }: { media: MediaItem; side: 'left' | 'right' }) {
  const fadeGradient = side === 'left'
    ? 'linear-gradient(to right, var(--bg) 0%, transparent 45%, var(--bg) 100%)'
    : 'linear-gradient(to left, var(--bg) 0%, transparent 45%, var(--bg) 100%)';

  return (
    <div
      style={{
        width: '144px', flexShrink: 0, position: 'relative', overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
    >
      {media.url && (
        media.isVideo ? (
          <video
            key={media.url}
            src={media.url} autoPlay loop muted playsInline draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.45 }}
          />
        ) : (
          <img
            src={media.url} alt="" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.45 }}
          />
        )
      )}
      {/* Fade vignette */}
      <div style={{ position: 'absolute', inset: 0, background: fadeGradient, pointerEvents: 'none' }} />
    </div>
  );
}
