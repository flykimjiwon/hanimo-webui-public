'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_RESET_EVENT_NAME,
  DEFAULT_APPEARANCE,
  LEGACY_THEME_STORAGE_KEY,
  appearanceSnapshot,
  parseAppearance,
  parseLegacyAppearance,
} from '@/lib/appearance-contract.mjs';
import ThemeDrawerSections from '@/components/theme/ThemeDrawerSections';
import { SKIN_REGISTRY } from '@/lib/appearance/skin-registry.mjs';
import { useTranslation } from '@/hooks/useTranslation';

const PALETTES = [
  { id: 'amber', name: '앰버 (기본)', light: '#f5a623', dark: '#f5be5b', deep: '#d99437' },
  { id: 'sunset', name: '선셋', light: '#e76f51', dark: '#f08a6e', deep: '#c45a3f' },
  { id: 'rose', name: '로즈', light: '#e11d74', dark: '#f04898', deep: '#b8155f' },
  { id: 'plum', name: '플럼', light: '#8b5cf6', dark: '#a78bfa', deep: '#7042e0' },
  { id: 'ocean', name: '오션', light: '#0ea5e9', dark: '#38bdf8', deep: '#0284c7' },
  { id: 'forest', name: '포레스트', light: '#16a34a', dark: '#4ade80', deep: '#15803d' },
  { id: 'mint', name: '민트', light: '#14b8a6', dark: '#2dd4bf', deep: '#0f766e' },
  { id: 'graphite', name: '그래파이트', light: '#44403c', dark: '#a8a29e', deep: '#1c1917' },
];

const FONTS = [
  { id: 'pretendard', name: 'Pretendard', stack: DEFAULT_APPEARANCE.fontStack },
  { id: 'system', name: 'System', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif' },
  { id: 'inter+pretendard', name: 'Inter + Pretendard', stack: '"Inter", "Pretendard Variable", "Pretendard", sans-serif' },
  { id: 'serif', name: 'Serif', stack: 'Georgia, "Times New Roman", "Noto Serif KR", serif' },
];

function applySnapshot(snapshot, dark) {
  const root = document.documentElement;
  Object.entries(dark ? snapshot.dark : snapshot.light).forEach(([name, value]) => root.style.setProperty(name, value));
  root.dataset.skin = snapshot.root.skin;
  root.dataset.hanimoSkin = snapshot.root.skin;
  root.dataset.density = snapshot.root.density;
  root.style.setProperty('--type-scale', snapshot.root.typeScale);
  root.style.setProperty('--hn-font', snapshot.root.font);
  root.style.setProperty('--hn-pad', snapshot.root.pad);
  root.style.setProperty('--hn-row-gap', snapshot.root.rowGap);
  root.toggleAttribute('data-reduce-motion', snapshot.root.reduceMotion);
}

function storedAppearance() {
  const current = parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  if (current) return current;
  const legacy = parseLegacyAppearance(localStorage.getItem(LEGACY_THEME_STORAGE_KEY));
  if (legacy) localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearanceSnapshot(legacy)));
  return legacy;
}

export default function ThemeDrawer({ open, onClose }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(DEFAULT_APPEARANCE);
  const [mode, setMode] = useState('system');
  const [hexCopied, setHexCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => {
    const saved = storedAppearance();
    if (saved) setPrefs(saved);
    const storedMode = localStorage.getItem('theme');
    setMode(storedMode === 'auto' ? 'system' : ['light', 'dark', 'system'].includes(storedMode) ? storedMode : 'system');
  }, [open]);

  const persist = useCallback((next) => {
    const snapshot = appearanceSnapshot(next);
    setPrefs(snapshot.prefs);
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(snapshot));
    applySnapshot(snapshot, document.documentElement.classList.contains('dark'));
  }, []);

  const update = (key, value) => persist({ ...prefs, [key]: value });
  const setPalette = (palette) => persist({ ...prefs, paletteId: palette.id, primary: palette.light, primaryDark: palette.dark, primaryStrong: palette.deep });
  const setFont = (font) => persist({ ...prefs, fontId: font.id, fontStack: font.stack });
  const copyHex = () => navigator.clipboard?.writeText(prefs.primary).then(() => {
    setHexCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setHexCopied(false), 1200);
  }).catch(() => {});
  const setThemeMode = (nextMode) => {
    const dark = nextMode === 'dark' || (nextMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', nextMode === 'system' ? 'auto' : nextMode);
    setMode(nextMode);
    applySnapshot(appearanceSnapshot(prefs), dark);
  };
  const reset = () => {
    localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    setPrefs(DEFAULT_APPEARANCE);
    const root = document.documentElement;
    ['--hn-primary', '--hn-primary-soft', '--hn-primary-strong', '--hn-primary-fg', '--hn-radius', '--hn-font', '--hn-pad', '--hn-row-gap', '--type-scale', '--primary', '--primary-foreground', '--ring', '--chart-1', '--chart-3', '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring'].forEach((name) => root.style.removeProperty(name));
    root.dataset.skin = DEFAULT_APPEARANCE.skin;
    root.dataset.hanimoSkin = DEFAULT_APPEARANCE.skin;
    delete root.dataset.density;
    root.toggleAttribute('data-reduce-motion', false);
    window.dispatchEvent(new CustomEvent(APPEARANCE_RESET_EVENT_NAME));
  };

  if (!open) return null;
  const skins = SKIN_REGISTRY.map((skin) => ({ id: skin.id, label: t(skin.labelKey) }));
  return <ThemeDrawerSections {...{ prefs, mode, skins, palettes: PALETTES, fonts: FONTS, hexCopied, update, setPalette, setFont, copyHex, setThemeMode, reset, onClose }} />;
}
