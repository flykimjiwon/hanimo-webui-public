import { lookup } from 'node:dns/promises';
import net from 'node:net';

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'apiconfig',
  'authorization',
  'bearertoken',
  'clientsecret',
  'endpoint',
  'endpointurl',
  'headers',
  'inputmapping',
  'outputmapping',
  'password',
  'secret',
  'token',
  'url',
  'workflowid',
]);

class ScreenSecurityError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ScreenSecurityError';
    this.statusCode = statusCode;
  }
}

function parseDefinition(definition) {
  if (!definition) return {};
  if (typeof definition === 'string') {
    try {
      return JSON.parse(definition);
    } catch {
      return {};
    }
  }
  if (typeof definition !== 'object') return {};
  return definition;
}

function redactValue(value) {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;

  const redacted = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    redacted[key] = redactValue(child);
  }
  return redacted;
}

export function redactDefinitionForShare(definition) {
  const redacted = redactValue(parseDefinition(definition));
  return { ...redacted, endpoints: [] };
}

export function redactScreenForShare(screen) {
  const { access_password_hash, ...safeScreen } = screen;
  return {
    ...safeScreen,
    definition: redactDefinitionForShare(screen.definition),
  };
}

function parseAllowlist(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function hostnameMatchesAllowlist(hostname, allowlist) {
  if (allowlist.length === 0) return true;
  const lowerHost = hostname.toLowerCase();
  return allowlist.some((entry) => {
    if (entry.startsWith('*.')) return lowerHost.endsWith(entry.slice(1));
    if (entry.startsWith('.')) return lowerHost.endsWith(entry);
    return lowerHost === entry;
  });
}

function normalizeHostname(hostname) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((sum, part) => (sum << 8) + part, 0) >>> 0;
}

function inRange(ipNumber, base, maskBits) {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipNumber & mask) === (ipv4ToNumber(base) & mask);
}

function isBlockedIpv4(address) {
  const ipNumber = ipv4ToNumber(address);
  if (ipNumber === null) return true;
  return [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].some(([base, maskBits]) => inRange(ipNumber, base, maskBits));
}

function isBlockedIpv6(address) {
  const lower = address.toLowerCase();
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.') ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('ff')
  );
}

function isBlockedHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  );
}

function isBlockedIpAddress(address) {
  const normalized = normalizeHostname(address);
  const version = net.isIP(normalized);
  if (version === 4) return isBlockedIpv4(normalized);
  if (version === 6) return isBlockedIpv6(normalized);
  return false;
}

async function defaultResolveHostname(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function assertAllowedOutboundUrl(rawUrl, options = {}) {
  const env = options.env || process.env;
  const resolveHostname = options.resolveHostname || defaultResolveHostname;
  let parsed;

  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new ScreenSecurityError('올바른 custom endpoint URL이 아닙니다.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ScreenSecurityError('custom endpoint는 http/https URL만 허용됩니다.');
  }
  if (parsed.username || parsed.password) {
    throw new ScreenSecurityError('custom endpoint URL에는 인증 정보를 포함할 수 없습니다.');
  }

  const hostname = normalizeHostname(parsed.hostname);
  const allowlist = parseAllowlist(env.HANIMO_SCREEN_ENDPOINT_ALLOWLIST);
  if (!hostnameMatchesAllowlist(hostname, allowlist)) {
    throw new ScreenSecurityError('허용된 custom endpoint 호스트가 아닙니다.', 403);
  }
  if (isBlockedHostname(hostname) || isBlockedIpAddress(hostname)) {
    throw new ScreenSecurityError('비공개 네트워크 또는 로컬 custom endpoint는 허용되지 않습니다.', 403);
  }

  if (net.isIP(hostname) === 0) {
    const records = await resolveHostname(hostname);
    if (!Array.isArray(records) || records.length === 0) {
      throw new ScreenSecurityError('custom endpoint DNS 조회에 실패했습니다.');
    }
    if (records.some((record) => isBlockedIpAddress(record.address))) {
      throw new ScreenSecurityError('비공개 네트워크로 해석되는 custom endpoint는 허용되지 않습니다.', 403);
    }
  }

  return parsed.toString();
}

export function getScreenEndpointTimeoutMs(env = process.env) {
  const value = Number(env.HANIMO_SCREEN_ENDPOINT_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, 30000);
}

async function readLimitedText(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new ScreenSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new ScreenSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function readLimitedEndpointJson(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ScreenSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
  }

  const text = await readLimitedText(response, maxBytes);
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { value: text };
  }
}
