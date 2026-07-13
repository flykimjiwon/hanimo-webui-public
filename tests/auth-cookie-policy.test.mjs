import assert from 'node:assert/strict';
import test from 'node:test';

import {
  effectiveRequestProtocol,
  shouldUseSecureAuthCookie,
} from '../app/lib/security/auth-cookie-policy.mjs';

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

test('configured HTTP cannot downgrade an actual HTTPS request', () => {
  assert.equal(
    shouldUseSecureAuthCookie(request('https://chat.example.com/api/auth/login'), {
      HANIMO_PUBLIC_URL: 'http://chat.example.com',
    }),
    true
  );
});

test('custom and invalid configured schemes fall back to the request protocol', () => {
  const secureRequest = request('https://chat.example.com/api/auth/login');

  assert.equal(effectiveRequestProtocol(secureRequest, { HANIMO_PUBLIC_URL: 'ftp://chat.example.com' }), 'https:');
  assert.equal(effectiveRequestProtocol(secureRequest, { HANIMO_PUBLIC_URL: 'not a URL' }), 'https:');
});
