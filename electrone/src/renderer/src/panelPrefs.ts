import { useSyncExternalStore } from 'react';

export type PanelSectionId = 'file' | 'details' | 'session' | 'folders' | 'keys';

export const PANEL_SECTIONS: Array<{ id: PanelSectionId; label: string; description: string }> = [
  { id: 'file', label: 'File', description: 'Name and progress through the folder' },
  { id: 'details', label: 'Details', description: 'Type, dimensions, resolution, size, date' },
  { id: 'session', label: 'This session', description: 'Counts of kept, later, deleted, skipped' },
  { id: 'folders', label: 'Folders', description: 'Shortcut folders, when shown in the side panel' },
  { id: 'keys', label: 'Keys', description: 'Keyboard shortcut reference' },
];

export type PanelVisibility = Record<PanelSectionId, boolean>;

const STORAGE_KEY = 'ic.panelSections';
const DEFAULTS: PanelVisibility = { file: true, details: true, session: true, folders: true, keys: true };

// A view preference for this machine, so it lives in local storage; the
// panel falls back to showing everything when storage is unavailable.
function load(): PanelVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PanelVisibility>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let visibility = load();
const listeners = new Set<() => void>();

export function setSectionVisible(id: PanelSectionId, visible: boolean): void {
  visibility = { ...visibility, [id]: visible };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility)); } catch { /* ignore */ }
  listeners.forEach(fn => fn());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePanelSections(): PanelVisibility {
  return useSyncExternalStore(subscribe, () => visibility);
}
