import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readThemePreference,
  writeThemePreference,
} from '../app/lib/theme-storage.mjs';

test('theme storage degrades safely when browser storage is blocked', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };

  assert.equal(readThemePreference(blocked), null);
  assert.equal(writeThemePreference(blocked, 'dark'), false);
});

test('theme storage only accepts known theme preferences', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(writeThemePreference(storage, 'dark'), true);
  assert.equal(readThemePreference(storage), 'dark');
  values.set('theme', 'unexpected');
  assert.equal(readThemePreference(storage), null);
  assert.equal(writeThemePreference(storage, 'unexpected'), false);
});
