/**
 * The app icon's card glyph, drawn in the current theme: the card uses
 * `currentColor` and its photo cut-out uses the container's background.
 */
export default function AppMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.4" y="5.6" width="10.6" height="13" rx="1.7" fill="currentColor" fillOpacity="0.35" transform="rotate(-13 12 13)" />
      <g transform="rotate(8 12 12)">
        <rect x="6.6" y="3.6" width="10.8" height="14.2" rx="1.8" fill="currentColor" />
        <rect x="7.8" y="4.8" width="8.4" height="8.4" rx="0.9" fill="var(--mark-bg, var(--accent))" />
        <path d="M7.8 13.2 V11.4 L10.4 8.8 L12.6 11 L13.9 9.7 L16.2 12 V13.2 Z" fill="currentColor" />
        <circle cx="14.4" cy="7" r="1.05" fill="currentColor" />
        <circle cx="14.9" cy="15.5" r="1.15" fill="var(--mark-bg, var(--accent))" />
      </g>
    </svg>
  );
}
