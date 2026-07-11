function endpointUrlIdentity(endpoint = {}) {
  const rawUrl = String(endpoint.url || '').trim();
  let url = rawUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.search = '';
    parsed.hash = '';
    url = parsed.toString().replace(/\/+$/, '');
  } catch {
    // Validation is owned by the settings route; identity matching stays best-effort.
  }
  return url;
}

export function maskCustomEndpointSecrets(endpoints = []) {
  return (Array.isArray(endpoints) ? endpoints : []).map((endpoint) => {
    const { apiKey, clearApiKey: _clearApiKey, ...safeEndpoint } = endpoint || {};
    return {
      ...safeEndpoint,
      apiKeySet: typeof apiKey === 'string' && apiKey.length > 0,
    };
  });
}

export function resolveCustomEndpointSecret(incoming, existingEndpoints = []) {
  if (incoming?.clearApiKey === true) return '';
  if (typeof incoming?.apiKey === 'string' && incoming.apiKey.trim()) {
    return incoming.apiKey.trim();
  }

  const identity = endpointUrlIdentity(incoming);
  const existing = (Array.isArray(existingEndpoints) ? existingEndpoints : []).find(
    (endpoint) => endpointUrlIdentity(endpoint) === identity
  );
  return typeof existing?.apiKey === 'string' ? existing.apiKey : '';
}
