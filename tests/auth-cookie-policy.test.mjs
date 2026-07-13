import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldUseSecureAuthCookie } from '../app/lib/security/auth-cookie-policy.mjs';

function request(url, forwardedProto) {
  return {
    url,
    headers: new Headers(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
  };
}

test('local HTTP production public URL keeps auth cookie usable without weakening flags', () => {
  assert.equal(
    shouldUseSecureAuthCookie(request('http://127.0.0.1:3000/api/auth/login'), {
      NODE_ENV: 'production',
      HANIMO_PUBLIC_URL: 'http://127.0.0.1:3000',
    }),
    false
  );
});

test('HTTPS public URL always emits a Secure auth cookie', () => {
  assert.equal(
    shouldUseSecureAuthCookie(request('http://app:3000/api/auth/login'), {
      NODE_ENV: 'production',
      HANIMO_PUBLIC_URL: 'https://chat.example.com',
    }),
    true
  );
});

test('forwarded scheme is honored only from an explicitly trusted proxy', () => {
  const proxied = request('http://app:3000/api/auth/login', 'https');
  assert.equal(shouldUseSecureAuthCookie(proxied, { NODE_ENV: 'production', HANIMO_TRUST_PROXY: 'true' }), true);
  assert.equal(shouldUseSecureAuthCookie(proxied, { NODE_ENV: 'production', HANIMO_TRUST_PROXY: 'false' }), false);
});

test('development HTTP remains non-Secure', () => {
  assert.equal(
    shouldUseSecureAuthCookie(request('http://localhost:3000/api/auth/login'), { NODE_ENV: 'development' }),
    false
  );
});
