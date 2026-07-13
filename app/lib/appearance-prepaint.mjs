function prepaintAppearance() {
  try {
    var root = document.documentElement;
    var currentKey = 'hanimo-webui-appearance-v1';
    var legacyKey = 'hanimo-webui-theme';
    var defaultSkin = 'warm-command-deck';
    var skins = [defaultSkin, 'graphite-terminal', 'aurora-glass', 'paper-ledger', 'cobalt-studio', 'honeycomb-focus', 'mono-atelier', 'moss-laboratory', 'signal-orange'];
    var densities = { compact: ['10px', '6px'], cozy: ['14px', '10px'], relaxed: ['18px', '14px'], roomy: ['18px', '14px'] };
    var fonts = {
      pretendard: '"Pretendard Variable", "Pretendard", "Inter", -apple-system, sans-serif',
      system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
      'inter+pretendard': '"Inter", "Pretendard Variable", "Pretendard", sans-serif',
      serif: 'Georgia, "Times New Roman", "Noto Serif KR", serif',
    };
    var palettes = ['amber', 'sunset', 'rose', 'plum', 'ocean', 'forest', 'mint', 'graphite', 'custom'];
    var bubbleStyles = ['boxed', 'plain'];
    var inputStyles = ['boxed', 'rounded'];
    var emptyStyles = ['greet', 'cards', 'minimal', 'hero'];
    var recentStyles = ['rich', 'compact'];
    var articleLayouts = ['toc', 'plain'];
    var editorModes = ['rich', 'markdown'];
    var themeVars = ['--primary', '--primary-foreground', '--ring', '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring'];
    var hex = /^#[0-9a-f]{6}$/i;

    var mode = localStorage.getItem('theme');
    var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList[dark ? 'add' : 'remove']('dark');
    var lang = localStorage.getItem('hanimo-webui-lang');
    if (lang === 'ko' || lang === 'en') root.lang = lang;

    var raw = localStorage.getItem(currentKey);
    var parsed = parse(raw);
    var prefs = parsed && parsed.prefs ? parsed.prefs : isPreference(parsed) ? parsed : null;
    var fromLegacy = false;
    if (!prefs || typeof prefs !== 'object') {
      parsed = parse(localStorage.getItem(legacyKey));
      prefs = parsed && parsed.prefs ? parsed.prefs : null;
      fromLegacy = Boolean(prefs);
    }

    if (!prefs) {
      applySkin(defaultSkin);
      applySiteTheme(parsed, dark);
      return;
    }

    var skin = skins.indexOf(prefs.skin) >= 0 ? prefs.skin : defaultSkin;
    var density = densities[prefs.density] ? (prefs.density === 'roomy' ? 'relaxed' : prefs.density) : 'cozy';
    var scale = Number(prefs.typeScale);
    scale = Number.isFinite(scale) ? Math.min(1.25, Math.max(0.85, scale)) : 1;
    var fontId = Object.prototype.hasOwnProperty.call(fonts, prefs.fontId) ? prefs.fontId : 'pretendard';
    var primary = validHex(prefs.primary, '#f5a623');
    var primaryDark = validHex(prefs.primaryDark, '#f5be5b');
    var primaryStrong = validHex(prefs.primaryStrong, '#d99437');
    var activePrimary = dark ? primaryDark : primary;
    var activeStrong = dark ? primary : primaryStrong;
    var foreground = dark ? '#1c1917' : '#ffffff';

    applySkin(skin);
    root.setAttribute('data-density', density);
    root.style.setProperty('--type-scale', String(scale));
    root.style.setProperty('--hn-font', fonts[fontId]);
    root.style.setProperty('--hn-pad', densities[density][0]);
    root.style.setProperty('--hn-row-gap', densities[density][1]);
    root.toggleAttribute('data-reduce-motion', prefs.reduceMotion === true);
    set('--hn-primary', activePrimary);
    set('--hn-primary-soft', rgba(activePrimary, dark ? 0.2 : 0.14));
    set('--hn-primary-strong', activeStrong);
    set('--hn-primary-fg', foreground);
    set('--primary', activePrimary);
    set('--primary-foreground', foreground);
    set('--ring', activePrimary);
    set('--chart-1', activePrimary);
    set('--chart-3', activeStrong);
    set('--sidebar-primary', activePrimary);
    set('--sidebar-primary-foreground', foreground);
    set('--sidebar-ring', activePrimary);
    var radius = Number(prefs.radius);
    set('--hn-radius', String(Number.isFinite(radius) ? Math.min(1.4, Math.max(0, radius)) : 0.625) + 'rem');

    if (fromLegacy) localStorage.setItem(currentKey, JSON.stringify({ prefs: normalizedPrefs() }));

    function normalizedPrefs() {
      return {
        skin: skin,
        paletteId: allowed(prefs.paletteId, palettes, 'amber'),
        primary: primary,
        primaryDark: primaryDark,
        primaryStrong: primaryStrong,
        fontId: fontId,
        fontStack: fonts[fontId],
        density: density,
        radius: Number.isFinite(radius) ? Math.min(1.4, Math.max(0, radius)) : 0.625,
        typeScale: scale,
        reduceMotion: prefs.reduceMotion === true,
        bubbleStyle: allowed(prefs.bubbleStyle, bubbleStyles, 'boxed'),
        inputStyle: allowed(prefs.inputStyle, inputStyles, 'rounded'),
        emptyStyle: allowed(prefs.emptyStyle, emptyStyles, 'greet'),
        recentStyle: allowed(prefs.recentStyle, recentStyles, 'rich'),
        articleLayout: allowed(prefs.articleLayout, articleLayouts, 'toc'),
        editorMode: allowed(prefs.editorMode, editorModes, 'rich'),
      };
    }
    function applySkin(value) {
      root.setAttribute('data-hanimo-skin', value);
      root.setAttribute('data-skin', value);
    }
    function applySiteTheme(value, isDark) {
      var vars = value && value[isDark ? 'dark' : 'light'];
      if (!vars || typeof vars !== 'object') return;
      for (var index = 0; index < themeVars.length; index += 1) {
        var name = themeVars[index];
        if (validHex(vars[name], null)) set(name, vars[name].toLowerCase());
      }
    }
    function parse(value) {
      try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
    }
    function isPreference(value) {
      return value && typeof value === 'object' && ['skin', 'paletteId', 'fontId', 'density'].some(function (key) { return Object.prototype.hasOwnProperty.call(value, key); });
    }
    function validHex(value, fallback) {
      return typeof value === 'string' && hex.test(value) ? value.toLowerCase() : fallback;
    }
    function allowed(value, values, fallback) {
      return values.indexOf(value) >= 0 ? value : fallback;
    }
    function rgba(value, alpha) {
      var rawHex = value.slice(1);
      return 'rgba(' + parseInt(rawHex.slice(0, 2), 16) + ', ' + parseInt(rawHex.slice(2, 4), 16) + ', ' + parseInt(rawHex.slice(4, 6), 16) + ', ' + alpha + ')';
    }
    function set(name, value) { root.style.setProperty(name, value); }
  } catch (_) {
    try {
      document.documentElement.setAttribute('data-hanimo-skin', 'warm-command-deck');
      document.documentElement.setAttribute('data-skin', 'warm-command-deck');
    } catch (_) {}
  }
}

export const APPEARANCE_PREPAINT_SCRIPT = `(${prepaintAppearance.toString()})();`;
