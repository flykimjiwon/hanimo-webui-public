import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifySetupToken } from '../../app/lib/security/setup-token.mjs';

test('setup token requires an exact configured secret of sufficient length', () => {
  const token = 'a'.repeat(64);
  assert.equal(verifySetupToken(token, token), true);
  assert.equal(verifySetupToken('b'.repeat(64), token), false);
  assert.equal(verifySetupToken('', token), false);
  assert.equal(verifySetupToken(token, ''), false);
  assert.equal(verifySetupToken('short', 'short'), false);
});

test('first-admin API and setup form exchange the token only through a header', async () => {
  const [route, page] = await Promise.all([
    readFile(new URL('../../app/api/auth/create-first-admin/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/setup/page.js', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /x-hanimo-setup-token/);
  assert.match(route, /HANIMO_SETUP_TOKEN/);
  assert.match(page, /X-Hanimo-Setup-Token/);
  assert.doesNotMatch(page, /localStorage\.setItem\(['"]setup/);
});
