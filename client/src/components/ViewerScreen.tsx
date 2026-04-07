import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { Action, Stats } from '../types';
import { apiAction, apiBack, apiCurrent, apiImageUrl } from '../api';
import CardStack from './CardStack';
import DoneScreen from './DoneScreen';
import DPad from './DPad';
import StatsBar from './StatsBar';

interface Props {
  initialStats: Stats;
  startDone: boolean;
  onChooseAnother: () => void;
}

interface ImageState {
  mainSrc: string;
  peek1Src: string;
  showPeek1: boolean;
  filename: string;
  index: number;
  total: number;
  done: boolean;
}

// Defined outside component so it never changes identity
const EXIT_DIR: Record<Action, string> = { keep: 'right', delete: 'left', later: 'down' };

function loadImg(src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

// Fetch + preload the next state WITHOUT touching React state yet.
// Returns the new ImageState ready to be applied synchronously.
async function fetchNextState(): Promise<ImageState> {
  const data = await apiCurrent();

  if (data.done) {
    return { mainSrc: '', peek1Src: '', showPeek1: false, filename: '', index: 0, total: data.total ?? 0, done: true };
  }

  const { total, index, filename } = data;
  const cacheBust = Date.now();
  const remaining = total - (index ?? 0) - 1;
  const mainSrc = apiImageUrl(0, cacheBust);
  const peek1Src = remaining >= 1 ? apiImageUrl(1, cacheBust) : '';
  const showPeek1 = remaining >= 1;

  const jobs: Promise<void>[] = [loadImg(mainSrc)];
  if (showPeek1) jobs.push(loadImg(peek1Src));
  await Promise.all(jobs);

  return { mainSrc, peek1Src, showPeek1, filename: filename ?? '', index: index ?? 0, total, done: false };
}

export default function ViewerScreen({ initialStats, startDone, onChooseAnother }: Props) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [imgState, setImgState] = useState<ImageState>({
    mainSrc: '',
    peek1Src: '',
    showPeek1: false,
    filename: '',
    index: 0,
    total: 0,
    done: startDone,
  });

  const busyRef = useRef(false);

  // Refs for direct DOM manipulation (drag labels, card transform)
  const cardRef = useRef<HTMLDivElement>(null);
  const labelKeepRef = useRef<HTMLDivElement>(null);
  const labelDeleteRef = useRef<HTMLDivElement>(null);
  const labelLaterRef = useRef<HTMLDivElement>(null);

  // D-pad button refs (for flash animation on keypress)
  const btnKeepRef = useRef<HTMLButtonElement>(null);
  const btnDeleteRef = useRef<HTMLButtonElement>(null);
  const btnLaterRef = useRef<HTMLButtonElement>(null);
  const btnUndoRef = useRef<HTMLButtonElement>(null);

  // Reset all drag-label opacities to 0
  const resetLabels = useCallback(() => {
    if (labelKeepRef.current)   labelKeepRef.current.style.opacity   = '0';
    if (labelDeleteRef.current) labelDeleteRef.current.style.opacity = '0';
    if (labelLaterRef.current)  labelLaterRef.current.style.opacity  = '0';
  }, []);

  // Apply state synchronously — must be called inside flushSync for view transitions
  const applyState = useCallback((state: ImageState) => {
    resetLabels();
    setImgState(state);
  }, [resetLabels]);

  // Run a view transition: fetch + preload BEFORE starting, then flushSync inside callback
  const withTransition = useCallback(async (exitDir: string, fetchFn: () => Promise<ImageState>) => {
    const newState = await fetchFn(); // all async work done BEFORE transition starts

    document.documentElement.dataset.exit = exitDir;
    if (document.startViewTransition) {
      await document.startViewTransition(() => {
        flushSync(() => applyState(newState)); // synchronous DOM update — browser sees new state
      }).finished;
    } else {
      applyState(newState);
    }
    delete document.documentElement.dataset.exit;
  }, [applyState]);

  // ── Initial load ──────────────────────────────────────────
  useEffect(() => {
    if (startDone) return;
    void fetchNextState().then(state => setImgState(state));
  }, [startDone]);

  // ── Flash helper ──────────────────────────────────────────
  const flash = useCallback((btn: HTMLButtonElement | null) => {
    if (!btn) return;
    btn.classList.remove('flash');
    void btn.offsetWidth; // reflow to restart animation
    btn.classList.add('flash');
  }, []);

  // ── Action handlers ───────────────────────────────────────
  const doAction = useCallback((action: Action) => {
    if (busyRef.current) return;
    busyRef.current = true;

    // Show label immediately — this IS the old-state screenshot for the transition
    const labelMap = { keep: labelKeepRef, delete: labelDeleteRef, later: labelLaterRef };
    const labelEl = labelMap[action].current;
    if (labelEl) labelEl.style.opacity = '1';

    setStats(prev => ({
      ...prev,
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

  const doBack = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;

    void (async () => {
      const data = await apiBack();

      if (data.undoneAction) {
        setStats(prev => ({
          ...prev,
          kept:    data.undoneAction === 'keep'   ? Math.max(0, prev.kept - 1)    : prev.kept,
          deleted: data.undoneAction === 'delete' ? Math.max(0, prev.deleted - 1) : prev.deleted,
          later:   data.undoneAction === 'later'  ? Math.max(0, prev.later - 1)   : prev.later,
        }));
      }

      await withTransition('undo', fetchNextState);
      busyRef.current = false;
    })();
  }, [withTransition]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (imgState.done) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight': flash(btnKeepRef.current);   doAction('keep');   break;
        case 'ArrowLeft':  flash(btnDeleteRef.current); doAction('delete'); break;
        case 'ArrowDown':  flash(btnLaterRef.current);  doAction('later');  break;
        case 'ArrowUp':    flash(btnUndoRef.current);   doBack();           break;
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [doAction, doBack, flash, imgState.done]);

  // ── Drag / swipe ─────────────────────────────────────────
  useEffect(() => {
    if (!cardRef.current) return;
    // Capture into a non-nullable local so inner functions can close over it safely
    const card: HTMLDivElement = cardRef.current;

    let dragStart: { x: number; y: number } | null = null;

    function onPointerDown(e: PointerEvent) {
      dragStart = { x: e.clientX, y: e.clientY };
      card.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      card.style.transform = `translate(${dx * 0.4}px, ${dy * 0.2}px) rotate(${dx * 0.03}deg)`;

      const threshold = 60;
      if (labelKeepRef.current)
        labelKeepRef.current.style.opacity = dx > threshold ? String(Math.min((dx - threshold) / 60, 1)) : '0';
      if (labelDeleteRef.current)
        labelDeleteRef.current.style.opacity = dx < -threshold ? String(Math.min((-dx - threshold) / 60, 1)) : '0';
      if (labelLaterRef.current)
        labelLaterRef.current.style.opacity = dy > threshold ? String(Math.min((dy - threshold) / 60, 1)) : '0';
    }

    function onPointerUp(e: PointerEvent) {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragStart = null;
      card.style.transform = '';

      if (labelKeepRef.current)   labelKeepRef.current.style.opacity = '0';
      if (labelDeleteRef.current) labelDeleteRef.current.style.opacity = '0';
      if (labelLaterRef.current)  labelLaterRef.current.style.opacity = '0';

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
  }, [doAction]);

  const { index, total, filename, done, mainSrc, peek1Src, showPeek1 } = imgState;
  const left = total - index;
  const progress = total > 0 ? (index / total) * 100 : 0;

  return (
    <div
      className="flex flex-col items-center w-full h-screen overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 w-full"
        style={{ maxWidth: '700px' }}
      >
        <button
          type="button"
          onClick={onChooseAnother}
          className="rounded-lg px-3 py-1.5 text-[0.82rem] whitespace-nowrap"
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = '#555'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          ← Folder
        </button>

        {/* Progress bar */}
        <div
          className="flex-1 rounded h-1.5 overflow-hidden"
          style={{ background: 'var(--border)' }}
        >
          <div
            className="h-full"
            style={{
              width: done ? '100%' : `${progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #c084fc)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <span className="text-[0.85rem] font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>
          {done ? '0 left' : `${left} left`}
        </span>
      </header>

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Card area */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center w-full overflow-hidden"
        style={{ padding: '8px 20px' }}
      >
        {done ? (
          <DoneScreen stats={stats} onChooseAnother={onChooseAnother} />
        ) : (
          <CardStack
            ref={cardRef}
            mainSrc={mainSrc}
            peek1Src={peek1Src}
            showPeek1={showPeek1}
            labelKeepRef={labelKeepRef}
            labelDeleteRef={labelDeleteRef}
            labelLaterRef={labelLaterRef}
          />
        )}
      </div>

      {/* Filename bar */}
      {!done && (
        <div
          className="flex-shrink-0 text-[0.78rem] py-1 text-center overflow-hidden text-ellipsis whitespace-nowrap w-[90%]"
          style={{ color: 'var(--muted)', maxWidth: '600px' }}
        >
          {filename}
        </div>
      )}

      {/* D-pad */}
      {!done && (
        <div className="flex-shrink-0 flex items-center justify-center px-5 pb-[18px] pt-2.5">
          <DPad
            onKeep={() => { flash(btnKeepRef.current); doAction('keep'); }}
            onDelete={() => { flash(btnDeleteRef.current); doAction('delete'); }}
            onLater={() => { flash(btnLaterRef.current); doAction('later'); }}
            onUndo={() => { flash(btnUndoRef.current); doBack(); }}
            btnKeepRef={btnKeepRef}
            btnDeleteRef={btnDeleteRef}
            btnLaterRef={btnLaterRef}
            btnUndoRef={btnUndoRef}
          />
        </div>
      )}
    </div>
  );
}
