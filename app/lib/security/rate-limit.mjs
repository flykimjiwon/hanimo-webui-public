import { createHash } from 'node:crypto';

const STORE_KEY = Symbol.for('hanimo.authRateLimitStore');
const defaultStore = globalThis[STORE_KEY] || new Map();
globalThis[STORE_KEY] = defaultStore;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function authRateLimitConfig(env = process.env) {
  return {
    identityLimit: boundedInteger(env.HANIMO_AUTH_RATE_LIMIT_MAX, 10, 3, 100),
    clientLimit: boundedInteger(env.HANIMO_AUTH_RATE_LIMIT_CLIENT_MAX, 300, 20, 5000),
    windowMs: boundedInteger(env.HANIMO_AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000, 60 * 1000, 60 * 60 * 1000),
  };
}

export function rateLimitKey(scope, ...parts) {
  const digest = createHash('sha256')
    .update(parts.map((part) => String(part || '')).join('\u0000'))
    .digest('hex');
  return `${scope}:${digest}`;
}

export function trustedClientAddress(request, env = process.env) {
  if (env.HANIMO_TRUST_PROXY !== 'true') return null;
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function prune(store, now) {
  if (store.size < 5000) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function consumeRateLimit(key, options = {}, store = defaultStore) {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  prune(store, now);

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    store.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds: 0,
  };
}

export function clearRateLimit(key, store = defaultStore) {
  store.delete(key);
}
