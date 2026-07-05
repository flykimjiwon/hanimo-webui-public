import { NextResponse } from 'next/server';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { verifyApiToken, resolveEndpoint, buildOpenAiUrl, getValueByPath, applyTemplate, findModelRecord } from '@/lib/apiTokenUtils';

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
    const input = body.input;
    if (!model || input == null) {
      return NextResponse.json(
        {
          error: {
            message: 'model and input are required.',
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
        prompt: input,
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
        manualRes = await fetch(manualUrl, {
          ...requestOptions,
          signal: AbortSignal.timeout(30000),
        });
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              message: `Model server connection error: ${error.message}`,
              type: 'server_error',
            },
          },
          { status: 500, headers: corsHeaders }
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
        ? {
            object: 'list',
            data: [
              {
                object: 'embedding',
                embedding: getValueByPath(manualData, responsePath) || [],
                index: 0,
              },
            ],
            model,
          }
        : manualData;

      logExternalApiRequest({
        sourceType: 'external',
        provider: 'manual',
        apiType: 'embeddings',
        endpoint: '/v1/embeddings',
        model,
        promptTokenCount: 0,
        responseTokenCount: 0,
        isStream: false,
        responseTime: Date.now() - startTime,
        statusCode: 200,
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

    const { endpoint, provider, modelName, apiKey } = endpointInfo;
    const resolvedModel = modelName || model;

    if (provider === 'openai-compatible') {
      const targetUrl = buildOpenAiUrl(endpoint, '/embeddings');
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, model: resolvedModel }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));

      logExternalApiRequest({
        sourceType: 'external',
        provider: endpointInfo.type || 'openai-compatible',
        apiType: 'embeddings',
        endpoint: '/v1/embeddings',
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
    }

    // Ollama embeddings (array input is processed sequentially)
    const inputs = Array.isArray(input) ? input : [input];
    if (inputs.length > 100) {
      return NextResponse.json(
        {
          error: {
            message: 'Maximum 100 inputs per request.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }
    if (inputs.length === 0) {
      return NextResponse.json(
        {
          error: {
            message: 'input is required.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const targetUrl = `${endpoint.replace(/\/+$/, '')}/api/embeddings`;
    const dataList = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const prompt = inputs[i];
      if (!prompt || typeof prompt !== 'string') {
        return NextResponse.json(
          {
            error: {
              message: 'Ollama embeddings require string inputs.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolvedModel,
          prompt,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return NextResponse.json(
          {
            error: {
              message: data.error || 'Embedding request failed.',
              type: 'server_error',
            },
          },
          { status: response.status, headers: corsHeaders }
        );
      }

      dataList.push({
        object: 'embedding',
        embedding: data.embedding || [],
        index: i,
      });
    }

    logExternalApiRequest({
      sourceType: 'external',
      provider: 'ollama',
      apiType: 'embeddings',
      endpoint: '/v1/embeddings',
      model: resolvedModel,
      promptTokenCount: 0,
      responseTokenCount: 0,
      isStream: false,
      responseTime: Date.now() - startTime,
      statusCode: 200,
      clientIP,
      userAgent,
      jwtUserId: verificationResult.tokenInfo?.userId,
      tokenHash: verificationResult.tokenInfo?.tokenHash,
    }).catch(() => {});

    return NextResponse.json(
      {
        object: 'list',
        data: dataList,
        model: resolvedModel,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error',
        },
      },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}

export async function OPTIONS(request) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(request) });
}
