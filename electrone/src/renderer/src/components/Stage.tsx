import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, Clock, FileQuestion, Film, FolderInput, Loader2, Trash2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';

import { mediaUrl } from '../api';
import type { DecisionKind, ExitDir } from '../decisions';
import type { Size } from '../hooks';
import { useElementSize } from '../hooks';
import { useDecodedImage } from '../media/bitmapCache';
import type { DecodedImage } from '../media/bitmapCache';
import type { Action, QueueItem } from '../types';
import { extensionOf } from '../utils';

export type CardRole = 'next' | 'current' | 'exit';

export interface StageCard {
  item: QueueItem;
  role: CardRole;
  /** Queue position; cards render in this order so DOM nodes never move. */
  order: number;
  dir?: ExitDir;
  decided?: DecisionKind;
  shortcutLabel?: string;
  /** For a card restored by undo: the side it flies back in from. */
  enterFrom?: ExitDir;
}

interface Props {
  cards: StageCard[];
  muted: boolean;
  zoomAt: { x: number; y: number } | null;
  compact: boolean;
  onDecide: (action: Action) => void;
  onExited: (name: string) => void;
  onZoom: (at: { x: number; y: number } | null) => void;
  onToggleMute: () => void;
}

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_EXIT = 'cubic-bezier(0.3, 0.6, 0.2, 1)';
const EASE_SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const REST: Keyframe = { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)', opacity: 1 };
const NEXT_POSE: Keyframe = { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(0.965)', opacity: 0.001 };
const DRAG_VARS = ['--p-keep', '--p-delete', '--p-later'] as const;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function duration(ms: number): number {
  return reducedMotion.matches ? Math.min(ms, 120) : ms;
}

function exitPose(dir: ExitDir, stage: Size): Keyframe {
  const x = stage.width * 0.6 + 160;
  const y = stage.height * 0.6 + 120;
  switch (dir) {
    case 'right': return { transform: `translate3d(${x}px, ${-stage.height * 0.04}px, 0) rotate(9deg) scale(1)`, opacity: 0 };
    case 'left': return { transform: `translate3d(${-x}px, ${-stage.height * 0.04}px, 0) rotate(-9deg) scale(1)`, opacity: 0 };
    case 'down': return { transform: `translate3d(0, ${y}px, 0) rotate(0deg) scale(0.86)`, opacity: 0 };
    case 'up': return { transform: `translate3d(0, ${-y}px, 0) rotate(0deg) scale(0.86)`, opacity: 0 };
    case 'fade': return { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(0.92)', opacity: 0 };
  }
}

interface Box { x: number; y: number; w: number; h: number }

function fitBox(stage: Size, aspect: number, naturalWidth: number, pad: number): Box {
  const availW = Math.max(1, stage.width - pad * 2);
  const availH = Math.max(1, stage.height - pad * 2);
  let w = Math.min(availW, availH * aspect);
  // Never upscale past one image pixel per CSS pixel; small images stay crisp.
  w = Math.min(w, naturalWidth);
  const h = w / aspect;
  return { x: (stage.width - w) / 2, y: (stage.height - h) / 2, w, h };
}

export default function Stage({ cards, muted, zoomAt, compact, onDecide, onExited, onZoom, onToggleMute }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(stageRef);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const current = cards.find(c => c.role === 'current');
  const pad = compact ? 10 : Math.round(Math.min(32, Math.max(14, size.width * 0.016)));

  const drag = useRef<{
    id: number; el: HTMLElement; x0: number; y0: number; dx: number; dy: number;
    samples: Array<{ x: number; t: number }>; frame: number;
  } | null>(null);

  const applyDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    d.frame = 0;
    const rot = Math.max(-12, Math.min(12, d.dx * 0.035));
    d.el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0) rotate(${rot}deg) scale(1)`;
    const horizontal = Math.abs(d.dx) >= d.dy;
    const progress = (v: number) => String(Math.max(0, Math.min(1, (v - 24) / 96)));
    d.el.style.setProperty('--p-keep', horizontal && d.dx > 0 ? progress(d.dx) : '0');
    d.el.style.setProperty('--p-delete', horizontal && d.dx < 0 ? progress(-d.dx) : '0');
    d.el.style.setProperty('--p-later', !horizontal && d.dy > 0 ? progress(d.dy) : '0');
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoomAt || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-role="current"]');
    if (!el) return;
    // Settle an entrance still in flight so the drag starts from rest.
    el.getAnimations().forEach(a => a.finish());
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId, el, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0,
      samples: [{ x: e.clientX, t: e.timeStamp }], frame: 0,
    };
  }, [zoomAt]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    d.samples.push({ x: e.clientX, t: e.timeStamp });
    if (d.samples.length > 5) d.samples.shift();
    // Style writes are batched to one per frame and never touch React state.
    if (!d.frame) d.frame = requestAnimationFrame(applyDrag);
  }, [applyDrag]);

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.frame) cancelAnimationFrame(d.frame);

    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const vx = last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const threshold = Math.min(150, Math.max(90, sizeRef.current.width * 0.14));
    const horizontal = Math.abs(d.dx) >= d.dy;

    let action: Action | null = null;
    if (!cancelled) {
      if (horizontal && (d.dx > threshold || (d.dx > 40 && vx > 0.7))) action = 'keep';
      else if (horizontal && (d.dx < -threshold || (d.dx < -40 && vx < -0.7))) action = 'delete';
      else if (!horizontal && d.dy > threshold) action = 'later';
    }
    if (action) {
      d.el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0) rotate(${Math.max(-12, Math.min(12, d.dx * 0.035))}deg) scale(1)`;
      onDecide(action);
      return;
    }
    const from = d.el.style.transform;
    d.el.style.transform = '';
    DRAG_VARS.forEach(v => d.el.style.removeProperty(v));
    if (Math.abs(d.dx) + Math.abs(d.dy) > 2) {
      d.el.animate([{ transform: from }, REST], { duration: duration(440), easing: EASE_SPRING });
    }
  }, [onDecide]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!current || current.item.isVideo) return;
    if (!(e.target as HTMLElement).closest('[data-role="current"]')) return;
    onZoom({ x: e.clientX, y: e.clientY });
  }, [current, onZoom]);

  return (
    <div
      ref={stageRef}
      className="stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => endDrag(e, false)}
      onPointerCancel={e => endDrag(e, true)}
      onDoubleClick={onDoubleClick}
    >
      {size.width > 0 && cards.map(card => (
        <Card
          key={card.item.name}
          card={card}
          stage={size}
          stageRef={sizeRef}
          pad={pad}
          muted={muted}
          onExited={onExited}
        />
      ))}

      {current && !zoomAt && (
        <div className="stage-tools">
          {current.item.isVideo ? (
            <button type="button" className="chip-btn" onClick={onToggleMute} title="Toggle sound (Shift)">
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          ) : (
            <button
              type="button"
              className="chip-btn"
              title="Zoom to 100% (Enter or double-click)"
              onClick={() => {
                const r = stageRef.current?.getBoundingClientRect();
                onZoom(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 });
              }}
            >
              <ZoomIn size={15} />
            </button>
          )}
        </div>
      )}

      {zoomAt && current && !current.item.isVideo && (
        <ZoomView name={current.item.name} at={zoomAt} onClose={() => onZoom(null)} />
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  card: StageCard;
  stage: Size;
  stageRef: { current: Size };
  pad: number;
  muted: boolean;
  onExited: (name: string) => void;
}

const Card = memo(function Card({ card, stage, stageRef, pad, muted, onExited }: CardProps) {
  const { item, role } = card;
  const ref = useRef<HTMLDivElement>(null);
  const prevRole = useRef<CardRole | null>(null);
  const slot = useDecodedImage(item.isVideo ? null : item.name);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);

  let aspect = 3 / 2;
  let naturalWidth = Number.POSITIVE_INFINITY;
  if (item.isVideo) {
    aspect = videoAspect ?? 16 / 9;
  } else if (slot.state === 'ready') {
    aspect = slot.image.naturalWidth / slot.image.naturalHeight;
    naturalWidth = slot.image.naturalWidth;
  }
  const box = fitBox(stage, aspect, naturalWidth, pad);

  // Role changes drive every animation. They run as Web Animations on
  // transform/opacity only, so the compositor plays them even while the main
  // thread is busy mounting the next card.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = prevRole.current;
    prevRole.current = role;
    if (prev === role) return;

    if (prev === null) {
      if (role !== 'current') return;
      const start = card.enterFrom
        ? exitPose(card.enterFrom, stageRef.current)
        : { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(0.98)', opacity: 0 };
      el.animate([start, REST], { duration: duration(card.enterFrom ? 380 : 280), easing: EASE_OUT });
      return;
    }

    const running = el.getAnimations().length > 0;
    const computed = getComputedStyle(el);
    // The class has already switched, so a card at rest in the "next" slot
    // must start from that pose rather than its new computed style.
    const from: Keyframe = !running && prev === 'next'
      ? NEXT_POSE
      : { transform: computed.transform === 'none' ? REST.transform : computed.transform, opacity: computed.opacity };
    el.getAnimations().forEach(a => a.cancel());
    el.style.transform = '';
    DRAG_VARS.forEach(v => el.style.removeProperty(v));

    if (role === 'current') {
      el.animate([from, REST], { duration: duration(prev === 'exit' ? 360 : 300), easing: EASE_OUT });
    } else if (role === 'next') {
      el.animate([from, NEXT_POSE], { duration: duration(220), easing: EASE_OUT });
    } else {
      const dir = card.dir ?? 'fade';
      const anim = el.animate([from, exitPose(dir, stageRef.current)], {
        duration: duration(dir === 'fade' ? 220 : 400),
        easing: EASE_EXIT,
        fill: 'forwards',
      });
      anim.onfinish = () => onExited(item.name);
    }
    // Only a role change starts an animation; the other inputs are read as of that moment.
  }, [role]);

  const classes = ['card', `card--${role}`];
  if (item.isVideo) classes.push('card--video');
  if (role === 'exit' && card.decided && card.decided !== 'skip') classes.push(`card--decided-${card.decided}`);

  let content: React.ReactNode;
  if (item.isVideo) {
    content = role === 'next' ? (
      <div className="card-placeholder"><Film size={28} strokeWidth={1.5} /></div>
    ) : (
      <video
        src={mediaUrl(item.name)}
        autoPlay={role === 'current'}
        loop
        muted={muted || role !== 'current'}
        playsInline
        preload="auto"
        draggable={false}
        onLoadedMetadata={e => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setVideoAspect(v.videoWidth / v.videoHeight);
        }}
      />
    );
  } else if (slot.state === 'ready') {
    content = <BitmapCanvas image={slot.image} width={box.w} />;
  } else if (slot.state === 'error') {
    content = (
      <div className="card-placeholder">
        <FileQuestion size={30} strokeWidth={1.5} />
        <div>
          <div style={{ color: 'var(--text-2)', fontWeight: 600 }}>No preview for {extensionOf(item.name) || 'this file'}</div>
          <div>You can still sort it.</div>
        </div>
      </div>
    );
  } else {
    content = role === 'current'
      ? <div className="card-placeholder"><Loader2 size={22} className="spin" /></div>
      : null;
  }

  return (
    <div
      ref={ref}
      className={classes.join(' ')}
      data-role={role}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {content}
      <div className="card-label card-label--keep"><Check size={15} strokeWidth={2.5} />Keep</div>
      <div className="card-label card-label--delete"><Trash2 size={14} strokeWidth={2.2} />Delete</div>
      <div className="card-label card-label--later"><Clock size={14} strokeWidth={2.2} />Later</div>
      {card.shortcutLabel && (
        <div className="card-label card-label--shortcut"><FolderInput size={14} strokeWidth={2.2} />{card.shortcutLabel}</div>
      )}
    </div>
  );
});

/** Draws a pre-decoded bitmap; redraws only when the backing size is clearly off. */
function BitmapCanvas({ image, width }: { image: DecodedImage; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<DecodedImage | null>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const { bitmap } = image;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.max(1, Math.min(bitmap.width, Math.round(width * dpr)));
    // CSS scales the canvas to its box, so small drifts during a live window
    // resize are invisible; only redraw when sharpness would actually suffer.
    const stale = drawn.current !== image || target > canvas.width || target < canvas.width * 0.75;
    if (!stale) return;
    canvas.width = target;
    canvas.height = Math.max(1, Math.round((target * bitmap.height) / bitmap.width));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    try {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      drawn.current = image;
    } catch { /* bitmap was released */ }
  }, [image, width]);

  return <canvas ref={ref} />;
}

// ── 1:1 zoom ──────────────────────────────────────────────────────────────────

function ZoomView({ name, at, onClose }: { name: string; at: { x: number; y: number }; onClose: () => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  const pointer = useRef(at);
  const frame = useRef(0);

  const position = useCallback(() => {
    frame.current = 0;
    const layer = layerRef.current;
    const img = imgRef.current;
    if (!layer || !img || !img.naturalWidth) return;
    const rect = layer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // One image pixel per device pixel: true 100% for checking focus.
    const w = img.naturalWidth / dpr;
    const h = img.naturalHeight / dpr;
    const fx = Math.max(0, Math.min(1, (pointer.current.x - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (pointer.current.y - rect.top) / rect.height));
    const tx = w > rect.width ? -(w - rect.width) * fx : (rect.width - w) / 2;
    const ty = h > rect.height ? -(h - rect.height) * fy : (rect.height - h) / 2;
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }, []);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    let alive = true;
    img.decode()
      .catch(() => {})
      .then(() => {
        if (!alive) return;
        position();
        setReady(true);
      });
    return () => {
      alive = false;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [name, position]);

  return (
    <div
      ref={layerRef}
      className="zoom-layer"
      onPointerMove={e => {
        pointer.current = { x: e.clientX, y: e.clientY };
        if (!frame.current) frame.current = requestAnimationFrame(position);
      }}
      onClick={onClose}
    >
      <img ref={imgRef} src={mediaUrl(name)} alt="" decoding="async" draggable={false} style={{ opacity: ready ? 1 : 0 }} />
      <div className="zoom-status">
        <span className="chip-btn">
          {ready ? <><ZoomOut size={14} /> 100% · click to fit</> : <><Loader2 size={14} className="spin" /> Loading full resolution</>}
        </span>
      </div>
    </div>
  );
}
