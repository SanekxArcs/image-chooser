import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { Film, ImageOff } from 'lucide-react';

import { DECISION_ICON, decisionKind } from '../decisions';
import { useElementSize } from '../hooks';
import { drawThumb, thumbCache, useThumb } from '../media/thumbCache';
import type { QueueItem } from '../types';

interface Props {
  items: QueueItem[];
  index: number;
  decisions: ReadonlyMap<string, string>;
  orientation: 'horizontal' | 'vertical';
}

const BEFORE = 8;
const AFTER = 24;

function Filmstrip({ items, index, decisions, orientation }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const vertical = orientation === 'vertical';

  // Vertical thumbs are inset so the focus ring around the current one isn't clipped.
  const thumbW = vertical ? Math.max(80, Math.floor(size.width) - 8) : 56;
  const thumbH = vertical ? Math.round(thumbW * (2 / 3)) : 56;
  const gap = vertical ? 10 : 8;
  const step = (vertical ? thumbH : thumbW) + gap;
  const start = Math.max(0, index - BEFORE);
  const end = Math.min(items.length, index + AFTER);

  // Ask for thumbnails nearest the current item first.
  useEffect(() => {
    const names: string[] = [];
    for (let d = 0; d < AFTER; d++) {
      const ahead = items[index + d];
      if (ahead && !ahead.isVideo) names.push(ahead.name);
      const behind = d > 0 && d <= BEFORE ? items[index - d] : undefined;
      if (behind && !behind.isVideo) names.push(behind.name);
    }
    thumbCache.want(names, Math.round(thumbW * (window.devicePixelRatio || 1)));
  }, [items, index, thumbW]);

  // Only the track moves; thumbs keep fixed offsets inside it so advancing is
  // a single compositor transform rather than a relayout of every thumb.
  const shift = -(index * step) - (vertical ? thumbH : thumbW) / 2;
  const trackStyle: React.CSSProperties = vertical
    ? { left: 4, right: 4, top: '36%', transform: `translate3d(0, ${shift}px, 0)` }
    : { top: 10, left: '50%', transform: `translate3d(${shift}px, 0, 0)` };

  const thumbs = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    const decision = decisions.get(item.name);
    thumbs.push(
      <Thumbnail
        key={item.name}
        item={item}
        width={thumbW}
        height={thumbH}
        offset={i * step}
        vertical={vertical}
        state={i === index ? 'current' : i < index ? 'past' : 'future'}
        decision={i < index ? decision : undefined}
      />,
    );
  }

  return (
    <div ref={ref} className={vertical ? 'queue' : 'strip'} aria-hidden="true">
      {size.width > 0 && <div className="track" style={trackStyle}>{thumbs}</div>}
    </div>
  );
}

interface ThumbProps {
  item: QueueItem;
  width: number;
  height: number;
  offset: number;
  vertical: boolean;
  state: 'past' | 'current' | 'future';
  decision?: string;
}

const Thumbnail = memo(function Thumbnail({ item, width, height, offset, vertical, state, decision }: ThumbProps) {
  const slot = useThumb(item.isVideo ? null : item.name);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    if (slot.state === 'ready' && canvasRef.current) drawThumb(canvasRef.current, slot.thumb, width, height);
  }, [slot, width, height]);

  const Icon = decision ? DECISION_ICON[decisionKind(decision)] : null;

  return (
    <div
      className={`thumb thumb--${state}`}
      style={{
        width,
        height,
        [vertical ? 'top' : 'left']: offset,
      }}
    >
      {item.isVideo ? (
        <div className="thumb-icon"><Film size={18} strokeWidth={1.6} /></div>
      ) : slot.state === 'ready' ? (
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      ) : slot.state === 'error' ? (
        <div className="thumb-icon"><ImageOff size={16} strokeWidth={1.6} /></div>
      ) : null}
      {vertical && <div className="thumb-name">{item.name}</div>}
      {Icon && <div className="thumb-badge"><Icon size={11} strokeWidth={2.6} /></div>}
    </div>
  );
});

export default memo(Filmstrip);
