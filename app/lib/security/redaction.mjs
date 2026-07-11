const DEFAULT_MAX_CONTENT_CHARS = 2048;
const DEFAULT_MAX_ARRAY_ITEMS = 50;
const DEFAULT_MAX_DEPTH = 8;
const OMIT = Symbol('omit');

export const DEFAULT_SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'apiconfig',
  'apitoken',
  'api_token',
  'access_token',
  'accesstoken',
  'authorization',
  'bearertoken',
  'client_secret',
  'clientsecret',
  'cookie',
  'endpoint',
  'endpointurl',
  'headers',
  'inputmapping',
  'outputmapping',
  'password',
  'secret',
  'set-cookie',
  'proxy-authorization',
  'proxyauthorization',
  'refresh_token',
  'refreshtoken',
  'token',
  'url',
  'workflowid',
]);

function maskEmbeddedSecrets(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[A-Za-z0-9._~+/=-]+/gi, 'Basic [REDACTED]')
    .replace(/([?&](?:api[_-]?key|token|secret|password|authorization|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(api[_-]?key|token|secret|password|authorization|cookie):\s*([^\s,;]+)/gi, '$1: [REDACTED]');
}

function isSensitiveKey(key, sensitiveKeys) {
  return sensitiveKeys.has(String(key).toLowerCase());
}

export function redactRecursive(value, options = {}) {
  const sensitiveKeys = options.sensitiveKeys || DEFAULT_SENSITIVE_KEYS;
  const replacement = options.replacement || '[REDACTED]';
  const omitSensitive = options.omitSensitive === true;
  const seen = new WeakSet();

  function visit(node, depth) {
    if (typeof node === 'string') return maskEmbeddedSecrets(node);
    if (!node || typeof node !== 'object') return node;
    if (seen.has(node)) return '[Circular]';
    if (depth >= (options.maxDepth || DEFAULT_MAX_DEPTH)) return '[MaxDepth]';

    seen.add(node);
    if (Array.isArray(node)) {
      return node
        .slice(0, options.maxArrayItems || DEFAULT_MAX_ARRAY_ITEMS)
        .map((item) => visit(item, depth + 1));
    }

    const redacted = {};
    for (const [key, child] of Object.entries(node)) {
      const nextValue = isSensitiveKey(key, sensitiveKeys)
        ? (omitSensitive ? OMIT : replacement)
        : visit(child, depth + 1);
      if (nextValue !== OMIT) redacted[key] = nextValue;
    }
    return redacted;
  }

  return visit(value, 0);
}

export function metadataOnly(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', length: value.length };
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return { type: 'buffer', bytes: value.byteLength };
  if (typeof value === 'string') return { type: 'string', chars: value.length };
  if (value && typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value).length };
  }
  return { type: typeof value };
}

function stringifyBoundedValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return JSON.stringify({ name: value.name, message: value.message });
  if (value instanceof Map) return JSON.stringify(Object.fromEntries(value));
  if (value instanceof Set) return JSON.stringify([...value]);
  const text = JSON.stringify(value, (_key, child) => {
    if (typeof child === 'bigint') return child.toString();
    if (child instanceof Map) return Object.fromEntries(child);
    if (child instanceof Set) return [...child];
    if (child instanceof Error) return { name: child.name, message: child.message };
    return child;
  });
  return text === undefined ? String(value) : text;
}

export function boundedContent(value, options = {}) {
  if (!options.includeContent) return metadataOnly(value);
  const maxChars = options.maxChars || DEFAULT_MAX_CONTENT_CHARS;
  const redacted = redactRecursive(value, options);
  const text = stringifyBoundedValue(redacted);
  return {
    content: text.length > maxChars ? `${text.slice(0, maxChars)}...[truncated]` : text,
    truncated: text.length > maxChars,
    chars: text.length,
  };
}
