const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotContains(relativePath, patterns) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    const found =
      pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
    assert(!found, `${relativePath} must not contain ${pattern.toString()}`);
  }
}

function assertContains(relativePath, patterns) {
  const source = read(relativePath);
  for (const pattern of patterns) {
    const found =
      pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
    assert(found, `${relativePath} must contain ${pattern.toString()}`);
  }
}

const tokenRoutes = [
  'app/api/user/api-tokens/route.js',
  'app/api/admin/api-tokens/route.js',
];

for (const route of tokenRoutes) {
  assertNotContains(route, [
    'decryptToken',
    'encryptToken',
    'originalToken',
    'encryptedToken',
    'encrypted_token',
    /\.substring\(0,\s*16\)/,
  ]);
  assertContains(route, ['hashApiToken(token)']);
}

assertContains('app/lib/apiTokenUtils.js', [
  'export function hashApiToken',
  'export function legacyHashApiToken',
  'ORDER BY LENGTH(token_hash) DESC',
  'UPDATE api_tokens SET last_used_at',
]);

for (const route of [
  'app/api/v1/models/route.js',
  'app/api/v1/completions/route.js',
  'app/api/v1/chat/completions/route.js',
]) {
  assertNotContains(route, [/function verifyApiToken/]);
  assertContains(route, ["import { verifyApiToken } from '@/lib/apiTokenUtils';"]);
}

assertNotContains('app/my-api-tokens/page.js', [
  'originalToken',
  /\bselectedApiToken\b/,
  'regenerate_needed',
  'key_available',
]);

assertNotContains('app/admin/api-tokens/page.js', ['originalToken']);

console.log('API token security regression checks passed.');
