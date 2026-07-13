import { normalizeSkinId } from './appearance/skin-registry.mjs';

export const APPEARANCE_STORAGE_KEY = 'hanimo-webui-appearance-v1';
export const APPEARANCE_RESET_EVENT_NAME = 'hanimo-webui-appearance-reset';
export const LEGACY_THEME_STORAGE_KEY = 'hanimo-webui-theme';
export const SITE_THEME_STORAGE_KEY = 'hanimo-webui-site-theme';

export const DEFAULT_APPEARANCE = Object.freeze({
  skin: 'warm-command-deck',
  paletteId: 'amber',
  primary: '#f5a623',
  primaryDark: '#f5be5b',
  primaryStrong: '#d99437',
  fontId: 'pretendard',
  fontStack: '"Pretendard Variable", "Pretendard", "Inter", -apple-system, sans-serif',
  density: 'cozy',
  radius: 0.625,
  typeScale: 1,
  reduceMotion: false,
  bubbleStyle: 'boxed',
  inputStyle: 'rounded',
  emptyStyle: 'greet',
  recentStyle: 'rich',
  articleLayout: 'toc',
  editorMode: 'rich',
});

const DENSITY_ALIASES = { roomy: 'relaxed' };
const DENSITIES = {
  compact: { pad: '10px', rowGap: '6px' },
  cozy: { pad: '14px', rowGap: '10px' },
  relaxed: { pad: '18px', rowGap: '14px' },
};
const HEX = /^#[0-9a-f]{6}$/i;
const TYPE_SCALE_MIN = 0.85;
const TYPE_SCALE_MAX = 1.25;
const PALETTE_IDS = new Set(['amber', 'sunset', 'rose', 'plum', 'ocean', 'forest', 'mint', 'graphite', 'custom']);
const FONT_STACKS = Object.freeze({
  pretendard: DEFAULT_APPEARANCE.fontStack,
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
  'inter+pretendard': '"Inter", "Pretendard Variable", "Pretendard", sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif KR", serif',
});
const BUBBLE_STYLES = new Set(['boxed', 'plain']);
const INPUT_STYLES = new Set(['boxed', 'rounded']);
const EMPTY_STYLES = new Set(['greet', 'cards', 'minimal', 'hero']);
const RECENT_STYLES = new Set(['rich', 'compact']);
const ARTICLE_LAYOUTS = new Set(['toc', 'plain']);
const EDITOR_MODES = new Set(['rich', 'markdown']);

function normalizedHex(value, fallback) {
  return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback;
}

export function clampTypeScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_APPEARANCE.typeScale;
  return Math.min(TYPE_SCALE_MAX, Math.max(TYPE_SCALE_MIN, numeric));
}

export function normalizeAppearance(value) {
  const source = value && typeof value === 'object' ? value : {};
  const density = DENSITY_ALIASES[source.density] || source.density;
  const primary = normalizedHex(source.primary, DEFAULT_APPEARANCE.primary);
  const fontId = Object.hasOwn(FONT_STACKS, source.fontId) ? source.fontId : DEFAULT_APPEARANCE.fontId;

  return {
    skin: normalizeSkinId(source.skin, DEFAULT_APPEARANCE.skin),
    paletteId: PALETTE_IDS.has(source.paletteId) ? source.paletteId : DEFAULT_APPEARANCE.paletteId,
    primary,
    primaryDark: normalizedHex(source.primaryDark, DEFAULT_APPEARANCE.primaryDark),
    primaryStrong: normalizedHex(source.primaryStrong, DEFAULT_APPEARANCE.primaryStrong),
    fontId,
    fontStack: FONT_STACKS[fontId],
    density: DENSITIES[density] ? density : DEFAULT_APPEARANCE.density,
    radius: Number.isFinite(Number(source.radius)) ? Math.min(1.4, Math.max(0, Number(source.radius))) : DEFAULT_APPEARANCE.radius,
    typeScale: clampTypeScale(source.typeScale),
    reduceMotion: source.reduceMotion === true,
    bubbleStyle: BUBBLE_STYLES.has(source.bubbleStyle) ? source.bubbleStyle : DEFAULT_APPEARANCE.bubbleStyle,
    inputStyle: INPUT_STYLES.has(source.inputStyle) ? source.inputStyle : DEFAULT_APPEARANCE.inputStyle,
    emptyStyle: EMPTY_STYLES.has(source.emptyStyle) ? source.emptyStyle : DEFAULT_APPEARANCE.emptyStyle,
    recentStyle: RECENT_STYLES.has(source.recentStyle) ? source.recentStyle : DEFAULT_APPEARANCE.recentStyle,
    articleLayout: ARTICLE_LAYOUTS.has(source.articleLayout) ? source.articleLayout : DEFAULT_APPEARANCE.articleLayout,
    editorMode: EDITOR_MODES.has(source.editorMode) ? source.editorMode : DEFAULT_APPEARANCE.editorMode,
  };
}

export function appearanceSnapshot(value) {
  const prefs = normalizeAppearance(value);
  const density = DENSITIES[prefs.density];
  const lightPrimary = prefs.primary;
  const darkPrimary = prefs.primaryDark;

  return {
    prefs,
    light: themeVars(lightPrimary, prefs.primaryStrong, prefs.radius, '#ffffff', 0.14),
    dark: themeVars(darkPrimary, lightPrimary, prefs.radius, '#1c1917', 0.2),
    root: {
      skin: prefs.skin,
      density: prefs.density,
      typeScale: String(prefs.typeScale),
      font: prefs.fontStack,
      pad: density.pad,
      rowGap: density.rowGap,
      reduceMotion: prefs.reduceMotion,
    },
  };
}

export function parseAppearance(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    if (parsed?.prefs && typeof parsed.prefs === 'object') return normalizeAppearance(parsed.prefs);
    if (parsed && typeof parsed === 'object' && ['skin', 'paletteId', 'fontId', 'density'].some((key) => Object.hasOwn(parsed, key))) {
      return normalizeAppearance(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

export function parseLegacyAppearance(serialized) {
  try {
    const parsed = JSON.parse(serialized);
    return parsed?.prefs ? normalizeAppearance(parsed.prefs) : null;
  } catch {
    return null;
  }
}

function themeVars(primary, strong, radius, foreground, softAlpha) {
  return {
    '--hn-primary': primary,
    '--hn-primary-soft': hexToRgba(primary, softAlpha),
    '--hn-primary-strong': strong,
    '--hn-primary-fg': foreground,
    '--hn-radius': `${radius}rem`,
    '--primary': primary,
    '--primary-foreground': foreground,
    '--ring': primary,
    '--chart-1': primary,
    '--chart-3': strong,
    '--sidebar-primary': primary,
    '--sidebar-primary-foreground': foreground,
    '--sidebar-ring': primary,
  };
}

function hexToRgba(hex, alpha) {
  const value = hex.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
