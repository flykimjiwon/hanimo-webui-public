import net from 'node:net';

import {
  assertAllowedOutboundUrl,
  fetchWithOutboundPolicy,
  isLinkLocalIpAddress,
} from './outbound-policy.mjs';

const LOCAL_PROVIDER_HOSTS = new Set(['localhost', 'host.docker.internal']);

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
  const hostname = normalizeHost(new URL(rawUrl).hostname);
  return LOCAL_PROVIDER_HOSTS.has(hostname) || isLoopback(hostname) || configuredLocalHosts(env).has(hostname);
}

function providerPolicyOptions(rawUrl, options) {
  const env = options.env || process.env;
  const explicitLocal = isExplicitLocalEndpoint(rawUrl, env);
  const allowlisted = configuredLocalHosts(env);

  return {
    ...options,
    env,
    timeoutEnvName: 'HANIMO_PROVIDER_TIMEOUT_MS',
    isTrustedPrivateAddress(hostname, address) {
      if (!explicitLocal) return false;
      const normalizedHostname = normalizeHost(hostname);
      const normalizedAddress = normalizeHost(address);
      if (
        normalizedHostname === 'metadata.google.internal' ||
        isLinkLocalIpAddress(normalizedAddress)
      ) return false;
      return (
        LOCAL_PROVIDER_HOSTS.has(normalizedHostname) ||
        isLoopback(normalizedHostname) ||
        isLoopback(normalizedAddress) ||
        allowlisted.has(normalizedHostname) ||
        allowlisted.has(normalizedAddress)
      );
    },
  };
}

export function validateProviderEndpoint(rawUrl, options = {}) {
  return assertAllowedOutboundUrl(rawUrl, providerPolicyOptions(rawUrl, options));
}

export function fetchWithProviderPolicy(rawUrl, init = {}, options = {}) {
  return fetchWithOutboundPolicy(rawUrl, init, providerPolicyOptions(rawUrl, options));
}
