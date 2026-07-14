import { createHash } from 'node:crypto';

const STORE_KEY = Symbol.for('hanimo.authRateLimitStores.v2');
const MAX_BUCKETS = 5000;
const defaultStores = globalThis[STORE_KEY] || new Map();
globalThis[STORE_KEY] = defaultStores;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function authRateLimitConfig(env = process.env) {
  return {
    identityLimit: boundedInteger(env.HANIMO_AUTH_RATE_LIMIT_MAX, 10, 3, 100),
    distributedIdentityLimit: boundedInteger(
      env.HANIMO_AUTH_RATE_LIMIT_DISTRIBUTED_MAX,
      100,
      10,
      1000
    ),
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
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = (request.headers.get('x-forwarded-for') || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded.length === 0) return null;

  const trustedHops = boundedInteger(env.HANIMO_TRUST_PROXY_HOPS, 1, 1, 10);
  return forwarded[Math.max(0, forwarded.length - trustedHops)] || null;
}

export function authRateLimitKeys(scope, identity, clientAddress) {
  return {
    identityKey: rateLimitKey(`auth:${scope}:identity`, identity),
    identityClientKey: clientAddress
      ? rateLimitKey(`auth:${scope}:identity-client`, identity, clientAddress)
      : null,
    clientKey: clientAddress
      ? rateLimitKey(`auth:${scope}:client`, clientAddress)
      : null,
  };
}

export function rateLimitNamespace(key) {
  const parts = String(key || '').split(':').filter(Boolean);
  return parts[0] === 'auth' && parts[1]
    ? `auth:${parts[1]}`
    : (parts[0] || 'default');
}

function defaultStoreForKey(key) {
  const namespace = rateLimitNamespace(key);
  let store = defaultStores.get(namespace);
  if (!store) {
    store = new Map();
    defaultStores.set(namespace, store);
  }
  return store;
}

function prune(store, now) {
  if (store.size < MAX_BUCKETS) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export function consumeRateLimit(key, options = {}, suppliedStore) {
  const store = suppliedStore || defaultStoreForKey(key);
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 10;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  prune(store, now);

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && store.size >= MAX_BUCKETS) {
      let nextResetAt = now + windowMs;
      for (const existing of store.values()) {
        nextResetAt = Math.min(nextResetAt, existing.resetAt);
      }
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((nextResetAt - now) / 1000)),
      };
    }
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

export function clearRateLimit(key, suppliedStore) {
  const store = suppliedStore || defaultStoreForKey(key);
  store.delete(key);
}
