import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  authRateLimitConfig,
  consumeRateLimit,
  rateLimitKey,
  trustedClientAddress,
} from '../../app/lib/security/rate-limit.mjs';
import {
  allowedRequestOrigins,
  isSameOriginRequest,
  isUnsafeMethod,
} from '../../app/lib/security/request-origin.mjs';

function request(url, headers = {}) {
  return { url, headers: new Headers(headers) };
}

test('same-origin policy accepts configured origins and rejects cross-site browser requests', () => {
  const local = request('https://hanimo.example/api/auth/refresh', {
    origin: 'https://hanimo.example',
    'sec-fetch-site': 'same-origin',
  });
  assert.equal(isSameOriginRequest(local, {}), true);
  assert.deepEqual([...allowedRequestOrigins(local, {})], ['https://hanimo.example']);

  const configured = request('http://app:3000/api/auth/login', {
    origin: 'https://chat.example.com',
  });
  assert.equal(isSameOriginRequest(configured, { HANIMO_PUBLIC_URL: 'https://chat.example.com/path' }), true);
  assert.equal(isSameOriginRequest(configured, {}), false);
  assert.equal(
    isSameOriginRequest(request('https://hanimo.example/api/auth/login', { 'sec-fetch-site': 'cross-site' }), {}),
    false
  );
  assert.equal(isSameOriginRequest(request('https://hanimo.example/api/v1/models'), {}), true);
  assert.equal(isUnsafeMethod('POST'), true);
  assert.equal(isUnsafeMethod('GET'), false);
});

test('rate limiter is bounded, returns retry-after, and resets after the window', () => {
  const store = new Map();
  const key = rateLimitKey('test', 'user@example.com');
  assert.equal(consumeRateLimit(key, { limit: 2, windowMs: 1000, now: 0 }, store).allowed, true);
  assert.equal(consumeRateLimit(key, { limit: 2, windowMs: 1000, now: 1 }, store).remaining, 0);
  const blocked = consumeRateLimit(key, { limit: 2, windowMs: 1000, now: 2 }, store);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(consumeRateLimit(key, { limit: 2, windowMs: 1000, now: 1000 }, store).allowed, true);
});

test('rate-limit configuration is bounded and forwarded IPs require explicit trust', () => {
  assert.deepEqual(authRateLimitConfig({}), {
    identityLimit: 10,
    clientLimit: 300,
    windowMs: 900000,
  });
  const incoming = request('https://hanimo.example/api/auth/login', {
    'x-forwarded-for': '203.0.113.8, 10.0.0.1',
  });
  assert.equal(trustedClientAddress(incoming, {}), null);
  assert.equal(trustedClientAddress(incoming, { HANIMO_TRUST_PROXY: 'true' }), '203.0.113.8');
});

test('middleware enforces origin checks for cookie and auth mutation paths without gating API keys', async () => {
  const middleware = await readFile(new URL('../../middleware.js', import.meta.url), 'utf8');
  assert.match(middleware, /CSRF_SENSITIVE_AUTH_PATHS/);
  assert.match(middleware, /hasSessionCookie/);
  assert.match(middleware, /!isSameOriginRequest\(request\)/);
  assert.match(middleware, /from ['"]jose\/jwt\/verify['"]/);
  assert.doesNotMatch(middleware, /CSRF_SENSITIVE_AUTH_PATHS[^]*api\/v1/);
});

test('auth routes apply rate limits and login errors do not enumerate local accounts', async () => {
  const login = await readFile(new URL('../../app/api/auth/login/route.js', import.meta.url), 'utf8');
  const register = await readFile(new URL('../../app/api/auth/register/route.js', import.meta.url), 'utf8');
  const refresh = await readFile(new URL('../../app/api/auth/refresh/route.js', import.meta.url), 'utf8');
  assert.match(login, /consumeRateLimit/);
  assert.match(register, /consumeRateLimit/);
  assert.match(refresh, /consumeRateLimit/);
  assert.match(login, /Retry-After/);
  assert.doesNotMatch(login, /Email does not exist|Incorrect password/);
});
