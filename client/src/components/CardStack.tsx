import { forwardRef } from 'react';
import type { RefObject } from 'react';

interface Props {
  mainSrc: string;
  peek1Src: string;
  showPeek1: boolean;
  labelKeepRef: RefObject<HTMLDivElement | null>;
  labelDeleteRef: RefObject<HTMLDivElement | null>;
  labelLaterRef: RefObject<HTMLDivElement | null>;
}

const CardStack = forwardRef<HTMLDivElement, Props>(function CardStack(
  { mainSrc, peek1Src, showPeek1, labelKeepRef, labelDeleteRef, labelLaterRef },
  cardRef,
) {
  return (
    <div
      className="flex flex-col items-center"
      style={{
        gap: '8px',
        width: 'min(600px, calc(100vw - 40px))',
      }}
    >
      {/* Main card */}
      <div
        ref={cardRef}
        className="relative w-full rounded-2xl overflow-hidden shadow-2xl"
        style={{
          maxHeight: 'calc(100vh - 540px)',
          background: 'var(--surface)',
          userSelect: 'none',
        }}
      >
        <img
          src={mainSrc}
          alt=""
          draggable={false}
          className="block w-full object-contain"
          style={{
            maxHeight: 'calc(100vh - 540px)',
            height: 'auto',
            viewTransitionName: 'main-card',
          }}
        />

        {/* Drag labels */}
        <div
          ref={labelKeepRef}
          style={{
            position: 'absolute',
            top: '24px',
            right: '20px',
            fontSize: '1.4rem',
            fontWeight: 800,
            padding: '6px 16px',
            borderRadius: '8px',
            border: '3px solid var(--keep)',
            color: 'var(--keep)',
            opacity: 0,
            pointerEvents: 'none',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          KEEP
        </div>
        <div
          ref={labelDeleteRef}
          style={{
            position: 'absolute',
            top: '24px',
            left: '20px',
            fontSize: '1.4rem',
            fontWeight: 800,
            padding: '6px 16px',
            borderRadius: '8px',
            border: '3px solid var(--delete)',
            color: 'var(--delete)',
            opacity: 0,
            pointerEvents: 'none',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          DELETE
        </div>
        <div
          ref={labelLaterRef}
          style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '1.4rem',
            fontWeight: 800,
            padding: '6px 16px',
            borderRadius: '8px',
            border: '3px solid var(--later)',
            color: 'var(--later)',
            opacity: 0,
            pointerEvents: 'none',
            textTransform: 'uppercase',
            letterSpacing: '2px',
          }}
        >
          LATER
        </div>
      </div>

      {/* Peek-1 card */}
      {showPeek1 && (
        <div
          className="rounded-xl overflow-hidden flex-shrink-0"
          style={{
            opacity: 0.68,
            maxHeight: '130px',
            background: 'var(--surface)',
            pointerEvents: 'none',
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
            viewTransitionName: 'peek-1',
          }}
        >
          <img
            src={peek1Src}
            alt=""
            draggable={false}
            style={{
              display: 'block',
              width: 'auto',
              height: 'auto',
              maxWidth: 'min(600px, calc(100vw - 40px))',
              maxHeight: '130px',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
});

export default CardStack;
