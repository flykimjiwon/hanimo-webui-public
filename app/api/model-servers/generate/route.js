import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import {
  getNextModelServerEndpointWithIndex,
  parseModelName,
  getModelServerEndpointByName,
} from '@/lib/modelServers';
import { logQARequest } from '@/lib/qaLogger';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { fetchWithRetry } from '@/lib/retryUtils';
import { verifyToken } from '@/lib/auth';

// Simple log recording function
async function logModelServerProxyRequest(data) {
  try {
    const { query } = await import('@/lib/postgres');

    // Include additional info in metadata (excluding null/undefined)
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
        'model_server_proxy',
        data.level || 'info',
        data.category || 'model_server_proxy',
        data.method || 'POST',
        data.endpoint || '',
        data.model || 'unknown',
        data.message || null,
        data.error || null,
        data.timestamp || new Date(),
        JSON.stringify(metadata),
        data.provider || 'model-server',
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
    logger.error('Log recording failed:', error);
  }
}

// Simple model server proxy for VSCode Continue
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
    // === Basic proxy info ===
    xForwardedFor: request.headers.get('x-forwarded-for'),
    xRealIP: request.headers.get('x-real-ip'),
    xForwardedProto: request.headers.get('x-forwarded-proto'),
    xForwardedHost: request.headers.get('x-forwarded-host'),

    // === Client info ===
    acceptLanguage: request.headers.get('accept-language'),
    acceptEncoding: request.headers.get('accept-encoding'),
    acceptCharset: request.headers.get('accept-charset'),
    referer: request.headers.get('referer'),
    origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'),

    // === Security and authentication ===
    authorization: request.headers.get('authorization') ? 'present' : 'absent',

    // === Custom identification headers ===
    xRequestedWith: request.headers.get('x-requested-with'),
    xClientName: request.headers.get('x-client-name'),
    xClientVersion: request.headers.get('x-client-version'),
    xUserName: request.headers.get('x-user-name'),
    xWorkspace: request.headers.get('x-workspace'),
    xSessionId: request.headers.get('x-session-id'),

    // === Timezone info ===
    timezone:
      request.headers.get('x-timezone') ||
      request.headers.get('timezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  // CORS header configuration (accessible from VSCode Continue)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

    // Verify authentication
    const authPayload = verifyToken(request);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: corsHeaders }
      );
    }

  try {
    // Receive request body as-is - handle empty requests
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      logger.error('[Model Server Proxy] JSON parsing error:', jsonError);
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
          message: 'The request body is not valid JSON.',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Required field validation
    if (!body.model || !body.prompt) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          message: 'The model and prompt fields are required.',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    logger.info('[Model Server Proxy] Request:', {
      model: body.model,
      prompt: body.prompt?.length || 0,
      stream: body.stream,
      ip: clientIP,
    });

    // Parse server name from model name and round-robin only within that server group
    let modelServerEndpoint;
    let roundRobinIndex;
    let provider = 'model-server'; // Default

    let { serverName } = parseModelName(body.model);

    // If server name could not be parsed from model ID, check DB settings
    if (!serverName) {
      const { getServerNameForModel } = await import('@/lib/modelServers');
      const dbServerName = await getServerNameForModel(body.model);
      if (dbServerName) {
        serverName = dbServerName;
        logger.info(
          `[Model Server Proxy] Found server group in DB settings: "${body.model}" -> "${serverName}"`
        );
      }
    }

    if (serverName) {
      // If server name exists, round-robin only within that server group
      const serverEndpoint = await getModelServerEndpointByName(serverName);
      if (serverEndpoint) {
        modelServerEndpoint = serverEndpoint.endpoint;
        roundRobinIndex = serverEndpoint.index;
        provider = serverEndpoint.provider || 'model-server';
        logger.info(
          `[Model Server Proxy] Model "${body.model}" -> Server group "${serverName}" -> Endpoint: ${modelServerEndpoint} (RR: ${roundRobinIndex}, Provider: ${provider})`
        );
      } else {
        // If not found by server name, use global round-robin
        logger.warn(
          `[Model Server Proxy] Server group "${serverName}" not found, using global round-robin`
        );
        const next = await getNextModelServerEndpointWithIndex();
        modelServerEndpoint = next.endpoint;
        roundRobinIndex = next.index;
        provider = next.provider || 'model-server';
      }
    } else {
      // If no server name, use global round-robin
      const next = await getNextModelServerEndpointWithIndex();
      modelServerEndpoint = next.endpoint;
      roundRobinIndex = next.index;
      provider = next.provider || 'model-server';
    }

    const modelServerUrl = `${modelServerEndpoint}/api/generate`;

    logger.info(
      `[Model Server Proxy] Instance ${roundRobinIndex}: ${modelServerUrl}`
    );

    // Copy original request headers, but modify/exclude some.
    const headersToForward = {};
    request.headers.forEach((value, key) => {
      // 'host' header is not forwarded as fetch sets it automatically.
      // 'content-length' is not forwarded as fetch sets it based on body length.
      if (!['host', 'content-length'].includes(key.toLowerCase())) {
        headersToForward[key] = value;
      }
    });
    // Content-Type is always set to application/json.
    headersToForward['Content-Type'] = 'application/json';

    // --- Detailed debug log start ---
    logger.info(
      '\n\n[MODEL SERVER PROXY DEBUG] ======================================='
    );
    logger.info('[MODEL SERVER PROXY DEBUG] Final request info:');
    logger.info('[MODEL SERVER PROXY DEBUG]   - Destination URL:', modelServerUrl);
    logger.info('[MODEL SERVER PROXY DEBUG]   - Method:', 'POST');
    logger.info(
      '[MODEL SERVER PROXY DEBUG]   - Forwarded headers:',
      JSON.stringify(headersToForward, null, 2)
    );
    logger.info(
      '[MODEL SERVER PROXY DEBUG]   - Request body keys:',
      Object.keys(body)
    );
    logger.info(
      '[MODEL SERVER PROXY DEBUG] =======================================\n\n'
    );
    // --- Debug log end ---


    // Reference object for updating provider on retry
    const providerRef = { value: provider };

    let modelServerRes;
    try {
      modelServerRes = await fetchWithRetry(
        modelServerUrl,
        {
          method: 'POST',
          headers: headersToForward, // Use modified headers
          body: JSON.stringify(body),
        },
        {
          maxRetries: 2, // Max 2 retries (3 total attempts)
          isStreaming: body.stream !== false,
          getNextEndpoint: getNextModelServerEndpointWithIndex,
          providerRef: providerRef,
          endpointPath: '/api/generate',
        }
      );

      // Update final provider after retries
      provider = providerRef.value;
    } catch (fetchError) {
      // Handle fetch failure
      const responseTime = Date.now() - startTime;
      const errorMessage = fetchError.message || 'Unknown error';

      logger.error('[Model Server Proxy] Model server connection error:', {
        url: modelServerUrl,
        error: errorMessage,
        type: fetchError.name || 'Unknown',
        code: fetchError.code,
      });

      await logModelServerProxyRequest({
        provider: providerRef.value,
        level: 'error',
        category: 'model_server_proxy',
        method: 'POST',
        endpoint: modelServerUrl,
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
        `[Model Server Proxy] Error: ${modelServerRes.status} ${modelServerRes.statusText}`,
        errorText
      );

      // Record error log
      await logModelServerProxyRequest({
        provider: provider,
        level: 'error',
        category: 'model_server_proxy',
        method: 'POST',
        endpoint: modelServerUrl,
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

    // Check response type
    const contentType = modelServerRes.headers.get('content-type') || '';

    if (body.stream !== false) {
      // Streaming response - collect response text while forwarding
      const responseTime = Date.now() - startTime;

      // Collect text from streaming response
      let accumulatedResponse = '';
      const reader = modelServerRes.body.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        start(controller) {
          function pump() {
            return reader.read().then(({ done, value }) => {
              if (done) {
                // Calculate token count and log when streaming completes
                const promptTokens = body.prompt?.length || 0;
                const responseTokens = accumulatedResponse.length;

                // Logging (deferred execution)
                Promise.all([
                  logModelServerProxyRequest({
                    provider: provider,
                    level: 'info',
                    category: 'model_server_proxy',
                    method: 'POST',
                    endpoint: modelServerUrl,
                    model: body.model,
                    clientIP,
                    userAgent,
                    responseTime,
                    statusCode: modelServerRes.status,
                    isStream: true,
                    promptTokens,
                    completionTokens: responseTokens,
                    totalTokens: promptTokens + responseTokens,
                  }),
                  logQARequest({
                    clientIP,
                    model: body.model,
                    prompt: body.prompt,
                    response:
                      accumulatedResponse.substring(0, 500) +
                      (accumulatedResponse.length > 500 ? '...' : ''),
                    isStream: true,
                    responseTime,
                    statusCode: modelServerRes.status,
                  }),
                  logExternalApiRequest({
                    sourceType: 'internal',
                    provider: provider,
                    apiType: 'generate',
                    endpoint: modelServerUrl,
                    model: body.model,
                    prompt: body.prompt,
                    promptTokenCount: promptTokens,
                    responseTokenCount: responseTokens,
                    responseTime,
                    statusCode: modelServerRes.status,
                    isStream: true,
                    clientIP,
                    userAgent,
                    ...identificationHeaders,
                  }),
                ]).catch((err) => logger.error('Logging failed:', err));

                controller.close();
                return;
              }

              // Extract and accumulate response text
              const chunk = decoder.decode(value, { stream: true });
              try {
                const lines = chunk.split('\n').filter((line) => line.trim());
                for (const line of lines) {
                  try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                      accumulatedResponse += parsed.response;
                    }
                  } catch (e) {
                    if (process.env.NODE_ENV === 'development') {
                      logger.debug(
                        '[model-server-generate] JSON parsing failed:',
                        e?.message || e
                      );
                    }
                  }
                }
              } catch (e) {
                logger.warn(
                  '[model-server-generate] Chunk processing failed:',
                  e?.message || e
                );
              }

              controller.enqueue(value);
              return pump();
            });
          }
          return pump();
        },
      });

      return new Response(stream, {
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
      // Normal JSON response - parse response then record log
      const responseData = await modelServerRes.text();
      const responseTime = Date.now() - startTime;

      // Estimate token count (not exact, for rough statistics)
      let promptTokens = 0;
      let completionTokens = 0;
      let responseText = '';
      try {
        const parsedResponse = JSON.parse(responseData);
        promptTokens = body.prompt?.length || 0;
        completionTokens = parsedResponse.response?.length || 0;
        responseText = parsedResponse.response || '';
      } catch (e) {
        responseText = responseData;
        logger.warn(
          '[model-server-generate] JSON parsing failed, using raw text:',
          e?.message || e
        );
      }

      await logModelServerProxyRequest({
        provider: provider,
        level: 'info',
        category: 'model_server_proxy',
        method: 'POST',
        endpoint: modelServerUrl,
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

      // Q&A log recording (non-streaming - includes response)
      await logQARequest({
        clientIP,
        model: body.model,
        prompt: body.prompt,
        response: responseText,
        isStream: false,
        responseTime,
        statusCode: modelServerRes.status,
      });

      // External API logging (normal response)
      await logExternalApiRequest({
        sourceType: 'internal',
        provider: provider,
        apiType: 'generate',
        endpoint: modelServerUrl,
        model: body.model,
        prompt: body.prompt,
        promptTokenCount: promptTokens,
        responseTokenCount: completionTokens,
        responseTime,
        statusCode: modelServerRes.status,
        isStream: false,
        clientIP,
        userAgent,
        ...identificationHeaders,
      });

      logger.info(`[Model Server Proxy] Complete: ${responseTime}ms`);

      return new Response(responseData, {
        status: modelServerRes.status,
        headers: {
          'Content-Type': contentType || 'application/json',
          ...corsHeaders,
        },
      });
    }
  } catch (error) {
    logger.error('[Model Server Proxy] Server error:', error);

    // Record server error log
    await logModelServerProxyRequest({
      provider: provider || 'model-server',
      level: 'error',
      category: 'model_server_proxy',
      method: 'POST',
      endpoint: 'unknown',
      model: 'unknown',
      clientIP,
      userAgent,
      responseTime: Date.now() - startTime,
      statusCode: 500,
      isStream: false,
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

// Handle OPTIONS request (CORS preflight)
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
