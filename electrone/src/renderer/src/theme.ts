import { useCallback, useEffect, useState } from 'react';

import { apiSaveAppearance, initialAppearance } from './api';
import type { ResolvedTheme, Theme } from './types';

export const THEME_ORDER: Theme[] = ['system', 'light', 'dark', 'oled'];

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  oled: 'OLED',
};

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme;
  return darkQuery.matches ? 'dark' : 'light';
}

function applyToDocument(theme: Theme): void {
  document.documentElement.dataset.theme = resolve(theme);
}

let currentTheme: Theme = THEME_ORDER.includes(initialAppearance.theme)
  ? initialAppearance.theme
  : 'system';
const listeners = new Set<(theme: Theme) => void>();

// Applied at import time so the first frame is already in the right theme.
applyToDocument(currentTheme);
darkQuery.addEventListener('change', () => applyToDocument(currentTheme));

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  applyToDocument(theme);
  listeners.forEach(fn => fn(theme));
  void apiSaveAppearance({ theme }).catch(() => {});
}

export function useTheme(): [Theme, (theme: Theme) => void, () => void] {
  const [theme, setLocal] = useState(currentTheme);
  useEffect(() => {
    listeners.add(setLocal);
    return () => { listeners.delete(setLocal); };
  }, []);
  const cycle = useCallback(() => {
    setTheme(THEME_ORDER[(THEME_ORDER.indexOf(currentTheme) + 1) % THEME_ORDER.length]);
  }, []);
  return [theme, setTheme, cycle];
}
