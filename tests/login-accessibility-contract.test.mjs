import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('login exposes one logical h1 and standard credential autocomplete hints', () => {
  const login = read('app/login/page.js');

  assert.equal((login.match(/<h1\b/g) || []).length, 1, 'login route must expose exactly one h1');
  assert.match(login, /<h2\b[^>]*>[\s\S]*?auth\.brand_title[\s\S]*?<\/h2>/);
  assert.match(login, /<h1\b[^>]*>[\s\S]*?auth\.login_title[\s\S]*?<\/h1>/);
  assert.match(login, /id='login-email'[\s\S]*?type='email'[\s\S]*?autoComplete='email'/);
  assert.match(login, /id='login-password'[\s\S]*?type='password'[\s\S]*?autoComplete='current-password'/);
});

test('final visual freshness gate includes login and chat entry sources', () => {
  const harness = read('.omo/evidence/visual-qa/run-final-capture.cjs');

  for (const source of ['app/page.js', 'app/login/page.js', 'app/hooks/useChatPage.js']) {
    assert.match(harness, new RegExp(`['\"]${source.replaceAll('/', '\\/')}['\"]`));
  }
});
