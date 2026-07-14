import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  authRateLimitKeys,
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

test('rate limiter preserves active buckets and isolates capacity by auth namespace', () => {
  const store = new Map();
  for (let index = 0; index < 5000; index += 1) {
    const result = consumeRateLimit(`identity:${index}`, {
      limit: 10,
      windowMs: 1000,
      now: 0,
    }, store);
    assert.equal(result.allowed, true);
  }
  const overflow = consumeRateLimit('identity:overflow', {
    limit: 10,
    windowMs: 1000,
    now: 0,
  }, store);
  assert.equal(overflow.allowed, false);
  assert.equal(store.size, 5000);
  assert.equal(store.has('identity:0'), true);
  assert.equal(store.has('identity:overflow'), false);
  for (let attempt = 1; attempt < 10; attempt += 1) {
    assert.equal(consumeRateLimit('identity:0', {
      limit: 10,
      windowMs: 1000,
      now: attempt,
    }, store).allowed, true);
  }
  assert.equal(consumeRateLimit('identity:0', {
    limit: 10,
    windowMs: 1000,
    now: 10,
  }, store).allowed, false);
  assert.equal(consumeRateLimit('identity:second-overflow', {
    limit: 10,
    windowMs: 1000,
    now: 10,
  }, store).allowed, false);
  assert.equal(consumeRateLimit('identity:0', {
    limit: 10,
    windowMs: 1000,
    now: 11,
  }, store).allowed, false);

  for (let index = 0; index < 5000; index += 1) {
    assert.equal(consumeRateLimit(`auth:capacity-a:identity:${index}`, {
      limit: 10,
      windowMs: 1000,
      now: 0,
    }).allowed, true);
  }
  assert.equal(consumeRateLimit('auth:capacity-a:identity:overflow', {
    limit: 10,
    windowMs: 1000,
    now: 0,
  }).allowed, false);
  assert.equal(consumeRateLimit('auth:capacity-b:identity:first', {
    limit: 10,
    windowMs: 1000,
    now: 0,
  }).allowed, true);
});

test('rate-limit configuration is bounded and forwarded IPs require explicit trust', () => {
  assert.deepEqual(authRateLimitConfig({}), {
    identityLimit: 10,
    distributedIdentityLimit: 100,
    clientLimit: 300,
    windowMs: 900000,
  });
  const incoming = request('https://hanimo.example/api/auth/login', {
    'x-forwarded-for': '203.0.113.8, 10.0.0.1',
  });
  assert.equal(trustedClientAddress(incoming, {}), null);
  assert.equal(trustedClientAddress(incoming, { HANIMO_TRUST_PROXY: 'true' }), '10.0.0.1');
  assert.equal(
    trustedClientAddress(incoming, {
      HANIMO_TRUST_PROXY: 'true',
      HANIMO_TRUST_PROXY_HOPS: '2',
    }),
    '203.0.113.8'
  );
  assert.equal(
    trustedClientAddress(request('https://hanimo.example', {
      'x-forwarded-for': '198.51.100.7',
      'x-real-ip': '192.0.2.9',
    }), { HANIMO_TRUST_PROXY: 'true' }),
    '192.0.2.9'
  );
});

test('identity limits keep a global account budget and add trusted-client pair budgets', () => {
  const direct = authRateLimitKeys('login', 'user@example.com', null);
  const proxied = authRateLimitKeys('login', 'user@example.com', '192.0.2.9');
  const spoofed = authRateLimitKeys('login', 'user@example.com', '198.51.100.7');

  assert.ok(direct.identityKey);
  assert.equal(direct.clientKey, null);
  assert.equal(direct.identityClientKey, null);
  assert.equal(proxied.identityKey, direct.identityKey);
  assert.equal(spoofed.identityKey, direct.identityKey);
  assert.notEqual(proxied.identityClientKey, spoofed.identityClientKey);
  assert.notEqual(proxied.clientKey, spoofed.clientKey);
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
  const checkEmail = await readFile(new URL('../../app/api/auth/check-email/route.js', import.meta.url), 'utf8');
  const signup = await readFile(new URL('../../app/signup/page.js', import.meta.url), 'utf8');
  assert.match(login, /consumeRateLimit/);
  assert.match(register, /consumeRateLimit/);
  assert.match(register, /REGISTER_GLOBAL_RATE_KEY/);
  assert.match(register, /!globalLimit\.allowed/);
  assert.ok(
    register.indexOf('!globalLimit.allowed') < register.lastIndexOf('authRateLimitKeys(')
  );
  assert.match(refresh, /consumeRateLimit/);
  assert.match(checkEmail, /consumeRateLimit/);
  assert.match(checkEmail, /Retry-After/);
  assert.match(checkEmail, /CHECK_EMAIL_ROUTE_RATE_KEY/);
  assert.doesNotMatch(checkEmail, /authRateLimitKeys/);
  assert.match(checkEmail, /checked: true/);
  assert.doesNotMatch(checkEmail, /available:|already registered|SELECT id FROM users/i);
  assert.doesNotMatch(signup, /\/api\/auth\/check-email|data\.available|emailCheckTimer/);
  assert.match(signup, /\/api\/auth\/register/);
  assert.match(register, /@\/lib\/departments\.mjs/);
  assert.match(signup, /@\/lib\/departments\.mjs/);
  assert.match(login, /Retry-After/);
  assert.match(login, /identityClientKey/);
  assert.match(login, /distributedIdentityLimit/);
  assert.doesNotMatch(login, /Email does not exist|Incorrect password/);
  assert.match(login, /DUMMY_PASSWORD_HASH/);
  assert.doesNotMatch(login, /This is an SSO account/);
});

test('signup, profile, and admin fallbacks share one canonical department contract', async () => {
  const [signup, profile, profileRoute, register, users, messages, analytics] = await Promise.all([
    readFile(new URL('../../app/signup/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/profile/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/user/profile/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/auth/register/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/admin/users/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/admin/messages/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/admin/analytics/page.js', import.meta.url), 'utf8'),
  ]);

  for (const source of [signup, profile, profileRoute, register, users, messages, analytics]) {
    assert.match(source, /@\/lib\/departments\.mjs/);
  }
  assert.doesNotMatch(profile, /value:\s*['"](?:개발팀|마케팅팀|재무팀|운영팀|프로덕트팀|기타)['"]/);
  assert.doesNotMatch(profileRoute, /Digital Service Development Department/);
});

test('department normalization preserves canonical codes and upgrades legacy values', async () => {
  const {
    DEFAULT_DEPARTMENTS,
    getAllowedDepartments,
    normalizeDepartment,
  } = await import('../../app/lib/departments.mjs');

  assert.deepEqual(DEFAULT_DEPARTMENTS, [
    'Engineering',
    'Marketing',
    'Finance',
    'Operations',
    'Product',
    'Other',
  ]);
  assert.equal(normalizeDepartment('개발팀'), 'Engineering');
  assert.equal(normalizeDepartment('Digital Service Development Department'), 'Engineering');
  assert.equal(normalizeDepartment('Engineering'), 'Engineering');
  assert.deepEqual(getAllowedDepartments({ ALLOWED_DEPARTMENTS: 'Research,Sales' }), ['Research', 'Sales']);
});

test('auth routes reject malformed payload types as client errors before normalization', async () => {
  const [checkEmail, register] = await Promise.all([
    readFile(new URL('../../app/api/auth/check-email/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/auth/register/route.js', import.meta.url), 'utf8'),
  ]);

  assert.match(checkEmail, /typeof email !== ['"]string['"]/);
  assert.match(register, /typeof email !== ['"]string['"]/);
  assert.match(register, /await request\.json\(\)[\s\S]*catch/);
});

test('installer entropy fallback does not use an early-closing pipe under pipefail', async () => {
  const install = await readFile(new URL('../../scripts/install.sh', import.meta.url), 'utf8');
  assert.match(install, /od -An -N32 -tx1 \/dev\/urandom \| tr -d/);
  assert.doesNotMatch(install, /\/dev\/urandom[^\n]*\|[^\n]*head -c/);
});
