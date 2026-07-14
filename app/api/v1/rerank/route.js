import { NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { verifyApiToken, resolveEndpoint, buildOpenAiUrl, getValueByPath, applyTemplate, findModelRecord } from '@/lib/apiTokenUtils';
import { fetchWithProviderPolicy } from '@/lib/security/provider-outbound.mjs';
import { resolveOpenAICompatibleKey } from '@/lib/security/provider-runtime-credentials.mjs';
import { createProviderFailure } from '@/lib/security/provider-errors.mjs';

function getCorsHeaders(request) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || [];
  const origin = request?.headers?.get('origin') || '';
  const allowOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function POST(request) {
  try {
    const corsHeaders = getCorsHeaders(request);
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        {
          error: {
            message:
              'Authorization header is required. Please provide a valid API token.',
            type: 'authentication_error',
          },
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const verificationResult = await verifyApiToken(token);
    if (!verificationResult.valid) {
      return NextResponse.json(
        {
          error: {
            message: verificationResult.error || 'Invalid API token.',
            type: 'authentication_error',
          },
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const startTime = Date.now();
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    const userAgent = request.headers.get('user-agent') || '';

    const body = await request.json().catch(() => ({}));
    const model = body.model || body.modelId;
    const queryText = body.query;
    const documents = body.documents;
    if (!model || !queryText || !Array.isArray(documents)) {
      return NextResponse.json(
        {
          error: {
            message: 'model, query, and documents are required.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const matchedModel = await findModelRecord(model);
    const manualEndpoint =
      matchedModel?.endpoint &&
      String(matchedModel.endpoint).trim().toLowerCase() === 'manual';

    if (manualEndpoint) {
      if (!matchedModel?.apiConfig) {
        return NextResponse.json(
          {
            error: {
              message: 'Manual API configuration is missing.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      let manualConfig;
      try {
        manualConfig =
          typeof matchedModel.apiConfig === 'string'
            ? JSON.parse(matchedModel.apiConfig)
            : matchedModel.apiConfig;
      } catch {
        return NextResponse.json(
          {
            error: {
              message: 'Failed to parse Manual API configuration JSON.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const context = {
        apiKey: (matchedModel.apiKey || process.env.OPENAI_API_KEY || '').trim(),
        prompt: {
          query: queryText,
          documents,
          top_n: body.top_n,
        },
      };

      const manualUrl = applyTemplate(manualConfig?.url, context);
      if (!manualUrl) {
        return NextResponse.json(
          {
            error: {
              message: 'Manual API URL is not configured.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const method = (manualConfig?.method || 'POST').toUpperCase();
      const reqHeaders = applyTemplate(manualConfig?.headers || {}, context);
      const reqBody = applyTemplate(manualConfig?.body, context);
      const requestOptions = { method, headers: reqHeaders };
      if (method !== 'GET' && method !== 'HEAD' && reqBody !== undefined) {
        requestOptions.body =
          typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
      }

      let manualRes;
      try {
        manualRes = await fetchWithProviderPolicy(manualUrl, {
          ...requestOptions,
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        const failure = createProviderFailure(
          error,
          'Unable to connect to the configured model provider.'
        );
        logger.error('[v1/rerank] Manual provider request failed:', {
          correlationId: failure.correlationId,
          ...failure.log,
        });
        return NextResponse.json(
          failure.openAI,
          { status: 503, headers: { ...corsHeaders, ...failure.headers } }
        );
      }

      if (!manualRes.ok) {
        const errorText = await manualRes.text().catch(() => '');
        return NextResponse.json(
          {
            error: {
              message: `Model server error: ${manualRes.status} ${errorText}`.trim(),
              type: 'server_error',
            },
          },
          { status: manualRes.status, headers: corsHeaders }
        );
      }

      const manualData = await manualRes.json().catch(() => ({}));
      const responsePath = manualConfig?.responseMapping?.path;
      const finalData = responsePath
        ? getValueByPath(manualData, responsePath) || manualData
        : manualData;

      logExternalApiRequest({
        sourceType: 'external',
        provider: 'manual',
        apiType: 'rerank',
        endpoint: '/v1/rerank',
        model,
        promptTokenCount: 0,
        responseTokenCount: 0,
        isStream: false,
        responseTime: Date.now() - startTime,
        statusCode: manualRes.status,
        clientIP,
        userAgent,
        jwtUserId: verificationResult.tokenInfo?.userId,
        tokenHash: verificationResult.tokenInfo?.tokenHash,
      }).catch(() => {});

      return NextResponse.json(finalData, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const endpointInfo = await resolveEndpoint(model);
    if (!endpointInfo) {
      return NextResponse.json(
        {
          error: {
            message: 'No model server endpoint available.',
            type: 'server_error',
          },
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const { endpoint, provider, modelName, apiKey: endpointApiKey } = endpointInfo;
    const resolvedModel = modelName || model;

    if (provider !== 'openai-compatible') {
      return NextResponse.json(
        {
          error: {
            message:
              'Rerank requires an openai-compatible endpoint that supports /v1/rerank.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const targetUrl = buildOpenAiUrl(endpoint, '/rerank');
    const headers = { 'Content-Type': 'application/json' };
    const compatibleApiKey = await resolveOpenAICompatibleKey(endpointApiKey);
    if (compatibleApiKey) {
      headers.Authorization = `Bearer ${compatibleApiKey}`;
    }
    const response = await fetchWithProviderPolicy(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: resolvedModel,
        query: queryText,
        documents,
        top_n: body.top_n,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => ({}));

    logExternalApiRequest({
      sourceType: 'external',
      provider: endpointInfo.provider || 'openai-compatible',
      apiType: 'rerank',
      endpoint: '/v1/rerank',
      model: resolvedModel,
      promptTokenCount: 0,
      responseTokenCount: 0,
      isStream: false,
      responseTime: Date.now() - startTime,
      statusCode: response.status,
      clientIP,
      userAgent,
      jwtUserId: verificationResult.tokenInfo?.userId,
      tokenHash: verificationResult.tokenInfo?.tokenHash,
    }).catch(() => {});

    return NextResponse.json(data, {
      status: response.status,
      headers: corsHeaders,
    });
  } catch (error) {
    const failure = createProviderFailure(error);
    logger.error('[v1/rerank] Server error:', {
      correlationId: failure.correlationId,
      ...failure.log,
    });
    return NextResponse.json(
      failure.openAI,
      { status: 500, headers: { ...getCorsHeaders(request), ...failure.headers } }
    );
  }
}

export async function OPTIONS(request) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(request) });
}
