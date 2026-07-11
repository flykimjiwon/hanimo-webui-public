import crypto from 'node:crypto';

export function generateOpaqueToken(prefix = 'hmo_', byteLength = 32) {
  if (prefix !== 'hmo_') throw new Error('Only hmo_ opaque tokens are supported');
  if (!Number.isInteger(byteLength) || byteLength < 32) {
    throw new Error('hmo_ tokens require at least 32 random bytes');
  }
  return `${prefix}${crypto.randomBytes(byteLength).toString('base64url')}`;
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hashOpaqueToken(token) {
  return sha256Hex(token);
}

export function legacyHashApiToken(token) {
  return sha256Hex(token).substring(0, 16);
}

export function legacySha256Hash(token) {
  return legacyHashApiToken(token);
}

export function verifySha256Hash(value, expectedHash) {
  const actual = Buffer.from(sha256Hex(value), 'hex');
  const expected = Buffer.from(String(expectedHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
