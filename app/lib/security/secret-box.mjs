import crypto from 'node:crypto';

const VERSION = 'hmo_box_v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

class SecretBoxError extends Error {
  constructor(message = 'Secret decryption failed') {
    super(message);
    this.name = 'SecretBoxError';
  }
}

function readKey(env = process.env) {
  const raw = env.HANIMO_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw) throw new SecretBoxError('HANIMO_CREDENTIAL_ENCRYPTION_KEY is required');

  const candidates = [];
  if (/^[a-f0-9]{64}$/i.test(raw)) candidates.push(Buffer.from(raw, 'hex'));
  candidates.push(Buffer.from(raw, 'base64'));
  candidates.push(Buffer.from(raw, 'utf8'));

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) throw new SecretBoxError('HANIMO_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

export function encryptSecret(plaintext, options = {}) {
  const value = String(plaintext ?? '');
  const key = readKey(options.env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(boxed, options = {}) {
  if (typeof boxed !== 'string' || !boxed.startsWith(`${VERSION}.`)) {
    throw new SecretBoxError();
  }

  const [, ivText, tagText, dataText] = boxed.split('.');
  if (!ivText || !tagText || dataText === undefined) throw new SecretBoxError();

  try {
    const key = readKey(options.env);
    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    const encrypted = Buffer.from(dataText, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof SecretBoxError) throw error;
    throw new SecretBoxError();
  }
}

export function encryptOptionalSecret(value, options = {}) {
  if (value === undefined || value === null || value === '') return '';
  return encryptSecret(value, options);
}

export function decryptOptionalSecret(value, options = {}) {
  if (value === undefined || value === null || value === '') return '';
  return decryptSecret(value, options);
}
