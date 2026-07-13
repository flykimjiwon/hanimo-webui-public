import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_APPEARANCE,
  appearanceSnapshot,
  normalizeAppearance,
  parseAppearance,
  parseLegacyAppearance,
} from '../app/lib/appearance-contract.mjs';

test('appearance contract normalizes legacy and malformed preference axes', () => {
  const appearance = normalizeAppearance({
    skin: 'removed-skin',
    density: 'roomy',
    typeScale: 4,
    primary: 'not-a-colour',
  });

  assert.equal(appearance.skin, DEFAULT_APPEARANCE.skin);
  assert.equal(appearance.density, 'relaxed');
  assert.equal(appearance.typeScale, 1.25);
  assert.equal(appearance.primary, DEFAULT_APPEARANCE.primary);
});

test('appearance snapshot contains only deterministic root values and safe palette variables', () => {
  const snapshot = appearanceSnapshot({ density: 'compact', typeScale: 0.85, primary: '#0EA5E9' });

  assert.deepEqual(snapshot.root, {
    skin: 'warm-command-deck',
    density: 'compact',
    typeScale: '0.85',
    font: DEFAULT_APPEARANCE.fontStack,
    pad: '10px',
    rowGap: '6px',
    reduceMotion: false,
  });
  assert.equal(snapshot.light['--hn-primary'], '#0ea5e9');
  assert.equal(snapshot.light['--primary'], '#0ea5e9');
  assert.equal(snapshot.dark['--hn-primary'], DEFAULT_APPEARANCE.primaryDark);
});

test('appearance readers fail closed and retain legacy drawer preferences only', () => {
  assert.equal(parseAppearance('{invalid'), null);
  assert.equal(parseAppearance(JSON.stringify({ light: { '--primary': '#ffffff' } })), null);
  assert.equal(parseLegacyAppearance(JSON.stringify({ light: { '--primary': '#fff' } })), null);
  assert.equal(
    parseLegacyAppearance(JSON.stringify({ prefs: { skin: 'warm-command-deck', density: 'cozy' } })).skin,
    'warm-command-deck'
  );
});
