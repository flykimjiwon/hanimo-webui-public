import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  generateOpaqueToken,
  hashOpaqueToken,
  legacyHashApiToken,
} from '../../app/lib/security/tokens.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(source, expected, label) {
  const found = expected instanceof RegExp ? expected.test(source) : source.includes(expected);
  assert.equal(found, true, `${label} must contain ${expected.toString()}`);
}

function assertNotContains(source, unexpected, label) {
  const found = unexpected instanceof RegExp ? unexpected.test(source) : source.includes(unexpected);
  assert.equal(found, false, `${label} must not contain ${unexpected.toString()}`);
}

test('opaque API tokens are hmo-prefixed and stored as full SHA-256 hashes', () => {
  const token = generateOpaqueToken();
  const fullHash = hashOpaqueToken(token);
  const legacyHash = legacyHashApiToken(token);

  assert.match(token, /^hmo_[A-Za-z0-9_-]{43,}$/);
  assert.equal(fullHash.length, 64);
  assert.equal(legacyHash.length, 16);
  assert.equal(fullHash.startsWith(legacyHash), true);
});

test('user and admin issuance use opaque API keys without JWT coupling', () => {
  for (const relativePath of [
    'app/api/user/api-tokens/route.js',
    'app/api/admin/api-tokens/route.js',
  ]) {
    const source = read(relativePath);

    assertContains(source, 'generateApiToken()', relativePath);
    assertContains(source, 'hashApiToken(token)', relativePath);
    assertContains(source, 'RETURNING', relativePath);
    assertNotContains(source, "from 'jsonwebtoken'", relativePath);
    assertNotContains(source, 'jwt.sign', relativePath);
    assertNotContains(source, 'JWT_SECRET', relativePath);
    assertNotContains(source, 'encrypted_token', relativePath);
  }
});

test('verification looks up token hashes directly and joins current user identity', () => {
  const source = read('app/lib/apiTokenUtils.js');

  assertContains(source, 'const fullTokenHash = hashApiToken(token);', 'apiTokenUtils');
  assertContains(source, 'const legacyTokenHash = legacyHashApiToken(token);', 'apiTokenUtils');
  assertContains(source, 'WHERE api_tokens.token_hash IN', 'apiTokenUtils');
  assertContains(source, 'INNER JOIN users ON users.id = api_tokens.user_id', 'apiTokenUtils');
  assertContains(source, 'ORDER BY LENGTH(api_tokens.token_hash) DESC', 'apiTokenUtils');
  assertContains(source, 'UPDATE api_tokens SET last_used_at', 'apiTokenUtils');
  assertContains(source, 'email: apiToken.email', 'apiTokenUtils');
  assertContains(source, 'role: apiToken.role', 'apiTokenUtils');
  assertNotContains(source, "from 'jsonwebtoken'", 'apiTokenUtils');
  assertNotContains(source, 'jwt.verify', 'apiTokenUtils');
  assertNotContains(source, 'jwt.decode', 'apiTokenUtils');
  assertNotContains(source, 'JWT_SECRET', 'apiTokenUtils');
  assertNotContains(source, 'tokenPayload', 'apiTokenUtils');
});
