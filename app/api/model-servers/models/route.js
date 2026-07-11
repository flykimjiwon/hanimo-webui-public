import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getNextModelServerEndpoint } from '@/lib/modelServers';
import { verifyAdmin } from '@/lib/adminAuth';
import {
  buildGeminiModelsUrl,
  chooseOpenAICompatibleKey,
  decryptProviderEndpoints,
  decryptProviderSecret,
} from '@/lib/security/provider-credentials.mjs';
import { buildOpenAiEndpoint } from '@/lib/openai-gateway.mjs';

export async function GET(request) {
  // Hoisted to function scope so the catch block can reference them
  // (fixes ReferenceError: endpointParam is not defined on fetch failure)
  let endpointParam = null;
  let endpointApiKey = '';
  let provider = 'model-server';
  let modelServerUrl = '';
  try {
    // Check admin privileges
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    // Support selecting a specific model server (?endpoint=)
    const url = new URL(request.url);
    endpointParam = url.searchParams.get('endpoint');
    provider = url.searchParams.get('provider') || 'model-server';
    // If endpointParam exists, always resolve provider from DB (frontend may send an incorrect provider)
    if (endpointParam) {
      try {
        const { query } = await import('@/lib/postgres');
        const settingsResult = await query(
          'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
          ['general']
        );
        if (settingsResult.rows.length > 0) {
          const customEndpoints = decryptProviderEndpoints(
            settingsResult.rows[0].custom_endpoints || []
          );
          // URL normalization helper (remove trailing slash)
          const normalizeUrl = (url) => {
            try {
              const urlObj = new URL(url.trim());
              return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${
                urlObj.port ? `:${urlObj.port}` : ''
              }${urlObj.pathname.replace(/\/+$/, '')}`;
            } catch (error) {
              logger.warn('[Catch] Error occurred:', error.message);
              return url.trim().toLowerCase().replace(/\/+$/, '');
            }
          };
          const normalizedEndpointParam = normalizeUrl(endpointParam);
          const endpointConfig = customEndpoints.find(
            (e) => e.url && normalizeUrl(e.url) === normalizedEndpointParam
          );
          if (endpointConfig) {
            endpointApiKey = endpointConfig.apiKey || '';
            // Auto-detect provider from URL (priority: URL > DB setting)
            const url = endpointConfig.url.toLowerCase();
            if (url.includes('generativelanguage.googleapis.com')) {
              provider = 'gemini';
            } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
              provider = 'openai-compatible';
            } else if (endpointConfig.provider) {
              // Use DB setting if URL-based detection fails
              provider = endpointConfig.provider;
            }
          }
        }
      } catch (e) {
        logger.warn(
          '[model-servers/models] Failed to fetch settings:',
          e?.message || e
        );
      }
    }
    modelServerUrl = '';
    if (endpointParam) {
      // Empty string check
      if (!endpointParam.trim()) {
        return NextResponse.json(
          { error: 'The endpoint parameter is empty.' },
          { status: 400 }
        );
      }

      try {
        const parsed = new URL(endpointParam);
        if (!/^https?:$/.test(parsed.protocol)) {
          return NextResponse.json(
            {
               error: `Invalid protocol. It must start with http:// or https:// (current: ${parsed.protocol}).`,
            },
            { status: 400 }
          );
        }
        // openai-compatible and gemini are allowed without an explicit port
        // Validate port only when provider is 'model-server' or 'ollama'
        if (
          provider !== 'openai-compatible' &&
          provider !== 'gemini' &&
          !parsed.port
        ) {
          return NextResponse.json(
            {
               error: `Ollama model servers require a port number. (Example: http://localhost:11434)`,
            },
            { status: 400 }
          );
        }
        modelServerUrl = `${parsed.protocol}//${parsed.host}`;
      } catch (error) {
        return NextResponse.json(
          {
            error: `Invalid endpoint format: ${endpointParam}. Please check that it is a valid URL.`,
          },
          { status: 400 }
        );
      }
    } else {
      // Get model server endpoint (reuse existing load-balancing system)
      modelServerUrl = await getNextModelServerEndpoint();
      
      // Return an error if no model server is configured
      if (!modelServerUrl || (typeof modelServerUrl === 'string' && modelServerUrl.trim() === '')) {
        return NextResponse.json(
          {
            error: 'No model server is configured. Please register one in admin settings.',
            errorType: 'configuration',
          },
          { status: 400 }
        );
      }
    }

    // Gemini branch: /v1beta/models
    if (provider === 'gemini') {
      // Load API key from DB
      let apiKey = endpointApiKey;
      try {
        const { query } = await import('@/lib/postgres');
        const settingsResult = await query(
          'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
          ['general']
        );
        if (settingsResult.rows.length > 0) {
          const customEndpoints = decryptProviderEndpoints(
            settingsResult.rows[0].custom_endpoints || []
          );
          const endpointConfig = customEndpoints.find(
            (e) =>
              e.url && e.url.trim() === (endpointParam || modelServerUrl).trim()
          );
          if (endpointConfig && endpointConfig.apiKey) {
            apiKey = endpointConfig.apiKey;
          }
        }
      } catch (e) {
        logger.warn(
          '[Model Servers Models] Failed to fetch Gemini API key:',
          e.message
        );
      }

      if (!apiKey) {
        return NextResponse.json(
          {
            error: 'Gemini API key is required but not configured.',
            errorType: 'configuration',
          },
          { status: 400 }
        );
      }

      const base =
        (endpointParam || modelServerUrl).replace(/\/+$/, '') ||
        'https://generativelanguage.googleapis.com';
      const target = buildGeminiModelsUrl(base);
      const headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      };

      // Create AbortController for timeout handling
      let abortController = null;
      let timeoutId = null;
      let signal;

      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
          try {
            signal = AbortSignal.timeout(30000);
          } catch (e) {
            abortController = new AbortController();
            signal = abortController.signal;
            timeoutId = setTimeout(() => {
              abortController.abort();
            }, 30000);
          }
        } else {
          abortController = new AbortController();
          signal = abortController.signal;
          timeoutId = setTimeout(() => {
            abortController.abort();
          }, 30000);
        }
      } finally {
         // Timeout cleanup is handled in the catch/finally flow
      }

      let res;
      try {
        res = await fetch(target, {
          method: 'GET',
          headers,
          signal,
        });
      } finally {
         // Clear timeout (both success and failure)
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      if (!res.ok) {
        // Attempt to read error response body
        let errorMessage = `${res.status} ${res.statusText}`;
        try {
          const errorText = await res.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage =
                errorJson.error?.message || errorJson.error || errorMessage;
            } catch (error) {
              logger.warn('[Catch] Error occurred:', error.message);
              errorMessage = errorText.substring(0, 200); // Truncate if response text is too long
            }
          }
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          // Use default message if reading error body fails
        }

        return NextResponse.json(
          {
            error: `Failed to fetch Gemini model list: ${errorMessage}`,
            errorType: 'connection',
          },
          { status: res.status }
        );
      }

      // Read response body as text first for validation
      const responseText = await res.text();
      if (!responseText || responseText.trim() === '') {
        return NextResponse.json(
          {
            error: 'Received an empty response from the Gemini API.',
            errorType: 'empty_response',
          },
          { status: 502 }
        );
      }

      // Attempt JSON parsing
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('[Model Servers Models] Failed to parse Gemini JSON:', {
          error: parseError.message,
          responsePreview: responseText.substring(0, 200),
          status: res.status,
          statusText: res.statusText,
        });
        return NextResponse.json(
          {
             error: `Failed to parse Gemini API response: ${parseError.message}`,
            errorType: 'parse_error',
            details: responseText.substring(0, 200),
          },
          { status: 502 }
        );
      }
      const rawModels = Array.isArray(data?.models) ? data.models : [];
      const models = rawModels
        .filter((m) =>
          m.supportedGenerationMethods?.includes('generateContent')
        )
        .map((m) => {
          const fullName = m.name || '';
          // For Gemini models, remove the "models/" prefix (display only)
          const displayName = fullName.startsWith('models/')
            ? fullName.substring(7)
            : fullName;
          return {
            id: fullName, // Keep original ID
            name: displayName, // Display name (without models/)
            size: null,
            modified_at: null,
            digest: null,
            sizeFormatted: '',
          };
        });

      return NextResponse.json({
        success: true,
        models,
        total: models.length,
        provider: 'gemini',
        baseUrl: base,
      });
    }

    // OpenAI-compatible branch: /v1/models
    if (provider === 'openai-compatible') {
      // Load API key from DB or fall back to ENV
      let globalApiKey = '';
      try {
        const { query } = await import('@/lib/postgres');
        const settingsResult = await query(
          `SELECT * FROM settings WHERE config_type = $1 LIMIT 1`,
          ['general']
        );
        const settings = settingsResult.rows[0];
        if (settings?.openai_compat_api_key) {
          globalApiKey = decryptProviderSecret(settings.openai_compat_api_key);
        }
      } catch (e) {
        logger.warn(
          '[model-servers/models] Failed to fetch settings, using ENV:',
          e?.message || e
        );
      }

      const apiKey = chooseOpenAICompatibleKey(
        endpointApiKey,
        globalApiKey,
        process.env.OPENAI_COMPAT_API_KEY
      );

      const base = (endpointParam || modelServerUrl).replace(/\/+$/, '');
      const target = buildOpenAiEndpoint(base, '/models');
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      // Create AbortController for timeout handling
      let abortController = null;
      let timeoutId = null;
      let signal;

      try {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
          try {
            signal = AbortSignal.timeout(30000);
          } catch (e) {
            abortController = new AbortController();
            signal = abortController.signal;
            timeoutId = setTimeout(() => {
              abortController.abort();
            }, 30000);
          }
        } else {
          abortController = new AbortController();
          signal = abortController.signal;
          timeoutId = setTimeout(() => {
            abortController.abort();
          }, 30000);
        }
      } finally {
         // Timeout cleanup is handled in the catch/finally flow
      }

      let res;
      try {
        res = await fetch(target, {
          method: 'GET',
          headers,
          signal,
        });
      } finally {
         // Clear timeout (both success and failure)
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      if (!res.ok) {
        // Attempt to read error response body
        let errorMessage = `${res.status} ${res.statusText}`;
        try {
          const errorText = await res.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage =
                errorJson.error?.message || errorJson.error || errorMessage;
            } catch (error) {
              logger.warn('[Catch] Error occurred:', error.message);
              errorMessage = errorText.substring(0, 200);
            }
          }
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          // Use default message if reading error body fails
        }

        return NextResponse.json(
          {
             error: `Failed to fetch OpenAI-compatible model list: ${errorMessage}`,
            errorType: 'connection',
          },
          { status: res.status }
        );
      }

      // Read response body as text first for validation
      const responseText = await res.text();
      if (!responseText || responseText.trim() === '') {
        return NextResponse.json(
          {
            error: 'Received an empty response from the OpenAI-compatible API.',
            errorType: 'empty_response',
          },
          { status: 502 }
        );
      }

      // Attempt JSON parsing
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        logger.error('[Model Servers Models] Failed to parse OpenAI-compatible JSON:', {
          error: parseError.message,
          responsePreview: responseText.substring(0, 200),
          status: res.status,
          statusText: res.statusText,
        });
        return NextResponse.json(
          {
             error: `Failed to parse OpenAI-compatible API response: ${parseError.message}`,
            errorType: 'parse_error',
            details: responseText.substring(0, 200),
          },
          { status: 502 }
        );
      }
      const rawModels = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : [];
      const models = rawModels.map((m) => ({
        id: m.id || m.name || '',
        name: m.id || m.name || '',
        size: null,
        modified_at: m.created || m.modified_at || null,
        digest: null,
        sizeFormatted: '',
      }));

      return NextResponse.json({
        success: true,
        models,
        total: models.length,
        provider: 'openai-compatible',
        baseUrl: base,
      });
    }

    // Internal helper: timeout + retry support (model-server)
    async function fetchModelServerTagsWithRetry(
      primaryUrl,
      { timeoutMs = 30000, retryIfNoEndpoint = true } = {}
    ) {
      // Helper for timeout handling
      const createAbortSignal = () => {
        let abortController = null;
        let timeoutId = null;
        let signal;

        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
          try {
            signal = AbortSignal.timeout(timeoutMs);
          } catch (e) {
            abortController = new AbortController();
            signal = abortController.signal;
            timeoutId = setTimeout(() => {
              abortController.abort();
            }, timeoutMs);
          }
        } else {
          abortController = new AbortController();
          signal = abortController.signal;
          timeoutId = setTimeout(() => {
            abortController.abort();
          }, timeoutMs);
        }

        return { signal, timeoutId };
      };

      // First attempt: current selected/round-robin model server
      let timeoutId1 = null;
      try {
        const { signal, timeoutId } = createAbortSignal();
        timeoutId1 = timeoutId;

        const res = await fetch(`${primaryUrl}/api/tags`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
        });

        // Clear timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        return res;
      } catch (err) {
        // Clear timeout
        if (timeoutId1) {
          clearTimeout(timeoutId1);
        }

        // On timeout/network error, retry once with another instance when endpoint is not explicitly set
        const isTimeout =
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError' ||
          err?.name === 'ConnectTimeoutError' ||
          err?.code === 'UND_ERR_CONNECT_TIMEOUT';
        const isNetworkish =
          err?.name === 'FetchError' ||
          err?.code === 'ECONNREFUSED' ||
          err?.code === 'ENOTFOUND';
        const canRetry =
          !endpointParam && retryIfNoEndpoint && (isTimeout || isNetworkish);
        if (!canRetry) throw err;

        // Retry with the next round-robin model server
        let timeoutId2 = null;
        try {
          const fallback = await getNextModelServerEndpoint();
          const { signal, timeoutId } = createAbortSignal();
          timeoutId2 = timeoutId;

          const res = await fetch(`${fallback}/api/tags`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal,
          });

           // Clear timeout
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

           // If retry response is an error status, handle it upstream as-is
           // Return directly on success
          return res;
        } catch (retryErr) {
          // Clear timeout
          if (timeoutId2) {
            clearTimeout(timeoutId2);
          }
          throw retryErr;
        }
      }
    }

    // Request /api/tags on model server (30s timeout, one retry if needed)
    let response;
    try {
      response = await fetchModelServerTagsWithRetry(modelServerUrl, {
        timeoutMs: 30000,
        retryIfNoEndpoint: true,
      });
    } catch (fetchError) {
      // When fetch itself fails (network error, timeout, etc.)
      logger.error('[Model Servers Models] Model server connection failed:', {
        url: modelServerUrl,
        error: fetchError.message,
        name: fetchError.name,
        code: fetchError.code,
      });
      throw fetchError; // Handled in the upper catch block
    }

    if (!response.ok) {
      // Attempt to read error response body
      let errorMessage = `${response.status} ${response.statusText}`;
      try {
        const errorText = await response.text();
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage =
              errorJson.error?.message || errorJson.error || errorMessage;
          } catch (error) {
            logger.warn('[Catch] Error occurred:', error.message);
            errorMessage = errorText.substring(0, 200);
          }
        }
      } catch (error) {
        logger.warn('[Catch] Error occurred:', error.message);
        // Use default message if reading error body fails
      }
      
      logger.error('[Model Servers Models] Model server response failed:', {
        url: modelServerUrl,
        status: response.status,
        statusText: response.statusText,
        errorMessage,
      });
      
      throw new Error(`Model server response failed (${response.status}): ${errorMessage}`);
    }

    // Read response body as text first for validation
    const responseText = await response.text();
    if (!responseText || responseText.trim() === '') {
      throw new Error('Received an empty response from the model server.');
    }

    // Attempt JSON parsing
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('[Model Servers Models] Failed to parse model server JSON:', {
        error: parseError.message,
        responsePreview: responseText.substring(0, 200),
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Failed to parse model server response: ${parseError.message}`);
    }

    // Transform model list into a UI-friendly shape
    const models = (data.models || []).map((model) => ({
      id: model.name,
      name: model.name,
      size: model.size,
      modified_at: model.modified_at,
      digest: model.digest,
      // Convert size to a human-readable format
      sizeFormatted: formatBytes(model.size),
    }));

    return NextResponse.json({
      success: true,
      models: models,
      total: models.length,
      modelServerUrl: modelServerUrl,
    });
  } catch (error) {
    logger.error('[Model Servers Models] Failed to fetch model list:', error);
    logger.error('[Model Servers Models] Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      url: endpointParam || modelServerUrl,
      provider,
      stack: error.stack,
    });

    // Distinguish and handle network errors vs timeouts
    const isTimeout =
      error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      error.name === 'ConnectTimeoutError' ||
      error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('aborted') ||
      error.message?.includes('The operation was aborted');

    const isConnectionError =
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ENOTFOUND') ||
      error.message?.includes('getaddrinfo') ||
      error.message?.includes('ECONNRESET');

    // HTTP response failure (model server responded with an error status)
    const isHttpError = error.message?.includes('Model server response failed');

    if (isTimeout) {
      return NextResponse.json(
        {
          error:
            'Model server connection timed out. Please check that the model server is running.',
          errorType: 'timeout',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 504 }
      );
    }

    if (isConnectionError) {
      const endpointDisplay = endpointParam || modelServerUrl || 'Unknown';
      return NextResponse.json(
        {
          error:
             `Unable to connect to the model server. (${endpointDisplay}) Please check the server address and port.`,
          errorType: 'connection',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        { status: 500 }
      );
    }

    if (isHttpError) {
      // Use original error message for HTTP response failures
      return NextResponse.json(
        {
           error: error.message || 'Failed to fetch model list from the model server.',
          errorType: 'http_error',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error:
          'Failed to fetch model list from the model server. Please check model server status.',
        errorType: 'unknown',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

// Helper function to convert bytes into a human-readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
