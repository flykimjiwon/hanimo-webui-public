import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getNextModelServerEndpointWithIndex } from '@/lib/modelServers';
import { verifyApiToken } from '@/lib/apiTokenUtils';
import {
  buildModelsUpstreamRequest,
  normalizeModelsResponse,
} from '@/lib/openai-gateway.mjs';

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
};

function redactEndpoint(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-endpoint]';
  }
}

export async function GET(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1] || null;
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

    const endpointInfo = await getNextModelServerEndpointWithIndex();
    if (!endpointInfo?.endpoint) {
      return NextResponse.json(
        {
          error: {
            message: 'No model server endpoint is configured.',
            type: 'configuration_error',
          },
        },
        { status: 503, headers: corsHeaders }
      );
    }

    const provider = endpointInfo.provider || 'model-server';
    const configuredApiKey =
      endpointInfo.apiKey ||
      (provider === 'openai-compatible'
        ? process.env.OPENAI_COMPAT_API_KEY || ''
        : '');
    const upstream = buildModelsUpstreamRequest({
      endpoint: endpointInfo.endpoint,
      provider,
      apiKey: configuredApiKey,
    });

    logger.info(
      `[OpenAI Models] Fetching ${provider} model list: ${redactEndpoint(upstream.url)}`
    );

    const res = await fetch(upstream.url, {
      method: 'GET',
      headers: upstream.headers,
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

    const data = await res.json().catch(() => null);
    if (!data) {
      return NextResponse.json(
        {
          error: {
            message: 'Model server returned an invalid JSON response.',
            type: 'upstream_error',
          },
        },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(normalizeModelsResponse(data, provider), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    logger.error('[OpenAI Models] Server error:', error);

    return NextResponse.json(
      {
        error: {
          message: 'Failed to fetch the model list.',
          type: 'server_error',
        },
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}
