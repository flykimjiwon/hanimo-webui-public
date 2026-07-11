function parseEndpoint(endpoint) {
  const parsed = new URL(String(endpoint || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new TypeError('Model server endpoint must use http or https.');
  }
  if (parsed.username || parsed.password) {
    throw new TypeError('Model server endpoint must not contain credentials.');
  }
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function trimPath(pathname) {
  return pathname.replace(/\/+$/, '');
}

export function buildOpenAiEndpoint(endpoint, resourcePath) {
  const parsed = parseEndpoint(endpoint);
  const resource = `/${String(resourcePath || '').replace(/^\/+/, '')}`;
  let basePath = trimPath(parsed.pathname);

  for (const suffix of ['/chat/completions', '/completions', '/embeddings', '/models']) {
    if (basePath.endsWith(suffix)) {
      basePath = trimPath(basePath.slice(0, -suffix.length));
      break;
    }
  }

  parsed.pathname = basePath ? `${basePath}${resource}` : `/v1${resource}`;
  return parsed.toString();
}

export function buildModelsUpstreamRequest({ endpoint, provider = 'model-server', apiKey = '' }) {
  const headers = { Accept: 'application/json' };

  if (provider === 'openai-compatible') {
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return {
      url: buildOpenAiEndpoint(endpoint, '/models'),
      headers,
    };
  }

  const parsed = parseEndpoint(endpoint);
  let basePath = trimPath(parsed.pathname);

  if (provider === 'gemini') {
    basePath = basePath
      .replace(/\/v1beta\/openai$/i, '')
      .replace(/\/v1beta$/i, '');
    parsed.pathname = `${trimPath(basePath)}/v1beta/models` || '/v1beta/models';
    if (apiKey) headers['x-goog-api-key'] = apiKey;
    return { url: parsed.toString(), headers };
  }

  basePath = basePath.replace(/\/api\/tags$/i, '').replace(/\/v1$/i, '');
  parsed.pathname = `${trimPath(basePath)}/api/tags` || '/api/tags';
  return { url: parsed.toString(), headers };
}

function toUnixSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toUnixSeconds(numeric);
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return Math.floor(timestamp / 1000);
  }
  return 0;
}

export function normalizeModelsResponse(payload, provider = 'model-server') {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];

  const data = source
    .filter((model) => {
      if (provider !== 'gemini') return true;
      return (
        !Array.isArray(model?.supportedGenerationMethods) ||
        model.supportedGenerationMethods.includes('generateContent')
      );
    })
    .map((model, index) => ({
      id: model?.id || model?.name || `model-${index}`,
      object: 'model',
      created: toUnixSeconds(model?.created ?? model?.modified_at),
      owned_by:
        model?.owned_by ||
        (provider === 'model-server' ? 'ollama' : provider),
    }));

  return { object: 'list', data };
}
