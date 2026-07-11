import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptOptionalSecret,
  decryptSecret,
  encryptOptionalSecret,
  encryptSecret,
} from '../../app/lib/security/secret-box.mjs';

const env = { HANIMO_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') };
const wrongEnv = { HANIMO_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') };

test('AES-256-GCM secret box round trips versioned ciphertext only', () => {
  const boxed = encryptSecret('super-secret', { env });
  assert.match(boxed, /^hmo_box_v1\./);
  assert.equal(decryptSecret(boxed, { env }), 'super-secret');
  assert.throws(() => decryptSecret('super-secret', { env }), /Secret decryption failed/);
});

test('secret box fails closed on tamper wrong key and missing key', () => {
  const boxed = encryptSecret('super-secret', { env });
  const parts = boxed.split('.');
  parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
  const tampered = parts.join('.');
  assert.throws(() => decryptSecret(tampered, { env }), /Secret decryption failed/);
  assert.throws(() => decryptSecret(boxed, { env: wrongEnv }), /Secret decryption failed/);
  assert.throws(() => encryptSecret('x', { env: {} }), /HANIMO_CREDENTIAL_ENCRYPTION_KEY/);
});

test('optional empty secret is allowed without encryption fallback', () => {
  assert.equal(encryptOptionalSecret('', { env: {} }), '');
  assert.equal(decryptOptionalSecret('', { env: {} }), '');
});
