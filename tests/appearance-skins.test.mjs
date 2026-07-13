import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  appearanceSnapshot,
  normalizeAppearance,
} from '../app/lib/appearance-contract.mjs';
import { APPEARANCE_PREPAINT_SCRIPT } from '../app/lib/appearance-prepaint.mjs';
import { SKIN_IDS, SKIN_REGISTRY } from '../app/lib/appearance/skin-registry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXPECTED_SKINS = [
  'warm-command-deck',
  'graphite-terminal',
  'aurora-glass',
  'paper-ledger',
  'cobalt-studio',
  'honeycomb-focus',
  'mono-atelier',
  'moss-laboratory',
  'signal-orange',
];

test('skin registry exposes the exact allowlisted production IDs', () => {
  assert.deepEqual(SKIN_IDS, EXPECTED_SKINS);
  assert.deepEqual(SKIN_REGISTRY.map(({ id }) => id), EXPECTED_SKINS);
  assert.ok(SKIN_REGISTRY.every(({ labelKey }) => labelKey.startsWith('appearance.skin.')));
});

test('appearance normalization fails closed for malformed skin, font, and unknown keys', () => {
  const normalized = normalizeAppearance({
    skin: 'url(javascript:alert(1))',
    fontId: 'custom',
    fontStack: 'Comic Sans MS; color: red',
    '--hn-bg': 'hotpink',
    arbitraryCss: 'body { display: none }',
    reduceMotion: 'false',
  });

  assert.equal(normalized.skin, DEFAULT_APPEARANCE.skin);
  assert.equal(normalized.fontId, DEFAULT_APPEARANCE.fontId);
  assert.equal(normalized.fontStack, DEFAULT_APPEARANCE.fontStack);
  assert.equal(Object.hasOwn(normalized, '--hn-bg'), false);
  assert.equal(Object.hasOwn(normalized, 'arbitraryCss'), false);
  assert.equal(normalized.reduceMotion, false);
});

test('every registered skin has Korean and English labels and scoped CSS', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/lib/i18n/en.json'), 'utf8'));
  const ko = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/lib/i18n/ko.json'), 'utf8'));
  const css = fs.readFileSync(path.join(ROOT, 'app/styles/appearance-skins.css'), 'utf8');

  for (const skin of SKIN_REGISTRY) {
    const key = skin.labelKey.split('.').at(-1);
    assert.equal(typeof en.appearance.skin[key], 'string', `${skin.id} English label`);
    assert.equal(typeof ko.appearance.skin[key], 'string', `${skin.id} Korean label`);
    assert.match(css, new RegExp(`:root\\[data-hanimo-skin=['\"]${skin.id}['\"]\\]`));
  }

  assert.doesNotMatch(css, /(^|\n)\s*(?:body|:root)\s*\{/);
  assert.doesNotMatch(css, /--(?:primary|ring|hn-(?:primary|good|warn|error|info|font|mono))\s*:/);
});

test('prepaint replays only known values and writes the authoritative skin attribute', () => {
  const snapshot = appearanceSnapshot({
    skin: 'paper-ledger',
    fontId: 'serif',
    density: 'compact',
    primary: '#0ea5e9',
  });
  const expectedFont = snapshot.prefs.fontStack;
  snapshot.light['--evil'] = 'url(javascript:alert(1))';
  snapshot.prefs.fontStack = 'Comic Sans MS; color:red';
  const result = runPrepaint(JSON.stringify(snapshot));

  assert.equal(result.attributes['data-hanimo-skin'], 'paper-ledger');
  assert.equal(result.attributes['data-skin'], 'paper-ledger');
  assert.equal(result.styles['--hn-font'], expectedFont);
  assert.doesNotMatch(result.styles['--hn-font'], /Comic Sans/);
  assert.equal(result.styles['--hn-primary'], '#0ea5e9');
  assert.equal(result.styles['--evil'], undefined);
});

test('prepaint falls back deterministically for malformed and stale stored values', () => {
  const malformed = runPrepaint('{bad json');
  assert.equal(malformed.attributes['data-hanimo-skin'], DEFAULT_APPEARANCE.skin);

  const stale = runPrepaint(undefined, JSON.stringify({ prefs: { skin: 'retired-skin', density: 'roomy' } }));
  assert.equal(stale.attributes['data-hanimo-skin'], DEFAULT_APPEARANCE.skin);
  assert.equal(stale.attributes['data-density'], 'relaxed');
  assert.ok(stale.storage[APPEARANCE_STORAGE_KEY], 'legacy preference is migrated');
});

test('legacy prepaint migration preserves every supported normalized preference', () => {
  const legacy = {
    skin: 'cobalt-studio',
    paletteId: 'ocean',
    primary: '#0ea5e9',
    primaryDark: '#38bdf8',
    primaryStrong: '#0284c7',
    fontId: 'serif',
    density: 'compact',
    radius: 0.35,
    typeScale: 1.15,
    reduceMotion: true,
    bubbleStyle: 'plain',
    inputStyle: 'boxed',
    emptyStyle: 'minimal',
    recentStyle: 'compact',
    articleLayout: 'plain',
    editorMode: 'markdown',
  };
  const result = runPrepaint(undefined, JSON.stringify({ prefs: legacy }));
  const migrated = JSON.parse(result.storage[APPEARANCE_STORAGE_KEY]);

  assert.deepEqual(migrated.prefs, normalizeAppearance(legacy));
});

test('appearance reset dispatches reconciliation and SiteSettings reapplies cached site defaults', () => {
  const drawer = fs.readFileSync(path.join(ROOT, 'app/components/ThemeDrawer.js'), 'utf8');
  const siteSettings = fs.readFileSync(path.join(ROOT, 'app/components/SiteSettings.js'), 'utf8');

  assert.match(drawer, /dispatchEvent\(new CustomEvent\(APPEARANCE_RESET_EVENT_NAME\)\)/);
  assert.match(siteSettings, /addEventListener\(APPEARANCE_RESET_EVENT_NAME, handleAppearanceReset\)/);
  assert.match(siteSettings, /applyThemeColors\(cachedSiteThemeColors\)/);
  assert.match(siteSettings, /removeEventListener\(APPEARANCE_RESET_EVENT_NAME, handleAppearanceReset\)/);
});

test('layout and hydrated drawer share the authoritative skin attribute', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.js'), 'utf8');
  const drawer = fs.readFileSync(path.join(ROOT, 'app/components/ThemeDrawer.js'), 'utf8');

  assert.match(layout, /data-hanimo-skin='warm-command-deck'/);
  assert.match(layout, /__html: APPEARANCE_PREPAINT_SCRIPT/);
  assert.match(drawer, /root\.dataset\.hanimoSkin = snapshot\.root\.skin/);
});

function runPrepaint(serialized, legacySerialized) {
  const attributes = {};
  const styles = {};
  const storage = serialized === undefined ? {} : { [APPEARANCE_STORAGE_KEY]: serialized };
  if (legacySerialized !== undefined) storage['hanimo-webui-theme'] = legacySerialized;
  const root = {
    classList: {
      contains: () => false,
      add() {},
      remove() {},
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    toggleAttribute(name, enabled) {
      if (enabled) attributes[name] = '';
      else delete attributes[name];
    },
    style: { setProperty(name, value) { styles[name] = String(value); } },
  };
  const context = {
    document: { documentElement: root },
    localStorage: {
      getItem(key) { return storage[key] ?? null; },
      setItem(key, value) { storage[key] = String(value); },
    },
    matchMedia: () => ({ matches: false }),
    window: { matchMedia: () => ({ matches: false }) },
  };

  vm.runInNewContext(APPEARANCE_PREPAINT_SCRIPT, context);
  return { attributes, styles, storage };
}
