import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChevronLeft, GalleryHorizontal, GalleryVertical, Loader2, PanelRight } from 'lucide-react';

import {
  apiAction,
  apiActionShortcut,
  apiApplyPending,
  apiBack,
  apiGetDisplaySettings,
  apiGetShortcuts,
  apiQueue,
  apiSkip,
} from '../api';
import { EXIT_DIR, decisionKind } from '../decisions';
import type { DecisionKind, ExitDir } from '../decisions';
import { useMediaQuery, useStoredState } from '../hooks';
import { bitmapCache } from '../media/bitmapCache';
import { thumbCache } from '../media/thumbCache';
import type { Action, DisplaySettings, QueueItem, QueueResponse, ShortcutFolder, Stats } from '../types';
import { folderBaseName, formatCount } from '../utils';
import Dock from './Dock';
import type { DockButton, DockHandle } from './Dock';
import DoneScreen from './DoneScreen';
import Filmstrip from './Filmstrip';
import Inspector from './Inspector';
import { Busy, Toast } from './Overlays';
import Stage from './Stage';
import type { StageCard } from './Stage';
import TitleBar from './TitleBar';

interface Props {
  /** Bumped when settings close so shortcuts and display options reload. */
  settingsVersion: number;
  blocked: boolean;
  onChooseAnother: () => void;
  onOpenSettings: () => void;
}

// ── Optimistic queue state ────────────────────────────────────────────────────
// The renderer moves through the queue immediately and tells the main process
// afterwards, so a decision never waits on disk or IPC before animating.

interface Exiting {
  item: QueueItem;
  order: number;
  dir: ExitDir;
  decided: DecisionKind;
  shortcutLabel?: string;
}

interface ViewState {
  status: 'loading' | 'ready';
  folder: string;
  items: QueueItem[];
  index: number;
  decisions: ReadonlyMap<string, string>;
  history: Array<{ name: string; decision: string }>;
  exiting: Exiting[];
  enterFrom?: ExitDir;
}

type ViewAction =
  | { type: 'load'; queue: QueueResponse }
  | { type: 'advance'; decision: string; shortcutLabel?: string }
  | { type: 'undo' }
  | { type: 'exited'; name: string };

const MAX_EXITING = 6;

function reducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case 'load': {
      const { queue } = action;
      const decisions = new Map<string, string>();
      for (const item of queue.items) if (item.decision) decisions.set(item.name, item.decision);
      return {
        status: 'ready',
        folder: queue.folder,
        items: queue.items.map(({ name, isVideo }) => ({ name, isVideo })),
        index: queue.index,
        decisions,
        history: queue.history,
        exiting: [],
      };
    }
    case 'advance': {
      const item = state.items[state.index];
      if (!item) return state;
      const kind = decisionKind(action.decision);
      const decisions = new Map(state.decisions);
      if (kind === 'skip') decisions.delete(item.name);
      else decisions.set(item.name, action.decision);
      const exiting = [
        ...state.exiting.filter(e => e.item.name !== item.name),
        { item, order: state.index, dir: EXIT_DIR[kind], decided: kind, shortcutLabel: action.shortcutLabel },
      ].slice(-MAX_EXITING);
      return {
        ...state,
        index: state.index + 1,
        decisions,
        history: [...state.history, { name: item.name, decision: action.decision }],
        exiting,
        enterFrom: undefined,
      };
    }
    case 'undo': {
      const last = state.history[state.history.length - 1];
      if (!last || state.index === 0) return state;
      const decisions = new Map(state.decisions);
      decisions.delete(last.name);
      return {
        ...state,
        index: state.index - 1,
        decisions,
        history: state.history.slice(0, -1),
        exiting: state.exiting.filter(e => e.item.name !== last.name),
        enterFrom: EXIT_DIR[decisionKind(last.decision)],
      };
    }
    case 'exited':
      return { ...state, exiting: state.exiting.filter(e => e.item.name !== action.name) };
  }
}

const INITIAL: ViewState = {
  status: 'loading', folder: '', items: [], index: 0, decisions: new Map(), history: [], exiting: [],
};

// IPC calls run strictly in order. The chain outlives the component so a
// remount (or leaving the viewer) always waits for decisions still in flight.
let opChain: Promise<void> = Promise.resolve();
let generation = 0;

function enqueue(op: () => Promise<unknown>, onError: (error: unknown) => void): void {
  const gen = generation;
  opChain = opChain.then(async () => {
    if (gen !== generation) return; // superseded by a resync
    try {
      await op();
    } catch (error) {
      generation++;
      onError(error);
    }
  });
}

function settle(): Promise<void> {
  return opChain;
}

const DEFAULT_DISPLAY: DisplaySettings = { truncateLength: 14, layout: 'bottom' };

export default function ViewerScreen({ settingsVersion, blocked, onChooseAnother, onOpenSettings }: Props) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // A synchronous mirror of the reducer state, so two key presses that land
  // before React re-renders still each act on the right file.
  const live = useRef(INITIAL);
  const act = useCallback((action: ViewAction) => {
    live.current = reducer(live.current, action);
    dispatch(action);
  }, []);
  const [shortcuts, setShortcuts] = useState<ShortcutFolder[]>([]);
  const [display, setDisplay] = useState<DisplaySettings>(DEFAULT_DISPLAY);
  const [muted, setMuted] = useState(true);
  const [zoomAt, setZoomAt] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ error: string; remaining: number } | null>(null);
  const syncing = useRef(false);
  const dockRef = useRef<DockHandle>(null);

  const ultra = useMediaQuery('(min-aspect-ratio: 2/1) and (min-width: 1600px)');
  const wide = useMediaQuery('(min-width: 1180px)');
  const compact = useMediaQuery('(max-width: 720px), (max-height: 600px)');
  const [inspectorPref, setInspectorPref] = useStoredState<'open' | 'closed' | null>('ic.inspector', null);
  const [stripPref, setStripPref] = useStoredState<boolean>('ic.filmstrip', true);

  const { items, index, decisions, history, status } = state;
  const total = items.length;
  const current = items[index] ?? null;
  const done = status === 'ready' && index >= total;

  const resync = useCallback(() => {
    syncing.current = true;
    opChain = opChain.then(async () => {
      try {
        act({ type: 'load', queue: await apiQueue() });
      } catch { /* keep the optimistic view; the next action will retry */ }
      syncing.current = false;
    });
  }, [act]);

  const fail = useCallback((message: string) => () => {
    setToast(message);
    resync();
  }, [resync]);

  // Initial load waits for any decisions still in flight from a previous mount.
  useEffect(() => {
    let alive = true;
    void settle().then(apiQueue).then(queue => {
      if (alive) act({ type: 'load', queue });
    }).catch(() => {
      if (alive) setToast('Could not load this folder. Try choosing it again.');
    });
    return () => {
      alive = false;
      bitmapCache.clear();
      thumbCache.clear();
    };
  }, [act]);

  useEffect(() => {
    void apiGetShortcuts().then(setShortcuts).catch(() => {});
    void apiGetDisplaySettings().then(setDisplay).catch(() => {});
  }, [settingsVersion]);

  // Keep the photos around the current one decoded, nearest first.
  useEffect(() => {
    if (status !== 'ready') return;
    const order = [0, 1, -1, 2, 3, -2, 4];
    const names: string[] = [];
    for (const offset of order) {
      const item = items[index + offset];
      if (item && !item.isVideo) names.push(item.name);
    }
    bitmapCache.setWanted(names);
  }, [items, index, status]);

  const stats = useMemo<Stats>(() => {
    const s = { kept: 0, deleted: 0, later: 0 };
    for (const d of decisions.values()) {
      if (d === 'keep') s.kept++;
      else if (d === 'delete') s.deleted++;
      else if (d === 'later') s.later++;
    }
    return s;
  }, [decisions]);

  const shortcutCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of decisions.values()) {
      if (d.startsWith('shortcut:')) {
        const key = d.slice('shortcut:'.length);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [decisions]);

  const skipped = useMemo(
    () => history.reduce((n, h) => (h.decision === 'skip' ? n + 1 : n), 0),
    [history],
  );

  // ── Decisions ──

  /** The item a new decision applies to, or null while loading or resyncing. */
  const actionable = useCallback((): QueueItem | null => {
    const s = live.current;
    if (syncing.current || s.status !== 'ready') return null;
    return s.items[s.index] ?? null;
  }, []);

  const decide = useCallback((action: Action) => {
    const item = actionable();
    if (!item) return;
    setZoomAt(null);
    act({ type: 'advance', decision: action });
    enqueue(() => apiAction(action, item.name), fail('Could not record that decision. The view was refreshed.'));
  }, [act, actionable, fail]);

  const decideShortcut = useCallback((shortcut: ShortcutFolder) => {
    const item = actionable();
    if (!item) return;
    setZoomAt(null);
    act({ type: 'advance', decision: `shortcut:${shortcut.key}`, shortcutLabel: folderBaseName(shortcut.folderPath) });
    enqueue(() => apiActionShortcut(shortcut.key, item.name), fail('Could not move that file to the shortcut folder.'));
  }, [act, actionable, fail]);

  const skip = useCallback(() => {
    const item = actionable();
    if (!item) return;
    setZoomAt(null);
    act({ type: 'advance', decision: 'skip' });
    enqueue(() => apiSkip(item.name), fail('Could not skip this file.'));
  }, [act, actionable, fail]);

  const undo = useCallback(() => {
    const s = live.current;
    const last = s.history[s.history.length - 1];
    if (syncing.current || s.status !== 'ready' || !last || s.index === 0) return;
    setZoomAt(null);
    act({ type: 'undo' });
    enqueue(() => apiBack(last.name), fail('Could not undo. The view was refreshed.'));
  }, [act, fail]);

  const press = useCallback((button: DockButton) => {
    dockRef.current?.flash(button);
    if (button === 'undo') undo();
    else if (button === 'skip') skip();
    else decide(button);
  }, [decide, skip, undo]);

  const onExited = useCallback((name: string) => act({ type: 'exited', name }), [act]);
  const toggleMute = useCallback(() => setMuted(m => !m), []);

  // ── Leaving / finishing ──

  const leave = useCallback(() => {
    setBusy('Applying changes…');
    void settle()
      .then(apiApplyPending)
      .then(result => {
        if (result.applied) {
          onChooseAnother();
        } else {
          setBusy(null);
          setToast(`Some files could not be moved. ${result.failures[0]?.error ?? ''}`.trim());
          resync();
        }
      })
      .catch(() => {
        setBusy(null);
        setToast('Could not apply file changes. Review the folder and try again.');
      });
  }, [onChooseAnother, resync]);

  // Apply queued moves once everything has been reviewed.
  useEffect(() => {
    if (!done) return;
    let alive = true;
    setApplyResult(null);
    setBusy('Applying changes…');
    void settle()
      .then(apiApplyPending)
      .then(async result => {
        const queue = await apiQueue().catch(() => null);
        if (!alive) return;
        setApplyResult({
          error: result.applied ? '' : `Some files could not be moved. ${result.failures[0]?.error ?? ''}`.trim(),
          remaining: queue?.items.length ?? 0,
        });
      })
      .catch(() => {
        if (alive) setApplyResult({ error: 'Could not apply file changes. Review the folder and try again.', remaining: 0 });
      })
      .finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; };
  }, [done]);

  const reviewRemaining = useCallback(() => {
    void apiQueue().then(queue => {
      setApplyResult(null);
      act({ type: 'load', queue });
    }).catch(() => setToast('Could not reload the folder.'));
  }, [act]);

  // ── Keyboard ──

  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (blocked || busy) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'i') { e.preventDefault(); toggleInspector(); }
      else if (key === 'b') { e.preventDefault(); setStripPref(!stripPref); }
      return;
    }
    if (e.altKey) return;

    if (zoomAt && (e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      setZoomAt(null);
      return;
    }
    if (e.key === 'Escape') { leave(); return; }
    if (done || e.repeat) return;

    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); press('keep'); return;
      case 'ArrowLeft': e.preventDefault(); press('delete'); return;
      case 'ArrowDown': e.preventDefault(); press('later'); return;
      case 'ArrowUp': e.preventDefault(); press('undo'); return;
      case ' ': e.preventDefault(); press('skip'); return;
      case 'Shift': toggleMute(); return;
      case 'Enter':
        if (current && !current.isVideo) {
          e.preventDefault();
          setZoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
        return;
    }
    const match = shortcuts.find(s => s.key === e.key.toLowerCase());
    if (match) decideShortcut(match);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Layout ──

  const inspectorVisible = inspectorPref === 'open' || (inspectorPref === null && wide);
  const inspectorMode = !inspectorVisible ? 'hidden' : wide ? 'docked' : 'overlay';
  function toggleInspector() {
    setInspectorPref(inspectorVisible ? 'closed' : 'open');
  }
  const stripMode = !stripPref || compact ? 'none' : ultra ? 'vertical' : 'horizontal';

  const columns = [stripMode === 'vertical' && 'queue', 'main', inspectorMode === 'docked' && 'inspector']
    .filter(Boolean) as string[];
  const rows = ['stage', 'dock', stripMode === 'horizontal' && 'strip'].filter(Boolean) as string[];
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: columns
      .map(c => (c === 'queue' ? 'clamp(180px, 11vw, 280px)' : c === 'main' ? 'minmax(0, 1fr)' : 'auto'))
      .join(' '),
    gridTemplateRows: rows.map(r => (r === 'stage' ? 'minmax(0, 1fr)' : 'auto')).join(' '),
    gridTemplateAreas: rows.map(r => `"${columns.map(c => (c === 'main' ? r : c)).join(' ')}"`).join(' '),
  };

  // Folder shortcuts live in the inspector when it is docked and the user chose a side panel.
  const shortcutsInPanel = display.layout !== 'bottom' && inspectorMode !== 'hidden';

  const cards = useMemo<StageCard[]>(() => {
    const list: StageCard[] = [];
    const next = items[index + 1];
    if (next) list.push({ item: next, role: 'next', order: index + 1 });
    if (current) list.push({ item: current, role: 'current', order: index, enterFrom: state.enterFrom });
    for (const e of state.exiting) {
      if (e.item.name === current?.name || e.item.name === next?.name) continue;
      list.push({ item: e.item, role: 'exit', order: e.order, dir: e.dir, decided: e.decided, shortcutLabel: e.shortcutLabel });
    }
    return list.sort((a, b) => b.order - a.order);
  }, [items, index, current, state.exiting, state.enterFrom]);

  const folderName = folderBaseName(state.folder);

  return (
    <>
      <TitleBar
        onOpenSettings={onOpenSettings}
        progress={total ? index / total : 0}
        left={(
          <button type="button" className="ghost-btn" onClick={leave} title="Choose another folder (Esc)">
            <ChevronLeft size={16} strokeWidth={2} />
            <span>{folderName || 'Folder'}</span>
          </button>
        )}
        center={!done && current && !compact ? (
          <>
            <span className="name">{current.name}</span>
            <span className="count tabular">{formatCount(index + 1)} / {formatCount(total)}</span>
          </>
        ) : undefined}
        right={!done && (
          <>
            {!compact && (
              <button
                type="button"
                className="icon-btn"
                aria-pressed={stripPref}
                onClick={() => setStripPref(!stripPref)}
                title="Filmstrip (Ctrl+B)"
              >
                {ultra ? <GalleryVertical size={17} strokeWidth={1.8} /> : <GalleryHorizontal size={17} strokeWidth={1.8} />}
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-pressed={inspectorVisible}
              onClick={toggleInspector}
              title="Details panel (Ctrl+I)"
            >
              <PanelRight size={17} strokeWidth={1.8} />
            </button>
          </>
        )}
      />

      {status === 'loading' ? (
        <div className="screen"><Loader2 size={22} className="spin" style={{ color: 'var(--text-3)' }} /></div>
      ) : done ? (
        applyResult ? (
          <DoneScreen
            stats={stats}
            error={applyResult.error}
            remaining={applyResult.remaining}
            onReviewRemaining={reviewRemaining}
            onChooseAnother={onChooseAnother}
          />
        ) : <div className="screen" />
      ) : (
        <div className={`viewer${compact ? ' viewer--compact' : ''}`} style={gridStyle}>
          {stripMode === 'vertical' && (
            <Filmstrip items={items} index={index} decisions={decisions} orientation="vertical" />
          )}
          <Stage
            cards={cards}
            muted={muted}
            zoomAt={zoomAt}
            compact={compact}
            onDecide={decide}
            onExited={onExited}
            onZoom={setZoomAt}
            onToggleMute={toggleMute}
          />
          <Dock
            ref={dockRef}
            stats={stats}
            canUndo={history.length > 0}
            shortcuts={shortcutsInPanel ? null : shortcuts}
            display={display}
            onPress={press}
            onShortcut={decideShortcut}
          />
          {stripMode === 'horizontal' && (
            <Filmstrip items={items} index={index} decisions={decisions} orientation="horizontal" />
          )}
          {inspectorMode !== 'hidden' && (
            <Inspector
              item={current}
              index={index}
              total={total}
              stats={stats}
              skipped={skipped}
              shortcuts={shortcutsInPanel ? shortcuts : null}
              shortcutCounts={shortcutCounts}
              display={display}
              overlay={inspectorMode === 'overlay'}
              onShortcut={decideShortcut}
            />
          )}
        </div>
      )}

      {busy && <Busy label={busy} />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
