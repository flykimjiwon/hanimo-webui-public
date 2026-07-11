import {
  assertAllowedOutboundUrl as assertSharedAllowedOutboundUrl,
  fetchWithOutboundPolicy,
  getOutboundTimeoutMs,
  readLimitedJson,
} from './security/outbound-policy.mjs';
import { redactRecursive } from './security/redaction.mjs';

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

export function redactDefinitionForShare(definition) {
  const redacted = redactRecursive(parseDefinition(definition), { omitSensitive: true });
  return { ...redacted, endpoints: [] };
}

export function redactScreenForShare(screen) {
  const { access_password_hash, ...safeScreen } = screen;
  return {
    ...safeScreen,
    definition: redactDefinitionForShare(screen.definition),
  };
}

export async function assertAllowedOutboundUrl(rawUrl, options = {}) {
  try {
    return await assertSharedAllowedOutboundUrl(rawUrl, options);
  } catch (error) {
    throw new ScreenSecurityError(error.message, error.statusCode || 400);
  }
}

export function getScreenEndpointTimeoutMs(env = process.env) {
  return getOutboundTimeoutMs(env, 'HANIMO_SCREEN_ENDPOINT_TIMEOUT_MS');
}

export async function readLimitedEndpointJson(response, maxBytes) {
  try {
    return await readLimitedJson(response, maxBytes);
  } catch (error) {
    throw new ScreenSecurityError(error.message, error.statusCode || 400);
  }
}

export { fetchWithOutboundPolicy };
