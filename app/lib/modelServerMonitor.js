import logger from '@/lib/logger';
import { query } from './postgres';

// Docker environment detection function
function isDockerEnvironment() {
  if (typeof process !== 'undefined') {
    if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST) {
      return true;
    }
    try {
      if (typeof require !== 'undefined') {
        const fs = require('fs');
        if (fs.existsSync && fs.existsSync('/.dockerenv')) {
          return true;
        }
      }
    } catch (e) {
      logger.debug(
        '[Model Server Monitor] Docker env check failed:',
        e.message
      );
    }
  }
  return false;
}

// Convert localhost to host.docker.internal in Docker environments
function normalizeEndpointUrl(url) {
  if (!url) return url;

  // Convert only in Docker environments
  if (isDockerEnvironment()) {
    // Convert localhost or 127.0.0.1 to host.docker.internal
    const normalized = url
      .replace(/^http:\/\/localhost:/, 'http://host.docker.internal:')
      .replace(/^http:\/\/127\.0\.0\.1:/, 'http://host.docker.internal:')
      .replace(/^https:\/\/localhost:/, 'https://host.docker.internal:')
      .replace(/^https:\/\/127\.0\.0\.1:/, 'https://host.docker.internal:');

    if (normalized !== url) {
      logger.info(
        `[Model Server Monitor] URL converted in Docker environment: ${url} -> ${normalized}`
      );
    }

    return normalized;
  }

  return url;
}

// Parse model server endpoints from DB settings
export async function getModelServerEndpoints() {
  let raw = '';

  // In server environments, load only from DB settings
  if (typeof window === 'undefined') {
    try {
      const settingsResult = await query(
        "SELECT custom_endpoints, ollama_endpoints, COALESCE(ollama_endpoints, '') as llm_endpoints FROM settings WHERE config_type = $1 LIMIT 1",
        ['general']
      );
      const settings =
        settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;

      // Prefer customEndpoints; use legacy field if missing
      const customEndpoints = settings?.custom_endpoints || null;
      if (
        customEndpoints &&
        Array.isArray(customEndpoints) &&
        customEndpoints.length > 0
      ) {
        raw = customEndpoints
          .filter(
            (e) =>
              e?.url &&
              e.provider !== 'openai-compatible' &&
              e.isActive !== false
          )
          .map((e) => (e.name ? `${e.name}|${e.url}` : e.url))
          .join(',');
      } else if (settings?.ollama_endpoints || settings?.llm_endpoints) {
        raw = settings?.ollama_endpoints || settings?.llm_endpoints || '';
      }
    } catch (e) {
      logger.warn(
        '[Model Server Monitor] Failed to load model servers from DB:',
        e.message
      );
    }
  }

  const entries = raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const mapped = entries
    .map((entry) => {
      // Supported formats:
      // 1) http://host:port
      // 2) name|http://host:port
      // 3) name=http://host:port
      // 4) Unicode delimiters supported: ｜(U+FF5C), ＝(U+FF1D)
      // 5) If delimiter parsing fails, force split at http(s):// position (fallback)
      let raw = entry.trim();
      // Remove surrounding quotes
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'")) ||
        (raw.startsWith('`') && raw.endsWith('`'))
      ) {
        raw = raw.slice(1, -1).trim();
      }

      let name = null;
      let urlText = raw;

      // Try delimiter-based matching first
      const sepMatch = raw.match(/^(.*?)\s*[|=｜＝]\s*(https?:\/\/.+)$/i);
      if (sepMatch) {
        name = (sepMatch[1] || '').trim();
        urlText = (sepMatch[2] || '').trim();
      } else {
        // Fallback: force split at the http(s):// start position
        const httpIndex = raw.search(/https?:\/\//i);
        if (httpIndex > 0) {
          const before = raw.slice(0, httpIndex).trim();
          const after = raw.slice(httpIndex).trim();
          // Remove trailing delimiter from before
          const cleanedBefore = before.replace(/[|=｜＝]\s*$/u, '').trim();
          if (cleanedBefore.length > 0) {
            name = cleanedBefore;
          }
          urlText = after;
        }
      }

      try {
        const url = new URL(urlText);
        return {
          id: `model-server-${url.hostname}-${url.port}`,
          url: urlText,
          host: url.hostname,
          port: url.port,
          name: name || `Model Server ${url.port}`,
        };
      } catch (e) {
        logger.warn('[Model Server Monitor] Ignoring invalid model server:', entry);
        return null;
      }
    })
    .filter(Boolean);

  // Remove duplicates by URL (prefer entries with names)
  const byUrl = new Map();
  for (const ep of mapped) {
    const exist = byUrl.get(ep.url);
    if (!exist) {
      byUrl.set(ep.url, ep);
    } else if (!exist.name && ep.name) {
      byUrl.set(ep.url, ep);
    }
  }
  return Array.from(byUrl.values());
}

/**
 * Loads all model servers from settings.customEndpoints or legacy
 * llmEndpoints/ollamaEndpoints.
 * Result: [{ id, url, host, port, name, provider }]
 */
export async function getAllEndpoints() {
  try {
    const settingsResult = await query(
      'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );
    const settings =
      settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;
    const customEndpoints = settings?.custom_endpoints || null;

    // Collect inactive server URL list (from customEndpoints)
    const inactiveUrls = new Set();
    if (customEndpoints && Array.isArray(customEndpoints)) {
      customEndpoints.forEach((ep) => {
        if (ep.isActive === false && ep.url) {
          // Normalize URL (remove trailing slash)
          const normalizedUrl = ep.url.trim().replace(/\/+$/, '');
          inactiveUrls.add(normalizedUrl);
        }
      });
    }

    // 1) Prefer customEndpoints
    if (
      customEndpoints &&
      Array.isArray(customEndpoints) &&
      customEndpoints.length > 0
    ) {
      const mapped = [];
      for (const item of customEndpoints) {
        if (!item?.url) continue;
        // Include inactive servers as well, with isActive field (default: active)
        const isActive = item.isActive !== false;
        try {
          const u = new URL(item.url);
          // Auto-detect provider from URL (always correct invalid provider values)
          const url = item.url.toLowerCase();
          let provider = item.provider;

          // Auto-detect and correct provider by URL (priority: URL > configured provider)
          if (url.includes('generativelanguage.googleapis.com')) {
            // Gemini URLs must always be set to gemini
            provider = 'gemini';
            if (item.provider && item.provider !== 'gemini') {
              logger.warn(
                `[Model Server Monitor] URL is Gemini but provider is set to '${item.provider}'. Auto-correcting to 'gemini'.`,
                { url: item.url, originalProvider: item.provider }
              );
            }
          } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
            // OpenAI-compatible URLs must always be set to openai-compatible
            provider = 'openai-compatible';
            if (item.provider && item.provider !== 'openai-compatible') {
              logger.warn(
                `[Model Server Monitor] URL is OpenAI-compatible but provider is set to '${item.provider}'. Auto-correcting to 'openai-compatible'.`,
                { url: item.url, originalProvider: item.provider }
              );
            }
          } else if (!provider || provider === 'model-server') {
            // If provider is missing or 'model-server', set default value
            provider = 'ollama';
          }
          // Otherwise, keep the configured provider

          mapped.push({
            id: `${provider}-${u.hostname}-${u.port || ''}`,
            url: item.url.replace(/\/+$/, ''),
            host: u.hostname,
            port: u.port || '',
            name: item.name || `${provider} ${u.port || u.hostname}`,
            provider,
            isActive, // includes inactive state
          });
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          // skip invalid
        }
      }
      if (mapped.length > 0) return mapped;
    }

    // 2) Parse legacy llmEndpoints/ollamaEndpoints (treated as model-server)
    const legacy = await getModelServerEndpoints();
    // Include inactive servers as well, adding the isActive field
    const filteredLegacy = legacy.map((e) => {
      const normalizedUrl = e.url ? e.url.trim().replace(/\/+$/, '') : '';
      const isActive = !normalizedUrl || !inactiveUrls.has(normalizedUrl);
      return {
        ...e,
        provider: 'model-server',
        isActive, // includes inactive state
      };
    });
    return filteredLegacy;
  } catch (error) {
    logger.warn('[Catch] Error occurred:', error.message);
    // 3) Full fallback: env-based model-server list
    const legacy = await getModelServerEndpoints();
    // Filter inactive servers (re-read settings to verify)
    try {
      const inactiveUrls = await getInactiveUrls();

      return legacy.map((e) => {
        const normalizedUrl = e.url ? e.url.trim().replace(/\/+$/, '') : '';
        const isActive = !normalizedUrl || !inactiveUrls.has(normalizedUrl);
        return {
          ...e,
          provider: 'model-server',
          isActive, // includes inactive state
        };
      });
    } catch (error) {
      logger.warn('[Catch] Error occurred:', error.message);
      // If settings read fails, return without filtering (default: active)
      return legacy.map((e) => ({
        ...e,
        provider: 'model-server',
        isActive: true, // default is active
      }));
    }
  }
}

// Helper function to collect inactive server URL list
async function getInactiveUrls() {
  try {
    const settingsResult = await query(
      'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );
    const settings =
      settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;
    const customEndpoints = settings?.custom_endpoints || null;

    const inactiveUrls = new Set();
    if (customEndpoints && Array.isArray(customEndpoints)) {
      customEndpoints.forEach((ep) => {
        if (ep.isActive === false && ep.url) {
          const normalizedUrl = ep.url.trim().replace(/\/+$/, '');
          inactiveUrls.add(normalizedUrl);
        }
      });
    }
    return inactiveUrls;
  } catch (error) {
    logger.warn('[Catch] Error occurred:', error.message);
    return new Set();
  }
}

// Save model server error history
async function saveModelServerErrorHistory(
  endpoint,
  error,
  responseTime = null
) {
  try {
    const errorType = error.name || 'UnknownError';
    const errorMessage = error.message || String(error);

    // Auto-detect provider (URL-based, also fix invalid provider values)
    let provider = endpoint.provider;
    if (endpoint.url) {
      const url = endpoint.url.toLowerCase();
      // Auto-detect and fix provider by URL (priority: URL > configured provider)
      if (url.includes('generativelanguage.googleapis.com')) {
        provider = 'gemini';
      } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
        provider = 'openai-compatible';
      } else if (!provider || provider === 'model-server') {
        provider = 'model-server';
      }
      // Otherwise, keep the configured provider
    }
    // If provider is still missing, use default
    if (!provider) {
      provider = 'model-server';
    }

    await query(
      `INSERT INTO model_server_error_history 
       (endpoint_url, endpoint_name, provider, error_message, error_type, response_time, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        endpoint.url || '',
        endpoint.name || '',
        provider,
        errorMessage,
        errorType,
        responseTime,
        'unhealthy',
        JSON.stringify({
          stack: error.stack,
          url: endpoint.url,
          name: endpoint.name,
          provider: provider,
          originalProvider: endpoint.provider, // also store original provider
        }),
      ]
    );
  } catch (saveError) {
    // Try creating the table if it does not exist
    if (
      saveError.code === '42P01' &&
      saveError.message?.includes('model_server_error_history')
    ) {
      try {
        logger.info(
          '[Model Server Monitor] model_server_error_history table not found, creating it...'
        );
        await query(`
          CREATE TABLE IF NOT EXISTS model_server_error_history (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            endpoint_url VARCHAR(500) NOT NULL,
            endpoint_name VARCHAR(255),
            provider VARCHAR(50) NOT NULL,
            error_message TEXT NOT NULL,
            error_type VARCHAR(100),
            response_time INTEGER,
            status VARCHAR(50) DEFAULT 'unhealthy',
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata JSONB
          )
        `);
        await query(`
          CREATE INDEX IF NOT EXISTS idx_model_server_error_history_endpoint 
          ON model_server_error_history(endpoint_url, checked_at DESC)
        `);
        await query(`
          CREATE INDEX IF NOT EXISTS idx_model_server_error_history_provider 
          ON model_server_error_history(provider, checked_at DESC)
        `);
        logger.info(
          '[Model Server Monitor] model_server_error_history table created successfully'
        );

        // Auto-detect provider (URL-based, also fix invalid provider values)
        let provider = endpoint.provider;
        if (endpoint.url) {
          const url = endpoint.url.toLowerCase();
          // Auto-detect and fix provider by URL (priority: URL > configured provider)
          if (url.includes('generativelanguage.googleapis.com')) {
            provider = 'gemini';
          } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
            provider = 'openai-compatible';
          } else if (!provider || provider === 'model-server') {
            provider = 'model-server';
          }
          // Otherwise, keep the configured provider
        }
        if (!provider) {
          provider = 'model-server';
        }

        // Retry saving
        await query(
          `INSERT INTO model_server_error_history 
           (endpoint_url, endpoint_name, provider, error_message, error_type, response_time, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            endpoint.url || '',
            endpoint.name || '',
            provider,
            errorMessage,
            errorType,
            responseTime,
            'unhealthy',
            JSON.stringify({
              stack: error.stack,
              url: endpoint.url,
              name: endpoint.name,
              provider: provider,
              originalProvider: endpoint.provider,
            }),
          ]
        );
      } catch (createError) {
        logger.error('[Model Server Monitor] Failed to create table:', createError);
        logger.warn(
          '[Model Server Monitor] Run schema setup script: npm run setup-postgres'
        );
      }
    } else {
      logger.error('[Model Server Monitor] Failed to save error history:', saveError);
    }
  }
}

// Check model server instance health
export async function checkModelServerHealth(endpoint) {
  const startAt = Date.now();
  let abortController = null;
  let timeoutId = null;

  try {
    // Convert localhost to host.docker.internal in Docker environments
    const normalizedUrl = normalizeEndpointUrl(endpoint.url);
    const fetchUrl = `${normalizedUrl}/api/tags`;

    // Fallback for environments without AbortSignal.timeout support
    let signal;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      try {
        signal = AbortSignal.timeout(5000); // 5-second timeout
      } catch (e) {
        // If AbortSignal.timeout fails, implement manually
        abortController = new AbortController();
        signal = abortController.signal;
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 5000);
      }
    } else {
      // Manually implement when AbortSignal.timeout is unavailable
      abortController = new AbortController();
      signal = abortController.signal;
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, 5000);
    }

    const response = await fetch(fetchUrl, {
      method: 'GET',
      signal,
    });

    // Read response body as text first for validation
    const responseText = await response.text();

    if (!response.ok) {
      // Try reading error response body
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      if (responseText && responseText.trim()) {
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage =
            errorJson.error?.message || errorJson.error || errorMessage;
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          errorMessage = responseText.substring(0, 200);
        }
      }
      throw new Error(errorMessage);
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('Received an empty response from the model server.');
    }

    // Attempt JSON parsing
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('[Model Server Monitor] JSON parsing failed:', {
        error: parseError.message,
        responsePreview: responseText.substring(0, 200),
        status: response.status,
        statusText: response.statusText,
        url: `${normalizedUrl}/api/tags`,
      });
      throw new Error(`JSON parsing failed: ${parseError.message}`);
    }

    const responseTime = Date.now() - startAt;

    return {
      ...endpoint,
      status: 'healthy',
      models: data.models || [],
      modelCount: data.models?.length || 0,
      lastCheck: new Date(),
      responseTime,
      error: null,
    };
  } catch (error) {
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const responseTime = Date.now() - startAt;

    // Improve error message
    let errorMessage = error.message || 'Unknown error';

    // Provide more detailed info for network errors
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage = `Connection timeout (over 5 seconds): ${endpoint.url}`;
    } else if (
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ECONNREFUSED')
    ) {
      errorMessage = `Connection refused: ${endpoint.url} (check whether the server is running)`;
    } else if (
      error.code === 'ENOTFOUND' ||
      error.message?.includes('ENOTFOUND')
    ) {
      errorMessage = `Host not found: ${endpoint.url} (DNS check required)`;
    } else if (error.message?.includes('fetch failed')) {
      const causeMessage = error.cause?.message || '';
      errorMessage = `Network connection failed: ${endpoint.url}${
        causeMessage ? ` (${causeMessage})` : ''
      }`;
    }

    // Save error history
    await saveModelServerErrorHistory(endpoint, error, responseTime);

    return {
      ...endpoint,
      status: 'unhealthy',
      models: [],
      modelCount: 0,
      lastCheck: new Date(),
      responseTime: null,
      error: errorMessage,
    };
  } finally {
    // Clear timeout (also on success)
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Check OpenAI-compatible instance health
 * Standard: GET {base}/v1/models (or /models if base already includes /v1)
 * Authorization: Bearer {openaiCompatApiKey} (if present)
 */
export async function checkOpenAICompatibleHealth(endpoint) {
  const startAt = Date.now();
  let abortController = null;
  let timeoutId = null;

  try {
    const settingsResult = await query(
      'SELECT openai_compat_api_key FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );
    const settings =
      settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;
    const apiKey = settings?.openai_compat_api_key || '';

    // Convert localhost to host.docker.internal in Docker environments
    const normalizedBaseUrl = normalizeEndpointUrl(endpoint.url);
    const base = normalizedBaseUrl.replace(/\/+$/, '');
    const path = /\/v1(\/|$)/.test(base) ? '/models' : '/v1/models';
    const url = `${base}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // Fallback for environments without AbortSignal.timeout support
    let signal;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      try {
        signal = AbortSignal.timeout(5000); // 5-second timeout
      } catch (e) {
        // If AbortSignal.timeout fails, implement manually
        abortController = new AbortController();
        signal = abortController.signal;
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 5000);
      }
    } else {
      // Manually implement when AbortSignal.timeout is unavailable
      abortController = new AbortController();
      signal = abortController.signal;
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, 5000);
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal,
    });

    // Read response body as text first for validation (read once)
    const responseText = await res.text();

    if (!res.ok) {
      // Handle error response body
      let errorMessage = `HTTP ${res.status} ${res.statusText}`;
      if (responseText && responseText.trim()) {
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage =
            errorJson.error?.message || errorJson.error || errorMessage;
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          errorMessage = responseText.substring(0, 200);
        }
      }
      throw new Error(errorMessage);
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('Received an empty response from the OpenAI-compatible API.');
    }

    // Attempt JSON parsing
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error(
        '[Model Server Monitor] OpenAI-compatible JSON parsing failed:',
        {
          error: parseError.message,
          responsePreview: responseText.substring(0, 200),
          status: res.status,
          statusText: res.statusText,
          url: url,
        }
      );
      throw new Error(`JSON parsing failed: ${parseError.message}`);
    }

    // OpenAI standard is { data: [...] }, some compatible implementations use { models: [...] }
    const models = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
      ? data.models
      : [];

    const responseTime = Date.now() - startAt;

    return {
      ...endpoint,
      status: 'healthy',
      models,
      modelCount: models.length,
      lastCheck: new Date(),
      responseTime,
      error: null,
    };
  } catch (error) {
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const responseTime = Date.now() - startAt;

    // Improve error message
    let errorMessage = error.message || 'Unknown error';

    // Provide more detailed info for network errors
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage = `Connection timeout (over 5 seconds): ${endpoint.url}`;
    } else if (
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ECONNREFUSED')
    ) {
      errorMessage = `Connection refused: ${endpoint.url} (check whether the server is running)`;
    } else if (
      error.code === 'ENOTFOUND' ||
      error.message?.includes('ENOTFOUND')
    ) {
      errorMessage = `Host not found: ${endpoint.url} (DNS check required)`;
    } else if (error.message?.includes('fetch failed')) {
      const causeMessage = error.cause?.message || '';
      errorMessage = `Network connection failed: ${endpoint.url}${
        causeMessage ? ` (${causeMessage})` : ''
      }`;
    }

    // Save error history
    await saveModelServerErrorHistory(endpoint, error, responseTime);

    return {
      ...endpoint,
      status: 'unhealthy',
      models: [],
      modelCount: 0,
      lastCheck: new Date(),
      responseTime: null,
      error: errorMessage,
    };
  } finally {
    // Clear timeout (also on success)
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Check Gemini instance health
 * GET {base}/v1beta/models?key={apiKey}
 */
export async function checkGeminiHealth(endpoint) {
  const startAt = Date.now();
  let abortController = null;
  let timeoutId = null;

  try {
    // Look up API key from DB
    let apiKey = '';
    try {
      const settingsResult = await query(
        'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
        ['general']
      );
      if (settingsResult.rows.length > 0) {
        const customEndpoints = settingsResult.rows[0].custom_endpoints || [];
        const endpointConfig = customEndpoints.find(
          (e) => e.url && e.url.trim() === endpoint.url.trim()
        );
        if (endpointConfig && endpointConfig.apiKey) {
          apiKey = endpointConfig.apiKey;
        }
      }
    } catch (e) {
      logger.warn(
        '[Model Server Monitor] Failed to retrieve Gemini API key:',
        e.message
      );
    }

    if (!apiKey) {
      throw new Error('Gemini API key is required but not configured.');
    }

    const base =
      endpoint.url.replace(/\/+$/, '') ||
      'https://generativelanguage.googleapis.com';
    const url = `${base}/v1beta/models?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };

    // Fallback for environments without AbortSignal.timeout support
    let signal;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      try {
        signal = AbortSignal.timeout(5000); // 5-second timeout
      } catch (e) {
        // If AbortSignal.timeout fails, implement manually
        abortController = new AbortController();
        signal = abortController.signal;
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 5000);
      }
    } else {
      // Manually implement when AbortSignal.timeout is unavailable
      abortController = new AbortController();
      signal = abortController.signal;
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, 5000);
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal,
    });

    // Read response body as text first for validation (read once)
    const responseText = await res.text();

    if (!res.ok) {
      // Handle error response body
      let errorMessage = `HTTP ${res.status} ${res.statusText}`;
      if (responseText && responseText.trim()) {
        try {
          const errorJson = JSON.parse(responseText);
          errorMessage =
            errorJson.error?.message || errorJson.error || errorMessage;
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          errorMessage = responseText.substring(0, 200);
        }
      }
      throw new Error(errorMessage);
    }

    if (!responseText || responseText.trim() === '') {
      throw new Error('Received an empty response from the Gemini API.');
    }

    // Attempt JSON parsing
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('[Model Server Monitor] Gemini JSON parsing failed:', {
        error: parseError.message,
        responsePreview: responseText.substring(0, 200),
        status: res.status,
        statusText: res.statusText,
        url: url.replace(/key=[^&]+/, 'key=***'), // API key masking
      });
      throw new Error(`JSON parsing failed: ${parseError.message}`);
    }

    const rawModels = Array.isArray(data?.models) ? data.models : [];
    const models = rawModels.filter((m) =>
      m.supportedGenerationMethods?.includes('generateContent')
    );

    const responseTime = Date.now() - startAt;

    return {
      ...endpoint,
      status: 'healthy',
      models,
      modelCount: models.length,
      lastCheck: new Date(),
      responseTime,
      error: null,
    };
  } catch (error) {
    // Clear timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const responseTime = Date.now() - startAt;

    // Improve error message
    let errorMessage = error.message || 'Unknown error';

    // Provide more detailed info for network errors
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      errorMessage = `Connection timeout (over 5 seconds): ${endpoint.url}`;
    } else if (
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ECONNREFUSED')
    ) {
      errorMessage = `Connection refused: ${endpoint.url} (check whether the server is running)`;
    } else if (
      error.code === 'ENOTFOUND' ||
      error.message?.includes('ENOTFOUND')
    ) {
      errorMessage = `Host not found: ${endpoint.url} (DNS check required)`;
    } else if (error.message?.includes('fetch failed')) {
      const causeMessage = error.cause?.message || '';
      errorMessage = `Network connection failed: ${endpoint.url}${
        causeMessage ? ` (${causeMessage})` : ''
      }`;
    }

    // Save error history
    await saveModelServerErrorHistory(endpoint, error, responseTime);

    return {
      ...endpoint,
      status: 'unhealthy',
      models: [],
      modelCount: 0,
      lastCheck: new Date(),
      responseTime: null,
      error: errorMessage,
    };
  } finally {
    // Clear timeout (also on success)
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// Track last status check time
let lastCheckTime = 0;
const MIN_CHECK_INTERVAL = 30000000; // Minimum 500-minute interval

// Check status of all instances (model-server + openai-compatible)
export async function checkAllModelServerInstances() {
  const now = Date.now();
  const timeSinceLastCheck = now - lastCheckTime;

  // Skip if called within the minimum interval
  if (timeSinceLastCheck < MIN_CHECK_INTERVAL) {
    logger.info(
      `[Model Server Monitor] Skipping status check: ${Math.round(
        timeSinceLastCheck / 1000
      )} seconds since last check (minimum ${MIN_CHECK_INTERVAL / 1000} seconds required)`
    );
    return [];
  }

  lastCheckTime = now;

  try {
    // Check inactive server list (extra safeguard)
    const inactiveUrls = await getInactiveUrls();

    const endpoints = await getAllEndpoints();

    // Additional filtering for inactive servers (double safeguard)
    // Exclude OpenAI Compatible and Gemini from health checks (external APIs)
    const activeEndpoints = endpoints.filter((endpoint) => {
      if (!endpoint.url) return true; // keep if URL is missing
      const normalizedUrl = endpoint.url.trim().replace(/\/+$/, '');

      // Exclude inactive servers
      if (inactiveUrls.has(normalizedUrl)) return false;

      // Exclude external APIs from health checks (assume always online)
      if (endpoint.provider === 'openai-compatible') return false;
      if (endpoint.provider === 'gemini') return false;

      return true;
    });

    logger.info(
      `[Model Server Monitor] Checking health for ${
        activeEndpoints.length
      } instances... (excluding ${
        endpoints.length - activeEndpoints.length
      } inactive)`
    );

    const checks = await Promise.allSettled(
      activeEndpoints.map(async (endpoint) => {
        try {
          // Re-validate and force-correct provider by URL (double check)
          let provider = endpoint.provider;
          if (endpoint.url) {
            const url = endpoint.url.toLowerCase();

            // Gemini URL check (highest priority)
            if (url.includes('generativelanguage.googleapis.com')) {
              provider = 'gemini';
              if (endpoint.provider !== 'gemini') {
                logger.warn(
                  '[Model Server Monitor] URL is Gemini but provider is not gemini. Correcting provider to gemini.',
                  {
                    url: endpoint.url,
                    currentProvider: endpoint.provider,
                  }
                );
              }
              return await checkGeminiHealth({
                ...endpoint,
                provider: 'gemini',
              });
            }

            // OpenAI-compatible URL check
            if (url.includes('/v1/models') || url.includes('/v1/chat')) {
              provider = 'openai-compatible';
              if (endpoint.provider !== 'openai-compatible') {
                logger.warn(
                  '[Model Server Monitor] URL is OpenAI-compatible but provider is not openai-compatible. Correcting provider to openai-compatible.',
                  {
                    url: endpoint.url,
                    currentProvider: endpoint.provider,
                  }
                );
              }
              return await checkOpenAICompatibleHealth({
                ...endpoint,
                provider: 'openai-compatible',
              });
            }
          }

          // If URL-based checks pass, branch by provider
          if (provider === 'openai-compatible') {
            return await checkOpenAICompatibleHealth({ ...endpoint, provider });
          } else if (provider === 'gemini') {
            return await checkGeminiHealth({ ...endpoint, provider });
          } else {
            // Default: model-server (Ollama, etc.)
            return await checkModelServerHealth({
              ...endpoint,
              provider: provider || 'model-server',
            });
          }
        } catch (error) {
          // Continue even if an individual endpoint check fails
          logger.error(
            `[Model Server Monitor] Endpoint check failed: ${endpoint.url}`,
            error
          );
          return {
            ...endpoint,
            status: 'unhealthy',
            models: [],
            modelCount: 0,
            lastCheck: new Date(),
            responseTime: null,
            error: error.message || 'Unknown error',
          };
        }
      })
    );

    // Process Promise.allSettled results
    const results = checks.map((result) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Theoretically handled by the catch above, but added as a safeguard
        logger.error('[Model Server Monitor] Promise failed:', result.reason);
        return {
          status: 'unhealthy',
          models: [],
          modelCount: 0,
          lastCheck: new Date(),
          responseTime: null,
          error: result.reason?.message || 'Unknown error',
        };
      }
    });

    return results;
  } catch (error) {
    logger.error('[Model Server Monitor] Instance health check failed:', error);
    return [];
  }
}

// Record detailed API request logs (including round-robin tracking)
export async function logModelServerRequest(instanceId, requestData) {
  try {
    const logEntry = {
      instanceId,
      instanceType: 'model-server',
      level: 'INFO',
      category: 'api_request',
      method: requestData.method || 'POST',
      endpoint: requestData.endpoint || '/api/generate',
      requestType: requestData.requestType || 'unknown', // 'text', 'image', 'multimodal'
      model: requestData.model || 'unknown',
      hasFiles: requestData.hasFiles || false,
      fileCount: requestData.fileCount || 0,
      fileTypes: requestData.fileTypes || [],
      userAgent: requestData.userAgent || '',
      clientIP: requestData.clientIP || '',
      requestSize: requestData.requestSize || 0, // bytes
      responseTime: requestData.responseTime || null, // ms
      responseStatus: requestData.responseStatus || null,
      responseSize: requestData.responseSize || 0, // bytes
      errorMessage: requestData.errorMessage || null,
      roundRobinIndex: requestData.roundRobinIndex || null, // round-robin order
      roomId: requestData.roomId || null,
      userId: requestData.userId || null,
      timestamp: new Date(),
      metadata: requestData.metadata || {},
    };

    await query(
      `INSERT INTO model_logs (instance_id, instance_type, level, category, message, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        logEntry.instanceId,
        logEntry.instanceType,
        logEntry.level,
        logEntry.category,
        JSON.stringify(logEntry),
        JSON.stringify(logEntry.metadata),
      ]
    );

    const logMessage = `${requestData.method || 'POST'} ${
      requestData.endpoint || '/api/generate'
    } - Model: ${requestData.model} - Type: ${requestData.requestType} - RR: ${
      requestData.roundRobinIndex
    } - ${requestData.responseTime}ms`;
    logger.info(`[Model Server Request] [${instanceId}] ${logMessage}`);
  } catch (error) {
    logger.error('Failed to save model server request log:', error);
  }
}

// Record OpenAI-compatible instance request logs
export async function logOpenAIRequest(instanceId, requestData) {
  try {
    // Detect provider (from instanceId or endpoint)
    const isGemini =
      instanceId?.includes('gemini') ||
      requestData.endpoint?.includes('generativelanguage.googleapis.com') ||
      requestData.provider === 'gemini';

    // Determine request type (check whether messages include images)
    let requestType = 'text';
    if (requestData.messages) {
      const hasImage = requestData.messages.some(
        (msg) =>
          msg.content &&
          (Array.isArray(msg.content)
            ? msg.content.some((c) => c.type === 'image_url')
            : typeof msg.content === 'string' &&
              msg.content.includes('data:image'))
      );
      requestType = hasImage ? 'multimodal' : 'text';
    }

    // Extract file info
    const hasFiles =
      requestType === 'multimodal' || requestData.hasFiles || false;
    const fileCount = requestData.fileCount || (hasFiles ? 1 : 0);

    // Build message (concise - exclude info already shown in badges)
    // Message includes only endpoint info (only extra info not shown in badges)
    const messageParts = [];
    messageParts.push(
      `${requestData.method || 'POST'} ${
        requestData.endpoint || '/v1/chat/completions'
      }`
    );
    // Exclude info already shown in badges from message:
    // - Model (shown in badge)
    // - Response time (shown in badge)
    // - Status (shown in badge)
    // - Prompt/Completion/Total tokens (shown in badge)
    // - Stream (shown in badge)
    // - RoundRobinIndex (shown in badge)
    // Include only additional context (e.g., error messages, special details)

    // Include additional info in metadata (exclude null/undefined)
    const metadata = {
      ...(requestData.metadata || {}),
      endpoint: requestData.endpoint || '/v1/chat/completions',
      ...(requestData.responseTime !== null &&
        requestData.responseTime !== undefined && {
          responseTime: `${requestData.responseTime}ms`,
        }),
      method: requestData.method || 'POST',
      model: requestData.model || 'unknown',
      ...(requestData.responseStatus && {
        responseStatus: requestData.responseStatus,
      }),
      ...(requestData.responseSize && {
        responseSize: requestData.responseSize,
      }),
      ...(requestData.requestSize && { requestSize: requestData.requestSize }),
      ...(requestData.isStream !== undefined && {
        isStream: requestData.isStream,
      }),
      ...(requestData.roundRobinIndex !== null &&
        requestData.roundRobinIndex !== undefined && {
          roundRobinIndex: requestData.roundRobinIndex,
        }),
      ...(requestData.promptTokens && {
        promptTokens: requestData.promptTokens,
      }),
      ...(requestData.completionTokens && {
        completionTokens: requestData.completionTokens,
      }),
      ...(requestData.totalTokens && { totalTokens: requestData.totalTokens }),
      ...(requestData.hasFiles && { hasFiles: requestData.hasFiles }),
      ...(requestData.fileCount && { fileCount: requestData.fileCount }),
      ...(requestData.clientIP && { clientIP: requestData.clientIP }),
      ...(requestData.userAgent && { userAgent: requestData.userAgent }),
      provider: isGemini ? 'gemini' : 'openai-compatible',
    };

    // Remove null/undefined values
    Object.keys(metadata).forEach((key) => {
      if (metadata[key] === null || metadata[key] === undefined) {
        delete metadata[key];
      }
    });

    // Use a separate category for Gemini
    const category = isGemini ? 'gemini_proxy' : 'openai_proxy';
    const type = isGemini ? 'gemini_proxy' : 'openai_proxy';

    const logEntry = {
      instanceId,
      instanceType: isGemini ? 'gemini' : 'openai-compatible',
      type,
      level: (requestData.level || 'info').toUpperCase(),
      category,
      method: requestData.method || 'POST',
      endpoint: requestData.endpoint || '/v1/chat/completions',
      model: requestData.model || 'unknown',
      requestType,
      hasFiles,
      fileCount,
      userAgent: requestData.userAgent || '',
      clientIP: requestData.clientIP || '',
      requestSize: requestData.requestSize || 0,
      responseTime: requestData.responseTime || null,
      responseStatus: requestData.responseStatus || null,
      responseSize: requestData.responseSize || 0,
      errorMessage: requestData.errorMessage || null,
      roomId: requestData.roomId || null,
      userId: requestData.userId || null,
      isStream: requestData.isStream ?? true,
      roundRobinIndex: requestData.roundRobinIndex || null,
      promptTokens: requestData.promptTokens || null,
      completionTokens: requestData.completionTokens || null,
      totalTokens: requestData.totalTokens || null,
      message: messageParts.join(' | '), // add detailed message
      timestamp: new Date(),
      metadata,
    };
    await query(
      `INSERT INTO model_logs (instance_id, instance_type, level, category, message, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        instanceId,
        'openai-compatible',
        logEntry.level,
        logEntry.category,
        logEntry.message,
        JSON.stringify(logEntry.metadata),
      ]
    );
    logger.info(
      `[OpenAI-Compatible Request] [${instanceId}] ${logEntry.method} ${logEntry.endpoint} - Model: ${logEntry.model} - ${logEntry.responseStatus} - ${logEntry.responseTime}ms`
    );
  } catch (error) {
    logger.error('Failed to save OpenAI-compatible request log:', error);
  }
}

// Record basic event logs
export async function logModelServerEvent(
  instanceId,
  level,
  message,
  metadata = {}
) {
  try {
    await query(
      `INSERT INTO model_logs (instance_id, instance_type, level, category, message, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        instanceId,
        'model-server',
        level,
        'system_event',
        message,
        JSON.stringify(metadata),
      ]
    );

    logger.info(`[Model Server Log] [${level}] [${instanceId}] ${message}`);
  } catch (error) {
    logger.error('Failed to save model server log:', error);
  }
}

// Save model server instance status to DB
export async function saveendpointStatus(modelServers) {
  try {
    // Check inactive server list
    const inactiveUrls = await getInactiveUrls();

    // Filter inactive servers
    const activeModelServers = modelServers.filter((instance) => {
      if (!instance.url) return true; // keep if URL is missing (legacy data)
      const normalizedUrl = instance.url.trim().replace(/\/+$/, '');
      return !inactiveUrls.has(normalizedUrl);
    });

    // Delete existing data, then insert new data
    await query('DELETE FROM model_server');

    if (activeModelServers.length > 0) {
      logger.info('modelServers:', activeModelServers);
      for (const instance of activeModelServers) {
        await query(
          `INSERT INTO model_server (endpoint, name, status, metadata, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (endpoint) DO UPDATE SET
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             metadata = EXCLUDED.metadata,
             updated_at = CURRENT_TIMESTAMP`,
          [
            instance.url,
            instance.name || instance.id,
            instance.status || 'unknown',
            JSON.stringify(instance),
          ]
        );
      }
    }

    // Log records
    const healthyCount = activeModelServers.filter(
      (i) => i.status === 'healthy'
    ).length;
    const unhealthyCount = activeModelServers.length - healthyCount;

    logModelServerEvent(
      'system',
      'INFO',
      `Model server status update completed: ${healthyCount} healthy, ${unhealthyCount} unhealthy`,
      {
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        total: activeModelServers.length,
      }
    );
  } catch (error) {
    logger.error('Failed to save model server status:', error);
    logModelServerEvent('system', 'ERROR', 'Failed to save model server status', {
      error: error.message,
    });
  }
}

// Log success/failure of model server API calls
export async function logModelServerAPICall(
  endpoint,
  success,
  responseTime,
  error = null
) {
  const instanceId = `model-server-${new URL(endpoint).hostname}-${
    new URL(endpoint).port
  }`;

  if (success) {
    logModelServerEvent(instanceId, 'INFO', `API call succeeded`, {
      endpoint,
      responseTime: `${responseTime}ms`,
    });
  } else {
    logModelServerEvent(instanceId, 'ERROR', `API call failed`, {
      endpoint,
      error: error?.message || 'Unknown error',
      responseTime: responseTime ? `${responseTime}ms` : 'timeout',
    });
  }
}

// Start periodic model server monitoring
let monitoringInterval = null;

export function startModelServerMonitoring() {
  if (monitoringInterval) return;

  logger.info('[Model Server Monitor] Monitoring started...');

  // Run once immediately
  checkAndSaveendpointStatus();

  // Check status every 200 minutes
  monitoringInterval = setInterval(checkAndSaveendpointStatus, 12000000);
}

export function stopModelServerMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('[Model Server Monitor] Monitoring stopped');
  }
}

async function checkAndSaveendpointStatus() {
  const now = Date.now();
  const timeSinceLastCheck = now - lastCheckTime;

  // Skip if called within the minimum interval
  if (timeSinceLastCheck < MIN_CHECK_INTERVAL) {
    logger.info(
      `[Model Server Monitor] Skipping status check: ${Math.round(
        timeSinceLastCheck / 1000
      )} seconds since last check (minimum ${MIN_CHECK_INTERVAL / 1000} seconds required)`
    );
    return;
  }

  try {
    const modelServers = await checkAllModelServerInstances();
    await saveendpointStatus(modelServers);
  } catch (error) {
    logger.error('[Model Server Monitor] Status check failed:', error);
    logModelServerEvent('system', 'ERROR', 'Status check failed', {
      error: error.message,
    });
  }
}

// Auto-run on server start (does not run in browser)
// Do not start monitoring during build phase
if (
  typeof window === 'undefined' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  // Start monitoring after 5 seconds (after server initialization)
  setTimeout(() => {
    startModelServerMonitoring();
  }, 5000);

  // Stop monitoring on process termination
  process.on('SIGTERM', stopModelServerMonitoring);
  process.on('SIGINT', stopModelServerMonitoring);
}

// Aliases for backward compatibility (gradual migration)
export const getLlmEndpoints = getModelServerEndpoints;
export const checkLlmHealth = checkModelServerHealth;
export const checkAllLlmInstances = checkAllModelServerInstances;
export const logLlmRequest = logModelServerRequest;
export const logLlmEvent = logModelServerEvent;
export const logLlmAPICall = logModelServerAPICall;
export const startLlmMonitoring = startModelServerMonitoring;
export const stopLlmMonitoring = stopModelServerMonitoring;
export const getOllamaEndpoints = getModelServerEndpoints;
export const checkOllamaHealth = checkModelServerHealth;
export const checkAllOllamaInstances = checkAllModelServerInstances;
export const logOllamaRequest = logModelServerRequest;
export const logOllamaEvent = logModelServerEvent;
export const logOllamaAPICall = logModelServerAPICall;
export const startOllamaMonitoring = startModelServerMonitoring;
export const stopOllamaMonitoring = stopModelServerMonitoring;
