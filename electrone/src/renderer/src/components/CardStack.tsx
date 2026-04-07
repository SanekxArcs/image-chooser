import { forwardRef } from 'react';
import type { RefObject } from 'react';
import type { MediaItem } from '../types';

interface Props {
  main: MediaItem;
  peek1: MediaItem;
  showPeek1: boolean;
  labelKeepRef: RefObject<HTMLDivElement | null>;
  labelDeleteRef: RefObject<HTMLDivElement | null>;
  labelLaterRef: RefObject<HTMLDivElement | null>;
}

const labelBase = {
  position: 'absolute' as const,
  top: '16px',
  fontSize: '0.7rem',
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: '4px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  opacity: 0,
  pointerEvents: 'none' as const,
}

const CardStack = forwardRef<HTMLDivElement, Props>(function CardStack(
  { main, peek1, showPeek1, labelKeepRef, labelDeleteRef, labelLaterRef },
  cardRef,
) {
  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: '6px', width: 'min(600px, calc(100vw - 40px))' }}
    >
      {/* Main card */}
      <div
        ref={cardRef}
        className="relative w-full overflow-hidden"
        style={{
          maxHeight: 'calc(100vh - 520px)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          userSelect: 'none',
        }}
      >
        {main.isVideo ? (
          <video
            src={main.url}
            autoPlay loop muted playsInline draggable={false}
            className="block w-full object-contain"
            style={{ maxHeight: 'calc(100vh - 520px)', height: 'auto', viewTransitionName: 'main-card' }}
          />
        ) : (
          <img
            src={main.url}
            alt="" draggable={false}
            className="block w-full object-contain"
            style={{ maxHeight: 'calc(100vh - 520px)', height: 'auto', viewTransitionName: 'main-card' }}
          />
        )}

        {/* Labels */}
        <div ref={labelKeepRef} style={{ ...labelBase, right: '14px', background: 'rgba(5,25,15,0.85)', border: '1px solid var(--keep)', color: 'var(--keep)' }}>
          Keep
        </div>
        <div ref={labelDeleteRef} style={{ ...labelBase, left: '14px', background: 'rgba(25,5,10,0.85)', border: '1px solid var(--delete)', color: 'var(--delete)' }}>
          Delete
        </div>
        <div ref={labelLaterRef} style={{ ...labelBase, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,15,5,0.85)', border: '1px solid var(--later)', color: 'var(--later)' }}>
          Later
        </div>
      </div>

      {/* Peek card */}
      {showPeek1 && (
        <div
          className="overflow-hidden flex-shrink-0"
          style={{
            opacity: 0.55,
            maxHeight: '100px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            pointerEvents: 'none',
            viewTransitionName: 'peek-1',
          }}
        >
          {peek1.isVideo ? (
            <video src={peek1.url} muted playsInline draggable={false} style={{
              display: 'block', width: 'auto', height: 'auto',
              maxWidth: 'min(600px, calc(100vw - 40px))', maxHeight: '100px', objectFit: 'contain',
            }} />
          ) : (
            <img src={peek1.url} alt="" draggable={false} style={{
              display: 'block', width: 'auto', height: 'auto',
              maxWidth: 'min(600px, calc(100vw - 40px))', maxHeight: '100px', objectFit: 'contain',
            }} />
          )}
        </div>
      )}
    </div>
  );
});

export default CardStack;
