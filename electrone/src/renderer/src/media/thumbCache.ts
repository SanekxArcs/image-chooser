import { useCallback, useSyncExternalStore } from 'react';

import { mediaUrl } from '../api';
import { scheduleDecode } from './decodePool';
import type { DecodeTask } from './decodePool';
import { parseExifPreview, readHead } from './exif';

export interface Thumb {
  bitmap: ImageBitmap;
  /** EXIF orientation still to apply when drawing (1 when already upright). */
  orientation: number;
  /** Region of the bitmap holding the photo; camera previews are letterboxed. */
  crop: { x: number; y: number; w: number; h: number };
}

export type ThumbSlot = { state: 'loading' } | { state: 'ready'; thumb: Thumb } | { state: 'error' };

interface Entry {
  slot: ThumbSlot;
  priority: number;
  started: boolean;
  task: DecodeTask | null;
  /** True once the thumbnail comes from a full decode rather than the camera preview. */
  sharp: boolean;
  upgrading: boolean;
  lastUsed: number;
  listeners: Set<() => void>;
}

const LOADING: ThumbSlot = { state: 'loading' };
const MAX_ACTIVE = 4;
const MAX_ENTRIES = 400;
const FALLBACK_SIZE = 320;
const JPEG = /\.jpe?g$/i;

/** Crops the black bands a camera adds when its preview aspect differs from the photo. */
function previewCrop(bitmap: ImageBitmap, orientation: number, width: number, height: number) {
  const full = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  if (!width || !height) return full;
  // The preview is stored unrotated, like the sensor data the dimensions describe.
  const sideways = orientation >= 5;
  const aspect = sideways && height > width ? height / width : width / height;
  const previewAspect = bitmap.width / bitmap.height;
  if (Math.abs(aspect - previewAspect) < 0.02) return full;
  if (aspect > previewAspect) {
    const h = bitmap.width / aspect;
    return { x: 0, y: (bitmap.height - h) / 2, w: bitmap.width, h };
  }
  const w = bitmap.height * aspect;
  return { x: (bitmap.width - w) / 2, y: 0, w, h: bitmap.height };
}

class ThumbCache {
  private entries = new Map<string, Entry>();
  private active = 0;
  private clock = 0;
  private targetPx = 0;

  /** `targetPx` is the device-pixel width thumbnails are drawn at. */
  want(names: string[], targetPx: number): void {
    const keep = new Set(names);
    this.targetPx = targetPx;
    names.forEach((name, priority) => {
      const entry = this.ensure(name);
      entry.priority = priority;
      entry.task?.setPriority(1000 + priority);
      this.maybeUpgrade(name, entry);
    });
    // Forget thumbnails that scrolled away before their turn came.
    for (const [name, entry] of this.entries) {
      if (!keep.has(name) && !entry.started && entry.listeners.size === 0) this.entries.delete(name);
    }
    this.trim(keep);
    this.pump();
  }

  get(name: string): ThumbSlot {
    return this.entries.get(name)?.slot ?? LOADING;
  }

  subscribe(name: string, listener: () => void): () => void {
    const entry = this.ensure(name);
    entry.listeners.add(listener);
    this.pump();
    return () => { entry.listeners.delete(listener); };
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      entry.task?.cancel();
      if (entry.slot.state === 'ready') entry.slot.thumb.bitmap.close();
    }
    this.entries.clear();
  }

  private ensure(name: string): Entry {
    let entry = this.entries.get(name);
    if (!entry) {
      entry = {
        slot: LOADING, priority: 500, started: false, task: null, sharp: false, upgrading: false,
        lastUsed: 0, listeners: new Set(),
      };
      this.entries.set(name, entry);
    }
    entry.lastUsed = ++this.clock;
    return entry;
  }

  private pump(): void {
    while (this.active < MAX_ACTIVE) {
      let bestName: string | null = null;
      let best: Entry | null = null;
      for (const [name, entry] of this.entries) {
        if (entry.started) continue;
        if (!best || entry.priority < best.priority) { best = entry; bestName = name; }
      }
      if (!best || !bestName) return;
      best.started = true;
      this.active++;
      const entry = best;
      const name = bestName;
      void this.load(name, entry).then(slot => {
        this.active--;
        if (this.entries.get(name) === entry) {
          entry.slot = slot;
          entry.listeners.forEach(fn => fn());
          this.maybeUpgrade(name, entry);
        } else if (slot.state === 'ready') {
          slot.thumb.bitmap.close();
        }
        this.pump();
      });
    }
  }

  private async load(name: string, entry: Entry): Promise<ThumbSlot> {
    const url = mediaUrl(name);
    if (JPEG.test(name)) {
      try {
        const preview = parseExifPreview(await readHead(url));
        if (preview) {
          const bitmap = await createImageBitmap(preview.blob);
          return {
            state: 'ready',
            thumb: {
              bitmap,
              orientation: preview.orientation,
              crop: previewCrop(bitmap, preview.orientation, preview.width, preview.height),
            },
          };
        }
      } catch { /* fall through to a full decode */ }
    }
    try {
      // Low-priority background decode that never blocks the photo on screen.
      entry.task = scheduleDecode(url, FALLBACK_SIZE, FALLBACK_SIZE, 1000 + entry.priority, true);
      const decoded = await entry.task.promise;
      entry.task = null;
      entry.sharp = true;
      const { bitmap } = decoded;
      return { state: 'ready', thumb: { bitmap, orientation: 1, crop: { x: 0, y: 0, w: bitmap.width, h: bitmap.height } } };
    } catch {
      entry.task = null;
      return { state: 'error' };
    }
  }

  /**
   * Camera previews are only ~160 px wide. When thumbnails are drawn larger
   * (the ultrawide queue column), show the preview first, then swap in a
   * sharper background decode.
   */
  private maybeUpgrade(name: string, entry: Entry): void {
    if (entry.sharp || entry.upgrading || entry.slot.state !== 'ready') return;
    const { crop } = entry.slot.thumb;
    if (this.targetPx <= Math.max(crop.w, crop.h) * 1.25) return;
    entry.upgrading = true;
    // Room for a cover-fit crop of a 3:2 tile from either orientation.
    const size = Math.round(this.targetPx * 1.6);
    const task = scheduleDecode(mediaUrl(name), size, size, 1500 + entry.priority, true);
    entry.task = task;
    task.promise.then(
      decoded => {
        entry.task = null;
        entry.upgrading = false;
        if (this.entries.get(name) !== entry || entry.slot.state !== 'ready') {
          decoded.bitmap.close();
          return;
        }
        entry.slot.thumb.bitmap.close();
        const { bitmap } = decoded;
        entry.slot = { state: 'ready', thumb: { bitmap, orientation: 1, crop: { x: 0, y: 0, w: bitmap.width, h: bitmap.height } } };
        entry.sharp = true;
        entry.listeners.forEach(fn => fn());
      },
      () => {
        entry.task = null;
        entry.upgrading = false;
        entry.sharp = true; // don't retry a file that won't decode
      },
    );
  }

  private trim(keep: Set<string>): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const evictable = [...this.entries.entries()]
      .filter(([name, e]) => !keep.has(name) && e.listeners.size === 0)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [name, entry] of evictable) {
      if (this.entries.size <= MAX_ENTRIES) break;
      entry.task?.cancel();
      if (entry.slot.state === 'ready') entry.slot.thumb.bitmap.close();
      this.entries.delete(name);
    }
  }
}

export const thumbCache = new ThumbCache();

export function useThumb(name: string | null): ThumbSlot {
  const subscribe = useCallback(
    (listener: () => void) => (name ? thumbCache.subscribe(name, listener) : () => {}),
    [name],
  );
  return useSyncExternalStore(subscribe, () => (name ? thumbCache.get(name) : LOADING));
}

/** Draws a thumbnail into a canvas with cover-fit and its EXIF orientation applied. */
export function drawThumb(canvas: HTMLCanvasElement, thumb: Thumb, cssWidth: number, cssHeight: number): void {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(cssWidth * dpr));
  const H = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { bitmap, orientation, crop } = thumb;
  const sideways = orientation >= 5;
  const shownW = sideways ? crop.h : crop.w;
  const shownH = sideways ? crop.w : crop.h;
  const scale = Math.max(W / shownW, H / shownH);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  switch (orientation) {
    case 2: ctx.scale(-1, 1); break;
    case 3: ctx.rotate(Math.PI); break;
    case 4: ctx.scale(1, -1); break;
    case 5: ctx.rotate(Math.PI / 2); ctx.scale(1, -1); break;
    case 6: ctx.rotate(Math.PI / 2); break;
    case 7: ctx.rotate(-Math.PI / 2); ctx.scale(1, -1); break;
    case 8: ctx.rotate(-Math.PI / 2); break;
  }
  ctx.imageSmoothingQuality = 'high';
  const dw = crop.w * scale;
  const dh = crop.h * scale;
  try {
    ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, -dw / 2, -dh / 2, dw, dh);
  } catch { /* bitmap was released */ }
}
