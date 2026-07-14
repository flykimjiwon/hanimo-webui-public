const THEME_KEY = 'theme';
const ALLOWED_THEMES = new Set(['dark', 'light']);

export function browserStorage(target = globalThis) {
  try {
    return target?.localStorage || null;
  } catch {
    return null;
  }
}

export function readThemePreference(storage) {
  try {
    const value = storage?.getItem(THEME_KEY) || null;
    return ALLOWED_THEMES.has(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeThemePreference(storage, theme) {
  if (!ALLOWED_THEMES.has(theme)) return false;
  try {
    storage?.setItem(THEME_KEY, theme);
    return Boolean(storage);
  } catch {
    return false;
  }
}
