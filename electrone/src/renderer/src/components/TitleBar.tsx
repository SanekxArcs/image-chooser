import type { ReactNode } from 'react';
import { Monitor, Moon, MoonStar, Settings, Sun } from 'lucide-react';

import { THEME_LABELS, THEME_ORDER, useTheme } from '../theme';

interface Props {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  /** 0–1; shows a hairline progress bar along the bottom edge. */
  progress?: number;
  onOpenSettings: () => void;
}

export default function TitleBar({ left, center, right, progress, onOpenSettings }: Props) {
  return (
    <header className="titlebar">
      {left}
      <div className="titlebar-spacer" />
      {right}
      <ThemeButton />
      <button type="button" className="icon-btn" onClick={onOpenSettings} title="Settings (Ctrl+,)">
        <Settings size={17} strokeWidth={1.8} />
      </button>
      {center && <div className="titlebar-center">{center}</div>}
      {progress !== undefined && (
        <div className="progress">
          <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
        </div>
      )}
    </header>
  );
}

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon, oled: MoonStar };

function ThemeButton() {
  const [theme, , cycle] = useTheme();
  const Icon = THEME_ICON[theme];
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={cycle}
      title={`Theme: ${THEME_LABELS[theme]} — click for ${THEME_LABELS[next]}`}
    >
      <Icon size={17} strokeWidth={1.8} />
    </button>
  );
}
