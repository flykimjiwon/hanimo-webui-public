import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getNextModelServerEndpoint } from '@/lib/modelServers';
import { verifyApiToken } from '@/lib/apiTokenUtils';

// OpenAI-compatible Models API
// Returns model server's model list in OpenAI format

export async function GET(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    // Verify API token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) {
      return NextResponse.json(
        { error: { message: 'API token required.', type: 'auth_error' } },
        { status: 401, headers: corsHeaders }
      );
    }
    const verificationResult = await verifyApiToken(token);
    if (!verificationResult.valid) {
      return NextResponse.json(
        { error: { message: verificationResult.error, type: 'auth_error' } },
        { status: 401, headers: corsHeaders }
      );
    }

    // Get model server endpoint
    const modelServerEndpoint = await getNextModelServerEndpoint();
    const modelsUrl = `${modelServerEndpoint}/api/tags`;

    logger.info('[OpenAI Models] Fetching model list:', modelsUrl);

    const res = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      logger.error(
        `[OpenAI Models] Model server error: ${res.status} ${res.statusText}`
      );
      return NextResponse.json(
        {
          error: {
            message: `Failed to fetch models: ${res.status} ${res.statusText}`,
            type: 'server_error',
          },
        },
        { status: res.status, headers: corsHeaders }
      );
    }

    const data = await res.json().catch(() => ({}));

    // Ollama format: { models: [{ name, ... }] }
    // OpenAI format: { data: [{ id, object: "model", created, owned_by }] }
    const ollamaModels = Array.isArray(data.models) ? data.models : [];
    const openaiModels = ollamaModels.map((model, index) => ({
      id: model.name || `model-${index}`,
      object: 'model',
      created: model.modified_at
        ? Math.floor(new Date(model.modified_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      owned_by: 'ollama',
    }));

    const openaiResponse = {
      object: 'list',
      data: openaiModels,
    };

    return NextResponse.json(openaiResponse, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    logger.error('[OpenAI Models] Server error:', error);

    return NextResponse.json(
      {
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error',
        },
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(request) {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}
