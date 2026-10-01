import { useCallback, useSyncExternalStore } from 'react';

import { mediaUrl } from '../api';
import { scheduleDecode } from './decodePool';
import type { Decoded, DecodeTask } from './decodePool';

export type DecodedImage = Decoded;

export type ImageSlot =
  | { state: 'loading' }
  | { state: 'ready'; image: DecodedImage }
  | { state: 'error' };

interface Entry {
  name: string;
  slot: ImageSlot;
  task: DecodeTask | null;
  lastUsed: number;
  bytes: number;
  listeners: Set<() => void>;
}

const LOADING: ImageSlot = { state: 'loading' };
const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
const BUDGET_BYTES = (deviceMemory >= 8 ? 768 : 320) * 1024 * 1024;
/** Priority given to an item a card asks for that the viewer did not plan for. */
const UNPLANNED_PRIORITY = 50;

function decodeTarget(): [number, number] {
  // Decode to the physical screen size: sharp when fullscreen, and a window
  // resize never needs a re-decode.
  const dpr = window.devicePixelRatio || 1;
  return [Math.round(window.screen.width * dpr), Math.round(window.screen.height * dpr)];
}

/**
 * Screen-sized decoded photos for the stage. The viewer declares a window of
 * items around the current one; they decode in priority order off the main
 * thread, and least recently used bitmaps are released past a memory budget.
 */
class BitmapCache {
  private entries = new Map<string, Entry>();
  private wanted = new Set<string>();
  private bytes = 0;
  private clock = 0;

  setWanted(names: string[]): void {
    this.wanted = new Set(names);
    names.forEach((name, priority) => this.ensure(name, priority));
    for (const [name, entry] of this.entries) {
      // Drop decodes that scrolled out of the window before they finished.
      if (!this.wanted.has(name) && entry.slot.state === 'loading' && entry.listeners.size === 0) {
        entry.task?.cancel();
        this.entries.delete(name);
      }
    }
    this.evict();
  }

  get(name: string): ImageSlot {
    return this.entries.get(name)?.slot ?? LOADING;
  }

  subscribe(name: string, listener: () => void): () => void {
    const entry = this.ensure(name, UNPLANNED_PRIORITY);
    entry.listeners.add(listener);
    return () => { entry.listeners.delete(listener); };
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.task?.cancel();
      if (entry.slot.state === 'ready') entry.slot.image.bitmap.close();
    }
    this.entries.clear();
    this.wanted.clear();
    this.bytes = 0;
  }

  private ensure(name: string, priority: number): Entry {
    let entry = this.entries.get(name);
    if (!entry) {
      entry = { name, slot: LOADING, task: null, lastUsed: 0, bytes: 0, listeners: new Set() };
      this.entries.set(name, entry);
      this.load(entry, priority);
    } else {
      entry.task?.setPriority(priority);
    }
    entry.lastUsed = ++this.clock;
    return entry;
  }

  private load(entry: Entry, priority: number): void {
    const [maxWidth, maxHeight] = decodeTarget();
    const task = scheduleDecode(mediaUrl(entry.name), maxWidth, maxHeight, priority);
    entry.task = task;
    task.promise.then(
      image => {
        entry.task = null;
        if (this.entries.get(entry.name) !== entry) {
          image.bitmap.close();
          return;
        }
        entry.slot = { state: 'ready', image };
        entry.bytes = image.bitmap.width * image.bitmap.height * 4;
        this.bytes += entry.bytes;
        entry.listeners.forEach(fn => fn());
        this.evict();
      },
      () => {
        entry.task = null;
        if (this.entries.get(entry.name) !== entry) return;
        entry.slot = { state: 'error' };
        entry.listeners.forEach(fn => fn());
      },
    );
  }

  private evict(): void {
    if (this.bytes <= BUDGET_BYTES) return;
    const candidates = [...this.entries.values()]
      .filter(e => e.slot.state === 'ready' && !this.wanted.has(e.name) && e.listeners.size === 0)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates) {
      if (this.bytes <= BUDGET_BYTES) break;
      if (entry.slot.state === 'ready') entry.slot.image.bitmap.close();
      this.bytes -= entry.bytes;
      this.entries.delete(entry.name);
    }
  }
}

export const bitmapCache = new BitmapCache();

export function useDecodedImage(name: string | null): ImageSlot {
  const subscribe = useCallback(
    (listener: () => void) => (name ? bitmapCache.subscribe(name, listener) : () => {}),
    [name],
  );
  return useSyncExternalStore(subscribe, () => (name ? bitmapCache.get(name) : LOADING));
}
