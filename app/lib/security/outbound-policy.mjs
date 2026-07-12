import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

export const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 10000;
export const DEFAULT_MAX_REDIRECTS = 3;

export class OutboundSecurityError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'OutboundSecurityError';
    this.statusCode = statusCode;
  }
}

function parseAllowlist(value = '') {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim().toLowerCase()).filter(Boolean);
  return String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function hostnameMatchesAllowlist(hostname, allowlist) {
  if (allowlist.length === 0) return true;
  const lowerHost = hostname.toLowerCase();
  return allowlist.some((entry) => {
    if (entry.startsWith('*.')) return lowerHost.endsWith(entry.slice(1)) && lowerHost !== entry.slice(2);
    if (entry.startsWith('.')) return lowerHost.endsWith(entry) && lowerHost !== entry.slice(1);
    return lowerHost === entry;
  });
}

function normalizeHostname(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function ipv4ToNumber(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((sum, part) => (sum << 8) + part, 0) >>> 0;
}

function inIpv4Range(ipNumber, base, maskBits) {
  const baseNumber = ipv4ToNumber(base);
  if (baseNumber === null) return false;
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (ipNumber & mask) === (baseNumber & mask);
}

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isBlockedIpv4(address) {
  const ipNumber = ipv4ToNumber(address);
  if (ipNumber === null) return true;
  return BLOCKED_IPV4_RANGES.some(([base, bits]) => inIpv4Range(ipNumber, base, bits));
}

function parseIpv6(address) {
  const zoneFree = address.split('%')[0].toLowerCase();
  const mapped = zoneFree.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return { mappedIpv4: mapped[1] };

  const parts = zoneFree.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const parsePart = (part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    return Number.parseInt(part, 16);
  };
  const leftNumbers = left.map(parsePart);
  const rightNumbers = right.map(parsePart);
  if (leftNumbers.includes(null) || rightNumbers.includes(null)) return null;
  const missing = 8 - leftNumbers.length - rightNumbers.length;
  if (parts.length === 1 && missing !== 0) return null;
  if (parts.length === 2 && missing < 1) return null;
  return [...leftNumbers, ...Array(Math.max(0, missing)).fill(0), ...rightNumbers];
}

function ipv6StartsWith(groups, prefixGroups, prefixBits) {
  let remaining = prefixBits;
  for (let index = 0; index < 8 && remaining > 0; index += 1) {
    const bits = Math.min(16, remaining);
    const mask = (0xffff << (16 - bits)) & 0xffff;
    if ((groups[index] & mask) !== (prefixGroups[index] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

function groupsFromPrefix(prefix) {
  const groups = parseIpv6(prefix);
  return Array.isArray(groups) ? groups : null;
}

const BLOCKED_IPV6_RANGES = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].map(([prefix, bits]) => [groupsFromPrefix(prefix), bits]);

function isBlockedIpv6(address) {
  const parsed = parseIpv6(address);
  if (!parsed) return true;
  if (parsed.mappedIpv4) return isBlockedIpv4(parsed.mappedIpv4);
  return BLOCKED_IPV6_RANGES.some(([prefixGroups, bits]) => prefixGroups && ipv6StartsWith(parsed, prefixGroups, bits));
}

function isBlockedHostname(hostname) {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  );
}

export function isBlockedIpAddress(address) {
  const normalized = normalizeHostname(address);
  const version = net.isIP(normalized);
  if (version === 4) return isBlockedIpv4(normalized);
  if (version === 6) return isBlockedIpv6(normalized);
  return false;
}

export function isLinkLocalIpAddress(address) {
  const normalized = normalizeHostname(address);
  if (net.isIP(normalized) === 4) return normalized.startsWith('169.254.');
  if (net.isIP(normalized) !== 6) return false;
  const parsed = parseIpv6(normalized);
  if (!parsed) return true;
  if (parsed.mappedIpv4) return isLinkLocalIpAddress(parsed.mappedIpv4);
  if ((parsed[0] & 0xffc0) === 0xfe80) return true;
  const mapped = parsed.slice(0, 5).every((group) => group === 0) && parsed[5] === 0xffff;
  return mapped && (parsed[6] >> 8) === 169 && (parsed[6] & 0xff) === 254;
}

async function defaultResolveHostname(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

async function fetchPinned(rawUrl, init = {}, options = {}) {
  const parsed = new URL(rawUrl);
  const resolveHostname = options.resolveHostname || defaultResolveHostname;
  let address = parsed.hostname;
  let family = net.isIP(address);
  if (family === 0) {
    const records = await resolveHostname(address);
    const record = records?.find((item) => item?.address && (
      !isBlockedIpAddress(item.address) || options.isTrustedPrivateAddress?.(parsed.hostname, item.address)
    ));
    if (!record) throw new OutboundSecurityError('custom endpoint DNS did not resolve to a public address.', 403);
    address = record.address;
    family = net.isIP(address);
  }

  const transport = parsed.protocol === 'https:' ? https : http;
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());
  const requestOptions = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || undefined,
    path: `${parsed.pathname}${parsed.search}`,
    method: init.method || 'GET',
    headers,
    servername: parsed.hostname,
    lookup: (_hostname, _options, callback) => callback(null, address, family),
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(requestOptions, (response) => {
      resolve(new Response(Readable.toWeb(response), {
        status: response.statusCode || 502,
        statusText: response.statusMessage || '',
        headers: response.headers,
      }));
    });
    const abort = () => request.destroy(new Error('The outbound request was aborted.'));
    if (init.signal) {
      if (init.signal.aborted) return abort();
      init.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => init.signal.removeEventListener('abort', abort));
    }
    request.once('error', reject);
    if (init.body !== undefined && init.body !== null) request.write(init.body);
    request.end();
  });
}

export async function assertAllowedOutboundUrl(rawUrl, options = {}) {
  const env = options.env || process.env;
  const resolveHostname = options.resolveHostname || defaultResolveHostname;
  let parsed;

  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new OutboundSecurityError(options.invalidUrlMessage || '올바른 custom endpoint URL이 아닙니다.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new OutboundSecurityError(options.schemeMessage || 'custom endpoint는 http/https URL만 허용됩니다.');
  }
  if (parsed.username || parsed.password) {
    throw new OutboundSecurityError(options.credentialsMessage || 'custom endpoint URL에는 인증 정보를 포함할 수 없습니다.');
  }

  const hostname = normalizeHostname(parsed.hostname);
  const trustsPrivateAddress = (address) => options.isTrustedPrivateAddress?.(hostname, address) === true;
  const allowlist = parseAllowlist(options.allowlist ?? env.HANIMO_SCREEN_ENDPOINT_ALLOWLIST);
  if (!hostnameMatchesAllowlist(hostname, allowlist)) {
    throw new OutboundSecurityError(options.allowlistMessage || '허용된 custom endpoint 호스트가 아닙니다.', 403);
  }
  if ((isBlockedHostname(hostname) || isBlockedIpAddress(hostname)) && !trustsPrivateAddress(hostname)) {
    throw new OutboundSecurityError(options.privateNetworkMessage || '비공개 네트워크 또는 로컬 custom endpoint는 허용되지 않습니다.', 403);
  }

  if (net.isIP(hostname) === 0) {
    let records;
    try {
      records = await resolveHostname(hostname);
    } catch {
      throw new OutboundSecurityError(options.dnsFailureMessage || 'custom endpoint DNS 조회에 실패했습니다.');
    }
    if (!Array.isArray(records) || records.length === 0) {
      throw new OutboundSecurityError(options.dnsFailureMessage || 'custom endpoint DNS 조회에 실패했습니다.');
    }
    if (records.some((record) => !record?.address || (
      isBlockedIpAddress(record.address) && !trustsPrivateAddress(record.address)
    ))) {
      throw new OutboundSecurityError(options.privateDnsMessage || '비공개 네트워크로 해석되는 custom endpoint는 허용되지 않습니다.', 403);
    }
  }

  return parsed.toString();
}

export function getOutboundTimeoutMs(env = process.env, name = 'HANIMO_SCREEN_ENDPOINT_TIMEOUT_MS') {
  const value = Number(env[name]);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, 30000);
}

export async function readLimitedText(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new OutboundSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new OutboundSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
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
      throw new OutboundSecurityError('custom endpoint 응답이 너무 큽니다.', 502);
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

export async function readLimitedJson(response, maxBytes = DEFAULT_MAX_RESPONSE_BYTES) {
  const text = await readLimitedText(response, maxBytes);
  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { value: text };
  }
}

function composeAbortSignals(signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length === 0) return { signal: undefined, cleanup() {} };

  const controller = new AbortController();
  const abort = () => controller.abort();
  const listeners = [];
  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
    listeners.push(signal);
  }

  return {
    signal: controller.signal,
    cleanup() {
      for (const signal of listeners) signal.removeEventListener('abort', abort);
    },
  };
}

async function cancelResponseBody(response) {
  try {
    await response.body?.cancel?.();
  } catch {
    // Best-effort cleanup before following or rejecting redirects.
  }
}

export async function fetchWithOutboundPolicy(rawUrl, init = {}, options = {}) {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let currentUrl = await assertAllowedOutboundUrl(rawUrl, options);
  let requestInit = { ...init };

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const timeoutMs = options.timeoutMs || getOutboundTimeoutMs(options.env, options.timeoutEnvName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const composite = composeAbortSignals([init.signal, controller.signal]);
    let response;
    try {
      response = await (options.fetch || ((url, request) => fetchPinned(url, request, options)))(currentUrl, {
        ...requestInit,
        redirect: 'manual',
        signal: composite.signal,
      });
    } finally {
      clearTimeout(timer);
      composite.cleanup();
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await cancelResponseBody(response);
    if (!location) return response;
    if (redirectCount === maxRedirects) {
      throw new OutboundSecurityError('custom endpoint redirect limit exceeded', 502);
    }
    const nextUrl = await assertAllowedOutboundUrl(new URL(location, currentUrl).toString(), options);
    if ([301, 302, 303].includes(response.status) && !['GET', 'HEAD'].includes(String(requestInit.method || 'GET').toUpperCase())) {
      const { headers: _headers, body: _body, ...withoutBody } = requestInit;
      requestInit = { ...withoutBody, method: 'GET' };
    }
    if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
      const headers = new Headers(requestInit.headers || {});
      for (const name of [
        'authorization',
        'cookie',
        'proxy-authorization',
        'x-goog-api-key',
        'x-api-key',
        'api-key',
      ]) headers.delete(name);
      requestInit = { ...requestInit, headers };
    }
    currentUrl = nextUrl;
  }

  throw new OutboundSecurityError('custom endpoint redirect limit exceeded', 502);
}
