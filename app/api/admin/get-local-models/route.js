import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { getAllEndpoints } from '@/lib/modelServerMonitor';
import {
  buildGeminiModelsUrl,
  decryptProviderEndpoints,
  decryptProviderSecret,
} from '@/lib/security/provider-credentials.mjs';

export async function GET(request) {
  try {
    // Admin auth check
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      // Return the NextResponse object from verifyAdmin as-is
      return adminCheck;
    }

    // Get the list of registered endpoints
    const allEndpoints = await getAllEndpoints();

    if (allEndpoints.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No registered endpoints found.',
          models: [],
        },
        { status: 404 }
      );
    }

    // Retrieve OpenAI-compatible API key
    let openaiApiKey = process.env.OPENAI_COMPAT_API_KEY || '';
    const endpointApiKeys = new Map();
    try {
      const { query } = await import('@/lib/postgres');
      const settingsResult = await query(
        `SELECT * FROM settings WHERE config_type = $1 LIMIT 1`,
        ['general']
      );
      const settings = settingsResult.rows[0];
      if (settings?.openai_compat_api_key) {
        openaiApiKey = decryptProviderSecret(settings.openai_compat_api_key);
      }
      for (const endpoint of decryptProviderEndpoints(settings?.custom_endpoints || [])) {
        if (endpoint?.url && endpoint?.apiKey) {
          endpointApiKeys.set(
            endpoint.url.trim().replace(/\/+$/, ''),
            endpoint.apiKey
          );
        }
      }
    } catch (e) {
      logger.warn(
        '[get-local-models] Failed to load settings, using ENV:',
        e?.message || e
      );
    }

    const allModels = [];
    const endpointResults = [];

    // Collect models from all endpoints
    for (const endpoint of allEndpoints) {
      try {
        const provider = endpoint.provider || 'llm';
        let models = [];

        if (provider === 'gemini') {
          // Gemini API: /v1beta/models
          const apiKey =
            endpointApiKeys.get(endpoint.url.trim().replace(/\/+$/, '')) || '';
          if (!apiKey) {
            logger.warn(`[get-local-models] Gemini API key is missing: ${endpoint.url}`);
            endpointResults.push({
              endpoint: endpoint.url,
              endpointName: endpoint.name || endpoint.url,
              provider: 'gemini',
              count: 0,
              success: false,
              error: 'API key is not configured.',
            });
            continue;
          }

          const base = endpoint.url.replace(/\/+$/, '') || 'https://generativelanguage.googleapis.com';
          const url = buildGeminiModelsUrl(base);
          const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          };

          logger.info(`[get-local-models] Querying Gemini model server: ${url}`);

          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(30000),
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            const rawModels = Array.isArray(data?.models) ? data.models : [];
            
            models = rawModels
              .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
              .map((m) => ({
                name: m.name || '',
                size: null,
                modified_at: null,
                digest: null,
                details: m,
                provider: 'gemini',
                endpoint: endpoint.url,
                endpointName: endpoint.name || endpoint.url,
              }));
          } else {
            logger.warn(
              `[get-local-models] Gemini model server failed: ${endpoint.url} - ${response.status}`
            );
          }
        } else if (provider === 'openai-compatible') {
          // OpenAI-compatible API: /v1/models
          const base = endpoint.url.replace(/\/+$/, '');
          const path = /\/v1(\/|$)/.test(base) ? '/models' : '/v1/models';
          const url = `${base}${path}`;
          const headers = { 'Content-Type': 'application/json' };
          const apiKey =
            endpointApiKeys.get(endpoint.url.trim().replace(/\/+$/, '')) ||
            openaiApiKey;
          if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }

          logger.info(`[get-local-models] Querying OpenAI-compatible model server: ${url}`);

          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(30000),
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
            const rawModels = Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.models)
              ? data.models
              : [];

            models = rawModels.map((m) => ({
              name: m.id || m.name || '',
              size: null,
              modified_at: m.created || m.modified_at || null,
              digest: null,
              details: m,
              provider: 'openai-compatible',
              endpoint: endpoint.url,
              endpointName: endpoint.name || endpoint.url,
            }));
          } else {
            logger.warn(
              `[get-local-models] OpenAI-compatible model server failed: ${endpoint.url} - ${response.status}`
            );
          }
        } else {
          // LLM API: /api/tags
          logger.info(`[get-local-models] Querying LLM model server: ${endpoint.url}`);

          const response = await fetch(`${endpoint.url}/api/tags`, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(30000),
          });

          if (response.ok) {
            const data = await response.json();
            models = (data.models || []).map((model) => ({
              name: model.name,
              size: model.size,
              modified_at: model.modified_at,
              digest: model.digest,
              details: model.details,
              provider: 'llm',
              endpoint: endpoint.url,
              endpointName: endpoint.name || endpoint.url,
            }));
          } else {
            logger.warn(
              `[get-local-models] LLM model server failed: ${endpoint.url} - ${response.status}`
            );
          }
        }

        if (models.length > 0) {
          allModels.push(...models);
          endpointResults.push({
            endpoint: endpoint.url,
            endpointName: endpoint.name || endpoint.url,
            provider: provider,
            count: models.length,
            success: true,
          });
        } else {
          endpointResults.push({
            endpoint: endpoint.url,
            endpointName: endpoint.name || endpoint.url,
            provider: provider,
            count: 0,
            success: false,
            error: 'No models found or query failed',
          });
        }
      } catch (error) {
        logger.error(
          `[get-local-models] Failed to query model server ${endpoint.url}:`,
          error.message
        );
        endpointResults.push({
          endpoint: endpoint.url,
          endpointName: endpoint.name || endpoint.url,
          provider: endpoint.provider || 'llm',
          count: 0,
          success: false,
          error: error.message,
        });
      }
    }

    logger.info(
      `[get-local-models] Found ${allModels.length} models total (${endpointResults.length} endpoints)`
    );

    return NextResponse.json({
      success: true,
      models: allModels,
      endpoints: endpointResults,
      count: allModels.length,
    });
  } catch (error) {
    logger.error('[get-local-models] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch local models: ' + error.message,
        models: [],
      },
      { status: 500 }
    );
  }
}
