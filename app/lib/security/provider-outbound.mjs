import net from 'node:net';

import {
  assertAllowedOutboundUrl,
  fetchWithOutboundPolicy,
  isPrivateLanIpAddress,
  isLinkLocalIpAddress,
} from './outbound-policy.mjs';

const LOCAL_PROVIDER_HOSTS = new Set(['localhost', 'host.docker.internal']);
export const DEFAULT_PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;
export const MAX_PROVIDER_TIMEOUT_MS = 15 * 60 * 1000;

function normalizeHost(hostname) {
  return String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopback(address) {
  const host = normalizeHost(address);
  if (host === '::1') return true;
  if (net.isIP(host) !== 4) return false;
  return host.startsWith('127.');
}

function configuredLocalHosts(env) {
  return new Set(
    String(env.HANIMO_PROVIDER_LOCAL_ALLOWLIST || '')
      .split(',')
      .map(normalizeHost)
      .filter(Boolean)
  );
}

function isExplicitLocalEndpoint(rawUrl, env) {
  let hostname;
  try {
    hostname = normalizeHost(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
  return LOCAL_PROVIDER_HOSTS.has(hostname) || isLoopback(hostname) || configuredLocalHosts(env).has(hostname);
}

export function getProviderTimeoutMs(env = process.env) {
  const value = Number(env.HANIMO_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PROVIDER_TIMEOUT_MS;
  return Math.min(value, MAX_PROVIDER_TIMEOUT_MS);
}

function providerPolicyOptions(rawUrl, options) {
  const env = options.env || process.env;
  const explicitLocal = isExplicitLocalEndpoint(rawUrl, env);
  const allowlisted = configuredLocalHosts(env);

  return {
    ...options,
    env,
    timeoutMs: options.timeoutMs ?? getProviderTimeoutMs(env),
    isTrustedPrivateAddress(hostname, address) {
      if (!explicitLocal) return false;
      const normalizedHostname = normalizeHost(hostname);
      const normalizedAddress = normalizeHost(address);
      if (
        normalizedHostname === 'metadata.google.internal' ||
        isLinkLocalIpAddress(normalizedAddress)
      ) return false;
      const hostnameIsConfigured =
        LOCAL_PROVIDER_HOSTS.has(normalizedHostname) ||
        isLoopback(normalizedHostname) ||
        allowlisted.has(normalizedHostname);
      const hostnameProbe =
        normalizedAddress === normalizedHostname && net.isIP(normalizedAddress) === 0;
      if (hostnameProbe) return hostnameIsConfigured;
      if (!isPrivateLanIpAddress(normalizedAddress)) return false;
      return hostnameIsConfigured || allowlisted.has(normalizedAddress);
    },
  };
}

export function validateProviderEndpoint(rawUrl, options = {}) {
  return assertAllowedOutboundUrl(rawUrl, providerPolicyOptions(rawUrl, options));
}

export function fetchWithProviderPolicy(rawUrl, init = {}, options = {}) {
  return fetchWithOutboundPolicy(rawUrl, init, providerPolicyOptions(rawUrl, options));
}

export async function cancelProviderResponse(response) {
  if (typeof response?.body?.cancel !== 'function') return true;
  try {
    await response.body.cancel();
    return true;
  } catch {
    return false;
  }
}
