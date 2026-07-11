import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateOpaqueToken,
  hashOpaqueToken,
  legacyHashApiToken,
  legacySha256Hash,
  sha256Hex,
  verifySha256Hash,
} from '../../app/lib/security/tokens.mjs';

test('generateOpaqueToken emits hmo_ opaque tokens', () => {
  const token = generateOpaqueToken();
  assert.match(token, /^hmo_[A-Za-z0-9_-]+$/);
  assert.notEqual(token, generateOpaqueToken());
  assert.throws(() => generateOpaqueToken('hmo_', 31), /at least 32 random bytes/);
});

test('sha256 helpers produce full hashes and verify legacy values', () => {
  const hash = sha256Hex('abc');
  assert.equal(hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hashOpaqueToken('abc'), hash);
  assert.equal(legacyHashApiToken('abc'), 'ba7816bf8f01cfea');
  assert.equal(legacySha256Hash('abc'), 'ba7816bf8f01cfea');
  assert.equal(verifySha256Hash('abc', hash), true);
  assert.equal(verifySha256Hash('abcd', hash), false);
});
