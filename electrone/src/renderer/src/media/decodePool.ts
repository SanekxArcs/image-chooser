import type { DecodeJob, DecodeResult } from './decoder.worker';

export interface Decoded {
  bitmap: ImageBitmap;
  naturalWidth: number;
  naturalHeight: number;
}

export interface DecodeTask {
  promise: Promise<Decoded>;
  setPriority(priority: number): void;
  cancel(): void;
}

interface Task {
  job: DecodeJob;
  priority: number;
  background: boolean;
  started: boolean;
  cancelled: boolean;
  resolve: (value: Decoded) => void;
  reject: (reason: Error) => void;
}

interface WorkerSlot {
  worker: Worker | null;
  task: Task | null;
}

const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
const cores = navigator.hardwareConcurrency || 4;

// Each in-flight decode briefly holds a full-resolution bitmap, so the pool
// scales with the machine instead of using every core.
export const POOL_SIZE = cores >= 8 && deviceMemory >= 8 ? 3 : cores >= 4 ? 2 : 1;

const pool: WorkerSlot[] = [];
const pending: Task[] = [];
const running = new Map<number, Task>();
let nextId = 1;

function createWorker(): Worker | null {
  try {
    return new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** Fallback when workers are unavailable: Chromium still decodes blobs off-thread. */
async function decodeInline(job: DecodeJob): Promise<DecodeResult> {
  try {
    const response = await fetch(job.url);
    const bitmap = await createImageBitmap(await response.blob());
    return { id: job.id, bitmap, naturalWidth: bitmap.width, naturalHeight: bitmap.height };
  } catch (error) {
    return { id: job.id, error: String(error) };
  }
}

function ensurePool(): void {
  if (pool.length > 0) return;
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot: WorkerSlot = { worker: createWorker(), task: null };
    if (slot.worker) {
      slot.worker.onmessage = (event: MessageEvent<DecodeResult>) => finish(slot, event.data);
      slot.worker.onerror = () => {
        if (slot.task) finish(slot, { id: slot.task.job.id, error: 'Decoder failed' });
      };
    }
    pool.push(slot);
  }
}

function finish(slot: WorkerSlot, result: DecodeResult): void {
  const task = running.get(result.id);
  running.delete(result.id);
  if (slot.task?.job.id === result.id) slot.task = null;
  if (!task || task.cancelled) {
    if ('bitmap' in result) result.bitmap.close();
  } else if ('bitmap' in result) {
    task.resolve({ bitmap: result.bitmap, naturalWidth: result.naturalWidth, naturalHeight: result.naturalHeight });
  } else {
    task.reject(new Error(result.error));
  }
  pump();
}

function pump(): void {
  ensurePool();
  for (const slot of pool) {
    if (slot.task) continue;
    const idle = pool.filter(s => !s.task).length;
    // Background work (thumbnails) never takes the last idle worker, so the
    // photo on screen can always start decoding immediately.
    const allowBackground = idle > 1 || POOL_SIZE === 1;
    let bestIndex = -1;
    for (let i = 0; i < pending.length; i++) {
      const task = pending[i];
      if (task.background && !allowBackground) continue;
      if (bestIndex === -1 || task.priority < pending[bestIndex].priority) bestIndex = i;
    }
    if (bestIndex === -1) return;
    const [task] = pending.splice(bestIndex, 1);
    task.started = true;
    slot.task = task;
    running.set(task.job.id, task);
    if (slot.worker) slot.worker.postMessage(task.job);
    else void decodeInline(task.job).then(result => finish(slot, result));
  }
}

export function scheduleDecode(
  url: string,
  maxWidth: number,
  maxHeight: number,
  priority: number,
  background = false,
): DecodeTask {
  let resolve!: (value: Decoded) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Decoded>((res, rej) => { resolve = res; reject = rej; });
  const task: Task = {
    job: { id: nextId++, url, maxWidth, maxHeight },
    priority, background, started: false, cancelled: false, resolve, reject,
  };
  pending.push(task);
  pump();
  return {
    promise,
    setPriority(p) {
      task.priority = p;
    },
    cancel() {
      if (task.cancelled) return;
      task.cancelled = true;
      const index = pending.indexOf(task);
      if (index !== -1) pending.splice(index, 1);
      task.reject(new Error('cancelled'));
    },
  };
}
