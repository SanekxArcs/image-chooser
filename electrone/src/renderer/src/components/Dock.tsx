import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Check, ChevronsRight, Clock, Trash2, Undo2 } from 'lucide-react';

import type { DisplaySettings, ShortcutFolder, Stats } from '../types';
import { folderBaseName, truncateName } from '../utils';

export type DockButton = 'keep' | 'delete' | 'later' | 'undo' | 'skip';

export interface DockHandle {
  /** Briefly presses a button so keyboard decisions get the same feedback as clicks. */
  flash(button: DockButton): void;
}

interface Props {
  stats: Stats;
  canUndo: boolean;
  shortcuts: ShortcutFolder[] | null;
  display: DisplaySettings;
  onPress: (button: DockButton) => void;
  onShortcut: (shortcut: ShortcutFolder) => void;
}

const Dock = forwardRef<DockHandle, Props>(function Dock(
  { stats, canUndo, shortcuts, display, onPress, onShortcut },
  ref,
) {
  const buttons = useRef<Partial<Record<DockButton, HTMLButtonElement | null>>>({});

  useImperativeHandle(ref, () => ({
    flash(button) {
      buttons.current[button]?.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.93)' }, { transform: 'scale(1)' }],
        { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    },
  }), []);

  const bind = (name: DockButton) => (el: HTMLButtonElement | null) => { buttons.current[name] = el; };

  return (
    <div className="dock">
      <div className="dock-row">
        <button ref={bind('delete')} type="button" className="dock-btn" onClick={() => onPress('delete')} title="Delete (←)">
          <Trash2 size={18} strokeWidth={1.9} />
          <span className="dock-label">Delete</span>
          {stats.deleted > 0 && <span className="dock-count">{stats.deleted}</span>}
          <kbd className="kbd">←</kbd>
        </button>
        <button ref={bind('later')} type="button" className="dock-btn" onClick={() => onPress('later')} title="Later (↓)">
          <Clock size={18} strokeWidth={1.9} />
          <span className="dock-label">Later</span>
          {stats.later > 0 && <span className="dock-count">{stats.later}</span>}
          <kbd className="kbd">↓</kbd>
        </button>
        <span className="dock-divider" />
        <button
          ref={bind('undo')}
          type="button"
          className="dock-btn dock-btn--quiet"
          onClick={() => onPress('undo')}
          disabled={!canUndo}
          title="Undo (↑)"
        >
          <Undo2 size={18} strokeWidth={1.9} />
          <span className="dock-label">Undo</span>
          <kbd className="kbd">↑</kbd>
        </button>
        <button ref={bind('skip')} type="button" className="dock-btn dock-btn--quiet" onClick={() => onPress('skip')} title="Skip (Space)">
          <ChevronsRight size={18} strokeWidth={1.9} />
          <span className="dock-label">Skip</span>
          <kbd className="kbd" style={{ minWidth: 40 }}>␣</kbd>
        </button>
        <span className="dock-divider" />
        <button ref={bind('keep')} type="button" className="dock-btn dock-btn--primary" onClick={() => onPress('keep')} title="Keep (→)">
          <Check size={19} strokeWidth={2.2} />
          <span className="dock-label">Keep</span>
          {stats.kept > 0 && <span className="dock-count">{stats.kept}</span>}
          <kbd className="kbd">→</kbd>
        </button>
      </div>

      {shortcuts && shortcuts.length > 0 && (
        <div className="shortcut-row">
          {shortcuts.map(s => {
            const name = folderBaseName(s.folderPath);
            return (
              <button key={s.key} type="button" className="shortcut-chip" title={s.folderPath} onClick={() => onShortcut(s)}>
                <kbd className="kbd">{s.key}</kbd>
                <span>{truncateName(name, display.truncateLength)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default Dock;
