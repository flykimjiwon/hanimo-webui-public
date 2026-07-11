import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import {
  getNextModelServerEndpointWithIndex,
  parseModelName,
  getModelServerEndpointByName,
} from '@/lib/modelServers';
// getDB is no longer used
import { logQARequest } from '@/lib/qaLogger';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { fetchWithRetry } from '@/lib/retryUtils';
import { verifyToken } from '@/lib/auth';
import { buildProxyHeaders } from '@/lib/security/proxy-headers.mjs';

// Simple logging function (uses same log table as generate)
async function logModelServerProxyRequest(data) {
  try {
    const { query } = await import('@/lib/postgres');

    // Include additional metadata (exclude null/undefined)
    const metadata = {
      endpoint: data.endpoint || '',
      ...(data.responseTime && { responseTime: `${data.responseTime}ms` }),
      method: data.method || 'POST',
      model: data.model || 'unknown',
      ...(data.statusCode && { responseStatus: data.statusCode }),
      ...(data.responseSize && { responseSize: data.responseSize }),
      ...(data.requestSize && { requestSize: data.requestSize }),
      ...(data.isStream !== undefined && { isStream: data.isStream }),
      ...(data.roundRobinIndex !== null &&
        data.roundRobinIndex !== undefined && {
          roundRobinIndex: data.roundRobinIndex,
        }),
      ...(data.promptTokens && { promptTokens: data.promptTokens }),
      ...(data.completionTokens && { completionTokens: data.completionTokens }),
      ...(data.totalTokens && { totalTokens: data.totalTokens }),
      ...(data.hasFiles && { hasFiles: data.hasFiles }),
      ...(data.fileCount && { fileCount: data.fileCount }),
      ...(data.clientIP && { clientIP: data.clientIP }),
      ...(data.userAgent && { userAgent: data.userAgent }),
    };

    // Remove null/undefined values
    Object.keys(metadata).forEach((key) => {
      if (
        metadata[key] === null ||
        metadata[key] === undefined ||
        metadata[key] === ''
      ) {
        delete metadata[key];
      }
    });

    await query(
      `INSERT INTO model_logs (type, level, category, method, endpoint, model, message, error, timestamp, metadata, provider, client_ip, user_agent, response_time, status_code, is_stream, prompt_tokens, completion_tokens, total_tokens, has_files, file_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        'model_server_proxy_chat',
        data.level || 'info',
        data.category || 'model_server_proxy_chat',
        data.method || 'POST',
        data.endpoint || '',
        data.model || 'unknown',
        data.message || null,
        data.error || null,
        new Date(),
        JSON.stringify(metadata),
        data.provider || null,
        data.clientIP || null,
        data.userAgent || null,
        data.responseTime || null,
        data.statusCode || null,
        data.isStream !== undefined ? data.isStream : null,
        data.promptTokens || null,
        data.completionTokens || null,
        data.totalTokens || null,
        data.hasFiles || null,
        data.fileCount || null,
      ]
    );
  } catch (error) {
    logger.error('Failed to write log:', error);
  }
}

// VSCode Continue-only model server chat proxy
// Pure model server API with only round-robin load balancing added

export async function POST(request) {
  const startTime = Date.now();
  const clientIP =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Collect additional header info for external API logging
  const identificationHeaders = {
    xForwardedFor: request.headers.get('x-forwarded-for'),
    xRealIP: request.headers.get('x-real-ip'),
    acceptLanguage: request.headers.get('accept-language'),
    referer: request.headers.get('referer'),
    origin: request.headers.get('origin'),
    authorization: request.headers.get('authorization') ? 'present' : 'absent',
  };

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  let provider = 'model-server';

    // Verify authentication
    const authPayload = verifyToken(request);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: corsHeaders }
      );
    }

  try {
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      logger.error('[Model Server Chat Proxy] JSON parsing error:', jsonError);
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
          message: 'Request body is not valid JSON format.',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate required fields: prompt -> messages
    if (!body.model || !body.messages) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'model and messages fields are required.',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    logger.info('[Model Server Chat Proxy] Request:', {
      model: body.model,
      messages: body.messages?.length || 0,
      stream: body.stream,
      ip: clientIP,
    });

    // Parse server name from model name and round-robin within that server group only
    let modelServerEndpoint;
    let roundRobinIndex;
    let selectedEndpointInfo = null;

    let { serverName } = parseModelName(body.model);

    // If server name is not parsed from model ID, check DB settings
    if (!serverName) {
      const { getServerNameForModel } = await import('@/lib/modelServers');
      const dbServerName = await getServerNameForModel(body.model);
      if (dbServerName) {
        serverName = dbServerName;
        logger.info(
          `[Model Server Chat Proxy] Found server group in DB settings: "${body.model}" -> "${serverName}"`
        );
      }
    }

    if (serverName) {
      // If server name exists, use round-robin only within that server group
      const serverEndpoint = await getModelServerEndpointByName(serverName);
      if (serverEndpoint) {
        selectedEndpointInfo = serverEndpoint;
        modelServerEndpoint = serverEndpoint.endpoint;
        roundRobinIndex = serverEndpoint.index;
        provider = serverEndpoint.provider || 'model-server';
        logger.info(
          `[Model Server Chat Proxy] Model "${body.model}" -> server group "${serverName}" -> endpoint: ${modelServerEndpoint} (RR: ${roundRobinIndex}, Provider: ${provider})`
        );
      } else {
        // If not found by server name, use global round-robin
        logger.warn(
          `[Model Server Chat Proxy] Could not find server group "${serverName}", using global round-robin`
        );
        const next = await getNextModelServerEndpointWithIndex();
        selectedEndpointInfo = next;
        modelServerEndpoint = next.endpoint;
        roundRobinIndex = next.index;
        provider = next.provider || 'model-server';
      }
    } else {
      // If there is no server name, use global round-robin
      const next = await getNextModelServerEndpointWithIndex();
      selectedEndpointInfo = next;
      modelServerEndpoint = next.endpoint;
      roundRobinIndex = next.index;
      provider = next.provider || 'model-server';
    }

    // Use /api/chat as API path
    const modelServerUrl = `${modelServerEndpoint}/api/chat`;

    logger.info(
      `[Model Server Chat Proxy] Instance ${roundRobinIndex}: ${modelServerUrl}`
    );

    // Reference object for provider update on retries
    const providerRef = { value: provider };
    let finalModelServerUrl = modelServerUrl;
    const buildModelServerFetchOptions = (endpointInfo = selectedEndpointInfo) => ({
      method: 'POST',
      headers: buildProxyHeaders({ bearerToken: endpointInfo?.apiKey }),
      body: JSON.stringify(body),
    });

    let modelServerRes;
    try {
      modelServerRes = await fetchWithRetry(
        modelServerUrl,
        buildModelServerFetchOptions(selectedEndpointInfo),
        {
          maxRetries: 2, // retry up to 2 times (3 attempts total)
          isStreaming: body.stream !== false,
          getNextEndpoint: getNextModelServerEndpointWithIndex,
          providerRef: providerRef,
          endpointPath: '/api/chat',
          buildOptions: ({ endpointInfo }) =>
            buildModelServerFetchOptions(endpointInfo),
          onRetry: (_attempt, retryUrl) => {
            finalModelServerUrl = retryUrl;
          },
        }
      );

      // Update final provider after retries
      provider = providerRef.value;
    } catch (fetchError) {
      // Handle fetch failure
      const responseTime = Date.now() - startTime;
      const errorMessage = fetchError.message || 'Unknown error';

      logger.error('[Model Server Chat Proxy] Model server connection error:', {
        url: modelServerUrl,
        error: errorMessage,
        type: fetchError.name || 'Unknown',
        code: fetchError.code,
      });

      await logModelServerProxyRequest({
        provider: providerRef.value,
        level: 'error',
        category: 'model_server_proxy_chat',
        method: 'POST',
        endpoint: finalModelServerUrl,
        model: body.model,
        clientIP,
        userAgent,
        responseTime,
        statusCode: 503,
        isStream: body.stream !== false,
        error: `Connection error: ${errorMessage}`,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      return NextResponse.json(
        {
          error: 'Model server connection error',
          message: `Failed to connect to model server: ${errorMessage}`,
        },
        { status: 503, headers: corsHeaders }
      );
    }

    if (!modelServerRes.ok) {
      const errorText = await modelServerRes.text();
      logger.error(
        `[Model Server Chat Proxy] Error: ${modelServerRes.status} ${modelServerRes.statusText}`,
        errorText
      );

      await logModelServerProxyRequest({
        provider: provider,
        level: 'error',
        category: 'model_server_proxy_chat',
        method: 'POST',
        endpoint: finalModelServerUrl,
        model: body.model,
        clientIP,
        userAgent,
        responseTime: Date.now() - startTime,
        statusCode: modelServerRes.status,
        isStream: body.stream !== false,
        error: errorText,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      return NextResponse.json(
        {
          error: `Model server error: ${modelServerRes.status}`,
          details: errorText,
        },
        { status: modelServerRes.status, headers: corsHeaders }
      );
    }

    const contentType = modelServerRes.headers.get('content-type') || '';

    // Estimate prompt tokens (sum of message content lengths)
    const promptTokens = body.messages.reduce(
      (acc, msg) => acc + (msg.content?.length || 0),
      0
    );

    if (body.stream !== false) {
      const responseTime = Date.now() - startTime;

      await logModelServerProxyRequest({
        provider: provider,
        level: 'info',
        category: 'model_server_proxy_chat',
        method: 'POST',
        endpoint: finalModelServerUrl,
        model: body.model,
        clientIP,
        userAgent,
        responseTime,
        statusCode: modelServerRes.status,
        isStream: true,
        promptTokens,
        completionTokens: 0, // difficult to calculate during streaming
        totalTokens: promptTokens,
      });

      // Write Q&A log (streaming - response excluded)
      await logQARequest({
        clientIP,
        model: body.model,
        prompt: body.messages, // chat API logs the messages array
        response: null,
        isStream: true,
        responseTime,
        statusCode: modelServerRes.status,
      });

      // External API dedicated logging (streaming)
      await logExternalApiRequest({
        sourceType: 'internal',
        provider: provider,
        apiType: 'chat',
        endpoint: finalModelServerUrl,
        model: body.model,
        messages: body.messages,
        responseTokenCount: 0, // difficult to calculate in real time during streaming
        promptTokenCount: promptTokens,
        responseTime,
        statusCode: modelServerRes.status,
        isStream: true,
        clientIP,
        userAgent,
        ...identificationHeaders,
      });

      return new Response(modelServerRes.body, {
        status: modelServerRes.status,
        headers: {
          'Content-Type': contentType.includes('application/json')
            ? 'application/json'
            : 'text/plain',
          'Transfer-Encoding': 'chunked',
          ...corsHeaders,
        },
      });
    } else {
      const responseData = await modelServerRes.text();
      const responseTime = Date.now() - startTime;

      let completionTokens = 0;
      let responseText = '';
      try {
        const parsedResponse = JSON.parse(responseData);
        // In chat responses, content is in message.content
        completionTokens = parsedResponse.message?.content?.length || 0;
        responseText = parsedResponse.message?.content || '';
      } catch (e) {
        responseText = responseData;
        logger.warn(
          '[model-server-chat] JSON parsing failed, using raw text:',
          e?.message || e
        );
      }

      await logModelServerProxyRequest({
        provider: provider,
        level: 'info',
        category: 'model_server_proxy_chat',
        method: 'POST',
        endpoint: finalModelServerUrl,
        model: body.model,
        clientIP,
        userAgent,
        responseTime,
        statusCode: modelServerRes.status,
        isStream: false,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      });

      // Write Q&A log (non-streaming - includes response)
      await logQARequest({
        clientIP,
        model: body.model,
        prompt: body.messages, // chat API logs the messages array
        response: responseText,
        isStream: false,
        responseTime,
        statusCode: modelServerRes.status,
      });

      // External API dedicated logging (normal response)
      await logExternalApiRequest({
        sourceType: 'internal',
        provider: provider,
        apiType: 'chat',
        endpoint: finalModelServerUrl,
        model: body.model,
        messages: body.messages,
        responseTokenCount: completionTokens,
        promptTokenCount: promptTokens,
        responseTime,
        statusCode: modelServerRes.status,
        isStream: false,
        clientIP,
        userAgent,
        ...identificationHeaders,
      });

      logger.info(`[Model Server Chat Proxy] Completed: ${responseTime}ms`);

      return new Response(responseData, {
        status: modelServerRes.status,
        headers: {
          'Content-Type': contentType || 'application/json',
          ...corsHeaders,
        },
      });
    }
  } catch (error) {
    logger.error('[Model Server Chat Proxy] Server error:', error);

    await logModelServerProxyRequest({
      provider: provider || 'model-server',
      level: 'error',
      category: 'model_server_proxy_chat',
      endpoint: 'unknown',
      model: 'unknown',
      clientIP,
      userAgent,
      responseTime: Date.now() - startTime,
      statusCode: 500,
      error: error.message,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });

    return NextResponse.json(
      {
        error: 'Proxy server error',
        message: error.message,
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    }
  );
}
