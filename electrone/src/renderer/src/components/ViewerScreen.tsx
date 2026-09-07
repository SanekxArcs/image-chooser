import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronLeft } from 'lucide-react';

import type { Action, DisplaySettings, MediaItem, ShortcutFolder, Stats } from '../types';
import {
  apiAction,
  apiActionShortcut,
  apiApplyPending,
  apiBack,
  apiCurrent,
  apiGetDisplaySettings,
  apiGetMediaPath,
  apiGetShortcuts,
  apiSession,
  apiSkip,
} from '../api';
import { folderBaseName, truncateName } from '../utils';
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
  const [applyError, setApplyError] = useState('');
  const [actionError, setActionError] = useState('');
  const [shortcuts, setShortcuts] = useState<ShortcutFolder[]>([]);
  const [display, setDisplay] = useState<DisplaySettings>({ truncateLength: 10, layout: 'bottom' });

  const busyRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const labelKeepRef = useRef<HTMLDivElement>(null);
  const labelDeleteRef = useRef<HTMLDivElement>(null);
  const labelLaterRef = useRef<HTMLDivElement>(null);
  const labelShortcutRef = useRef<HTMLDivElement>(null);
  const btnKeepRef = useRef<HTMLButtonElement>(null);
  const btnDeleteRef = useRef<HTMLButtonElement>(null);
  const btnLaterRef = useRef<HTMLButtonElement>(null);
  const btnUndoRef = useRef<HTMLButtonElement>(null);
  const btnSkipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void apiGetShortcuts().then(setShortcuts);
    void apiGetDisplaySettings().then(setDisplay);
  }, []);

  const resetLabels = useCallback(() => {
    if (labelKeepRef.current)   labelKeepRef.current.style.opacity   = '0';
    if (labelDeleteRef.current) labelDeleteRef.current.style.opacity = '0';
    if (labelLaterRef.current)  labelLaterRef.current.style.opacity  = '0';
    if (labelShortcutRef.current) labelShortcutRef.current.style.opacity = '0';
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
    void fetchNextState()
      .then(state => setImgState(state))
      .catch(() => setActionError('Could not load the current media item. Try choosing the folder again.'));
  }, [startDone]);

  // Apply all queued file moves when processing is done
  useEffect(() => {
    if (!imgState.done) return;
    setIsApplying(true);
    void apiApplyPending()
      .then(result => {
        if (!result.applied) {
          setApplyError(`Some files could not be moved. ${result.failures[0]?.error ?? 'Review the folder and try again.'}`);
        }
      })
      .catch(() => setApplyError('Could not apply file changes. Review the folder and try again.'))
      .finally(() => setIsApplying(false));
  }, [imgState.done]);

  // Wrap onChooseAnother to flush pending moves first
  const handleChooseAnother = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsApplying(true);
    setApplyError('');
    void apiApplyPending()
      .then(result => {
        if (result.applied) {
          onChooseAnother();
        } else {
          setApplyError(`Some files could not be moved. ${result.failures[0]?.error ?? 'Review the folder and try again.'}`);
        }
      })
      .catch(() => setApplyError('Could not apply file changes. Review the folder and try again.'))
      .finally(() => {
        setIsApplying(false);
        busyRef.current = false;
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
    setActionError('');
    const labelMap = { keep: labelKeepRef, delete: labelDeleteRef, later: labelLaterRef };
    const labelEl = labelMap[action].current;
    if (labelEl) labelEl.style.opacity = '1';
    void (async () => {
      try {
        await apiAction(action);
        setStats(prev => ({
          kept:    action === 'keep'   ? prev.kept + 1    : prev.kept,
          deleted: action === 'delete' ? prev.deleted + 1 : prev.deleted,
          later:   action === 'later'  ? prev.later + 1   : prev.later,
        }));
        await withTransition(EXIT_DIR[action], fetchNextState);
      } catch {
        resetLabels();
        setActionError('Could not move this file. Check that the destination is available and try again.');
        void apiSession().then(sess => {
          if (sess.active && sess.stats) setStats(sess.stats);
        }).catch(() => {});
      } finally {
        busyRef.current = false;
      }
    })();
  }, [resetLabels, withTransition]);

  const doShortcutAction = useCallback((key: string, folderPath: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActionError('');
    const labelEl = labelShortcutRef.current;
    if (labelEl) {
      const name = folderPath.split(/[/\\]/).filter(Boolean).pop() ?? folderPath;
      labelEl.textContent = `→ ${name}`;
      labelEl.style.opacity = '1';
    }
    void (async () => {
      try {
        await apiActionShortcut(key);
        await withTransition('skip', fetchNextState);
      } catch {
        resetLabels();
        setActionError('Could not move this file to the shortcut folder. Check the folder and try again.');
        void apiSession().then(sess => {
          if (sess.active && sess.stats) setStats(sess.stats);
        }).catch(() => {});
      } finally {
        busyRef.current = false;
      }
    })();
  }, [resetLabels, withTransition]);

  const doSkip = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActionError('');
    void (async () => {
      try {
        await apiSkip();
        await withTransition('skip', fetchNextState);
      } catch {
        setActionError('Could not skip this file. Try again.');
      } finally {
        busyRef.current = false;
      }
    })();
  }, [withTransition]);

  const doBack = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setActionError('');
    void (async () => {
      try {
        const data = await apiBack();
        if (data.undoneAction) {
          setStats(prev => ({
            kept:    data.undoneAction === 'keep'   ? Math.max(0, prev.kept - 1)    : prev.kept,
            deleted: data.undoneAction === 'delete' ? Math.max(0, prev.deleted - 1) : prev.deleted,
            later:   data.undoneAction === 'later'  ? Math.max(0, prev.later - 1)   : prev.later,
          }));
        }
        await withTransition('undo', fetchNextState);
      } catch {
        setActionError('Could not undo the last action. Try again.');
        void apiSession().then(sess => {
          if (sess.active && sess.stats) setStats(sess.stats);
        }).catch(() => {});
      } finally {
        busyRef.current = false;
      }
    })();
  }, [withTransition]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (imgState.done) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight': flash(btnKeepRef.current);   doAction('keep');   return;
        case 'ArrowLeft':  flash(btnDeleteRef.current); doAction('delete'); return;
        case 'ArrowDown':  flash(btnLaterRef.current);  doAction('later');  return;
        case 'ArrowUp':    flash(btnUndoRef.current);   doBack();           return;
        case ' ':          e.preventDefault(); flash(btnSkipRef.current); doSkip(); return;
        case 'Escape':     handleChooseAnother(); return;
        case 'Shift':      setIsMuted(prev => !prev); return;
      }
      const match = shortcuts.find(s => s.key === e.key.toLowerCase());
      if (match) doShortcutAction(match.key, match.folderPath);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [doAction, doBack, doSkip, doShortcutAction, flash, imgState.done, handleChooseAnother, shortcuts]);

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

          {display.layout === 'left' && <ShortcutRail shortcuts={shortcuts} display={display} />}

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
            <div ref={labelShortcutRef} style={{ ...labelBase, top: 'auto', bottom: '14px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,10,20,0.9)', border: '1px solid var(--muted)', color: 'var(--text)' }} />
          </div>

          {/* Right — next media */}
          {showPeek1 && <SidePanel media={peek1} side="right" />}
          {!showPeek1 && <div style={{ width: '144px', flexShrink: 0 }} />}

          {display.layout === 'right' && <ShortcutRail shortcuts={shortcuts} display={display} />}

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

      {/* ── Shortcut legend (bottom layout) ── */}
      {!done && display.layout === 'bottom' && (
        <ShortcutBar shortcuts={shortcuts} display={display} />
      )}

      {(applyError || actionError) && (
        <p
          role="alert"
          className="flex-shrink-0 px-3 pb-2 text-center text-xs"
          style={{ color: 'var(--delete)' }}
        >
          {actionError || applyError}
        </p>
      )}
    </div>
  );
}

// ── Shortcut legend ───────────────────────────────────────────────────────────

const kbdStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700,
  padding: '1px 5px', minWidth: '16px',
  background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: '4px',
  color: 'var(--text)', textTransform: 'uppercase',
};

function ShortcutBar({ shortcuts, display }: { shortcuts: ShortcutFolder[]; display: DisplaySettings }) {
  if (shortcuts.length === 0) return null;
  return (
    <div className="flex-shrink-0 flex flex-wrap justify-center gap-2 px-3 pb-2.5">
      {shortcuts.map(s => {
        const name = folderBaseName(s.folderPath);
        return (
          <div
            key={s.key}
            title={name}
            className="flex items-center gap-1.5 text-xs"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '4px 8px', color: 'var(--muted)',
            }}
          >
            <kbd style={kbdStyle}>{s.key}</kbd>
            <span>{truncateName(name, display.truncateLength)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShortcutRail({ shortcuts, display }: { shortcuts: ShortcutFolder[]; display: DisplaySettings }) {
  if (shortcuts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ width: '84px', flexShrink: 0 }}>
      {shortcuts.map(s => {
        const name = folderBaseName(s.folderPath);
        return (
          <div
            key={s.key}
            title={name}
            className="flex flex-col items-center gap-1 text-center"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '6px 4px', flexShrink: 0,
            }}
          >
            <kbd style={kbdStyle}>{s.key}</kbd>
            <span className="truncate w-full" style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>
              {truncateName(name, display.truncateLength)}
            </span>
          </div>
        );
      })}
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
