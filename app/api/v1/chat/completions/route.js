import logger from '@/lib/logger';
import {
  buildGeminiGenerateUrl,
  decryptProviderEndpoints,
} from '@/lib/security/provider-credentials.mjs';
import { NextResponse } from 'next/server';
import {
  getNextModelServerEndpointWithIndex,
  resolveModelId,
  parseModelName,
  getModelServerEndpointByName,
  getModelServerEndpointByLabel,
} from '@/lib/modelServers';
import { logQARequest } from '@/lib/qaLogger';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { logOpenAIRequest } from '@/lib/modelServerMonitor';
import { getClientIP } from '@/lib/ip';
import { verifyApiToken } from '@/lib/apiTokenUtils';
import { buildOpenAiEndpoint } from '@/lib/openai-gateway.mjs';
import { buildProxyHeaders } from '@/lib/security/proxy-headers.mjs';
import {
  MODEL_SERVER_TIMEOUT_STREAM,
  MODEL_SERVER_TIMEOUT_NORMAL,
  MODEL_SERVER_RETRY_DELAY,
} from '@/lib/config';
import crypto from 'crypto';

// OpenAI-compatible Chat Completions API
// Convert Ollama-format responses to OpenAI format

const createChatCompletionId = () =>
  `chatcmpl-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

function buildUpstreamHeaders(provider, apiKey = '') {
  const headers = buildProxyHeaders({
    bearerToken: provider === 'openai-compatible' ? apiKey : '',
  });
  if (provider === 'gemini' && apiKey) headers['x-goog-api-key'] = apiKey;
  return headers;
}

function redactEndpointForLog(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid-endpoint]';
  }
}

function getValueByPath(source, path) {
  if (!source || !path) return undefined;
  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let current = source;
  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token];
  }
  return current;
}

function applyTemplate(value, context) {
  if (typeof value === 'string') {
    if (value === '{{messages}}') return context.messages;
    if (value === '{{message}}') return context.message;
    let output = value;
    if (output.includes('{{OPENAI_API_KEY}}')) {
      output = output.replaceAll('{{OPENAI_API_KEY}}', context.apiKey || '');
    }
    if (output.includes('{{messages}}')) {
      output = output.replaceAll(
        '{{messages}}',
        JSON.stringify(context.messages)
      );
    }
    if (output.includes('{{message}}')) {
      output = output.replaceAll('{{message}}', context.message || '');
    }
    return output;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyTemplate(item, context));
  }
  if (value && typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = applyTemplate(val, context);
    });
    return next;
  }
  return value;
}

function normalizeToolsPayload(inputTools) {
  if (!Array.isArray(inputTools)) return inputTools;

  return inputTools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return null;
      if (tool.type !== 'function') return tool;
      if (!tool.function || typeof tool.function !== 'object') return tool;

      const fn = tool.function;
      if (typeof fn.name !== 'string' || !fn.name.trim()) return tool;

      return {
        type: 'function',
        function: {
          name: fn.name,
          ...(fn.description !== undefined && { description: fn.description }),
          ...(fn.parameters !== undefined && { parameters: fn.parameters }),
          ...(fn.strict !== undefined && { strict: fn.strict }),
        },
      };
    })
    .filter(Boolean);
}

function normalizeToolChoicePayload(inputToolChoice) {
  if (inputToolChoice === undefined) return inputToolChoice;
  if (typeof inputToolChoice === 'string') return inputToolChoice;
  if (!inputToolChoice || typeof inputToolChoice !== 'object') {
    return inputToolChoice;
  }

  if (inputToolChoice.type === 'function') {
    const functionName =
      inputToolChoice.function?.name || inputToolChoice.name || null;
    if (typeof functionName === 'string' && functionName.trim()) {
      return {
        type: 'function',
        function: {
          name: functionName,
        },
      };
    }
  }

  return inputToolChoice;
}

function isToolChoiceRequired(inputToolChoice) {
  if (typeof inputToolChoice === 'string') {
    return inputToolChoice === 'required' || inputToolChoice === 'function';
  }

  if (!inputToolChoice || typeof inputToolChoice !== 'object') {
    return false;
  }

  return (
    inputToolChoice.type === 'function' || inputToolChoice.type === 'required'
  );
}

function isToolUnsupportedByModelError(statusCode, errorText) {
  if (statusCode !== 400 && statusCode !== 422) return false;
  if (typeof errorText !== 'string') return false;

  const normalizedError = errorText.toLowerCase();
  return (
    normalizedError.includes('does not support tools') ||
    normalizedError.includes('tools are not supported') ||
    normalizedError.includes('unsupported tools') ||
    normalizedError.includes('tool calling is not supported') ||
    normalizedError.includes('function calling is not supported') ||
    normalizedError.includes('unrecognized request argument supplied: tools') ||
    normalizedError.includes('unknown field "tools"') ||
    normalizedError.includes("unknown field 'tools'") ||
    (normalizedError.includes('unknown argument') &&
      normalizedError.includes('tools'))
  );
}

async function getModelConfig() {
  try {
    const { getModelsFromTables } = await import('@/lib/modelTables');
    let categories = await getModelsFromTables();

    if (!categories) {
      const { query } = await import('@/lib/postgres');
      const modelConfigResult = await query(
        'SELECT config FROM model_config WHERE config_type = $1 LIMIT 1',
        ['models']
      );
      categories = modelConfigResult.rows[0]?.config?.categories || null;
    }

    return categories ? { categories } : null;
  } catch (error) {
    logger.warn('[Model Config] Model settings query failed:', error.message);
    return null;
  }
}

async function findModelRecord(modelId) {
  if (!modelId) return null;
  const modelConfig = await getModelConfig();
  if (!modelConfig?.categories) return null;

  const allModels = [];
  Object.values(modelConfig.categories).forEach((category) => {
    if (category.models && Array.isArray(category.models)) {
      allModels.push(...category.models);
    }
  });

  let found = allModels.find((m) => m.id === modelId);
  if (!found) {
    found = allModels.find((m) => m.modelName === modelId);
  }
  if (!found) {
    found = allModels.find(
      (m) => m.label && m.label.toLowerCase() === String(modelId).toLowerCase()
    );
  }
  if (!found) {
    const modelBase = String(modelId).split(':')[0];
    found = allModels.find((m) => {
      if (!m.modelName) return false;
      const mNameLower = m.modelName.toLowerCase();
      const modelIdLower = String(modelId).toLowerCase();
      return (
        mNameLower.includes(modelIdLower) ||
        mNameLower.startsWith(modelBase.toLowerCase() + ':')
      );
    });
  }
  return found || null;
}

function applyMultiturnLimit(messages, limit, unlimited) {
  if (!Array.isArray(messages)) return messages;
  if (unlimited) return messages;
  const numericLimit = Number.parseInt(limit, 10);
  if (!numericLimit || numericLimit <= 0) return messages;

  const systemMessages = messages.filter((msg) => msg?.role === 'system');
  const otherMessages = messages.filter((msg) => msg?.role !== 'system');
  const trimmed = otherMessages.slice(-(numericLimit * 2));
  return [...systemMessages, ...trimmed];
}

async function logOpenAIProxyRequest(data) {
  try {
    const { query } = await import('@/lib/postgres');
    const resolvedUserId =
      data.userId || data.user_id || data.jwtUserId || data.user?.id || null;
    await query(
      `INSERT INTO model_logs (type, level, category, method, endpoint, model, message, error, timestamp, metadata, provider, client_ip, user_agent, response_time, status_code, is_stream, prompt_tokens, completion_tokens, total_tokens, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        'openai_proxy_chat',
        data.level || 'info',
        data.category || 'openai_proxy_chat',
        data.method || 'POST',
        data.endpoint || '/v1/chat/completions',
        data.model || 'unknown',
        data.message || null,
        data.error || null,
        data.timestamp || new Date(),
        JSON.stringify(data.metadata || {}),
        data.provider || 'openai-compatible',
        data.clientIP || null,
        data.userAgent || null,
        data.responseTime || null,
        data.statusCode || null,
        data.isStream !== undefined ? data.isStream : null,
        data.promptTokens || null,
        data.completionTokens || null,
        data.totalTokens || null,
        resolvedUserId,
      ]
    );
  } catch (error) {
    logger.error('Failed to write log:', error);
  }
}

export async function POST(request) {
  const startTime = Date.now();
  const clientIP = getClientIP(request);
  const userAgent =
    request.headers.get('user-agent') ||
    request.headers.get('x-client-name') ||
    'unknown';

  // API token verification (required)
  let userInfo = null;
  let tokenHash = null;
  let tokenInfo = null;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: {
          message:
            'Authorization header is required. Please provide a valid API token.',
          type: 'invalid_request_error',
        },
      },
      { status: 401 }
    );
  }

  const token = authHeader.split(' ')[1];
  const verificationResult = await verifyApiToken(token);

  if (!verificationResult.valid) {
    return NextResponse.json(
      {
        error: {
          message: verificationResult.error || 'Invalid API token.',
          type: 'invalid_request_error',
        },
      },
      { status: 401 }
    );
  }

  userInfo = verificationResult.userInfo;
  tokenInfo = verificationResult.tokenInfo;
  tokenHash = tokenInfo.tokenHash;

  // If X-User-Name header is missing, fetch actual name from DB
  let actualUserName = request.headers.get('x-user-name');
  if (!actualUserName && userInfo?.userId) {
    try {
      const { query } = await import('@/lib/postgres');
      const userResult = await query(
        'SELECT name FROM users WHERE id = $1 LIMIT 1',
        [userInfo.userId]
      );
      if (userResult.rows.length > 0 && userResult.rows[0].name) {
        actualUserName = userResult.rows[0].name;
      }
    } catch (error) {
      logger.error('[X-User-Name] DB query failed:', error);
      // Continue even if lookup fails
    }
  }

  // Collect additional header metadata for external API logging
  const identificationHeaders = {
    // === Basic proxy information ===
    xForwardedFor: request.headers.get('x-forwarded-for'),
    xRealIP: request.headers.get('x-real-ip'),
    xForwardedProto: request.headers.get('x-forwarded-proto'),
    xForwardedHost: request.headers.get('x-forwarded-host'),

    // === Client information ===
    acceptLanguage: request.headers.get('accept-language'),
    acceptEncoding: request.headers.get('accept-encoding'),
    acceptCharset: request.headers.get('accept-charset'),
    referer: request.headers.get('referer'),
    origin: request.headers.get('origin'),
    contentType: request.headers.get('content-type'),

    // === Security and authentication ===
    authorization: authHeader ? 'present' : 'absent',
    tokenHash: tokenHash || null,

    // === User info extracted from JWT (if available) ===
    ...(userInfo && {
      jwtUserId: userInfo.userId,
      jwtEmail: userInfo.email,
      jwtName: userInfo.name,
      jwtRole: userInfo.role,
      jwtDepartment: userInfo.department,
      jwtCell: userInfo.cell,
    }),

    // === Token metadata ===
    ...(tokenInfo && {
      tokenIssuedAt: tokenInfo.issuedAt,
      tokenExpiresAt: tokenInfo.expiresAt,
      tokenIsExpired: tokenInfo.isExpired,
    }),

    // === Custom identification headers (priority: header > DB lookup > JWT) ===
    // User identification
    xUserId: request.headers.get('x-user-id') || userInfo?.userId || null,
    xUserName: actualUserName || null,
    xUserEmail: request.headers.get('x-user-email') || userInfo?.email || null,

    // Organization/project identification
    xOrganizationId: request.headers.get('x-organization-id'),
    xProjectId: request.headers.get('x-project-id'),
    xEnvironment: request.headers.get('x-environment'), // 'dev', 'staging', 'prod'

    // Client information
    xRequestedWith: request.headers.get('x-requested-with'),
    xClientName: request.headers.get('x-client-name'),
    xClientVersion: request.headers.get('x-client-version'),
    xWorkspace: request.headers.get('x-workspace'),
    xSessionId: request.headers.get('x-session-id'),
    xRequestId: request.headers.get('x-request-id'), // Unique ID for request tracing

    // === Timezone information ===
    timezone:
      request.headers.get('x-timezone') ||
      request.headers.get('timezone') ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-User-Id, X-Organization-Id, X-Project-Id, X-Environment, X-Client-Name, X-Client-Version, X-User-Name, X-Workspace, X-Session-Id, X-Request-Id',
  };

  try {
    // Read and preserve raw request body text first (for recovering improperly serialized objects)
    let rawBodyText = null;
    let body;
    try {
      rawBodyText = await request.text();
      body = JSON.parse(rawBodyText);
    } catch (jsonError) {
      logger.error('[OpenAI Chat Completions] JSON parse error:', jsonError);
      if (rawBodyText) {
        logger.error(
          '[OpenAI Chat Completions] Raw body that failed to parse:',
          rawBodyText.substring(0, 1000)
        );
      }
      return NextResponse.json(
        {
          error: {
            message: 'Invalid JSON in request body',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate OpenAI format
    if (!body.model || !body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json(
        {
          error: {
            message: 'Missing required fields: model and messages',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    let { model, messages, stream = false, tools, tool_choice, temperature, max_tokens, top_p, stop, presence_penalty, frequency_penalty, seed, response_format, n, user } = body;
    tools = normalizeToolsPayload(tools);
    tool_choice = normalizeToolChoicePayload(tool_choice);

    // Validate and normalize the content field in the messages array
    // Handle cases where content is an object or array, and detect improperly serialized "[object Object]" strings
    // Create a deep copy to preserve the original
    const originalMessages = JSON.parse(JSON.stringify(body.messages || []));

    for (let index = 0; index < messages.length; index++) {
      const msg = messages[index];

      if (!msg || typeof msg !== 'object') {
        logger.warn(
          `[OpenAI Chat Completions] Invalid message format (index ${index}):`,
          msg
        );
        continue;
      }

      const { role, content } = msg;

      // If content is an improperly serialized string starting with "[object Object]"
      if (typeof content === 'string' && content.includes('[object Object]')) {
        logger.warn(
          `[OpenAI Chat Completions] Detected improperly serialized content (index ${index}): "${content.substring(
            0,
            100
          )}"`
        );

        // Re-check this message's content in the original body
        const originalMsg = originalMessages[index];
        if (
          originalMsg &&
          originalMsg.content &&
          typeof originalMsg.content !== 'string'
        ) {
          // If original is object/array, use it correctly
          messages[index] = {
            ...msg,
            content: originalMsg.content,
          };
          continue;
        }

        // If original is also a string, try checking raw data from original body
        const rawBodyMsg = body.messages && body.messages[index];
        if (
          rawBodyMsg &&
          rawBodyMsg.content &&
          typeof rawBodyMsg.content !== 'string'
        ) {
          messages[index] = {
            ...msg,
            content: rawBodyMsg.content,
          };
          continue;
        }

        // If original is also a string, try extracting this message from raw JSON text
        if (rawBodyText) {
          try {
            const rawBodyParsed = JSON.parse(rawBodyText);
            const rawMessage =
              rawBodyParsed.messages && rawBodyParsed.messages[index];
            if (
              rawMessage &&
              rawMessage.content &&
              typeof rawMessage.content !== 'string'
            ) {
              messages[index] = {
                ...msg,
                content: rawMessage.content,
              };
              continue;
            }
          } catch (e) {
            logger.warn(
              '[OpenAI Chat Completions] Failed to parse rawBody:',
              e?.message || e
            );
          }
        }

        // If original is also a string, return an error
        logger.error(
          `[OpenAI Chat Completions] Unable to recover improperly serialized content (index ${index})`
        );
        return NextResponse.json(
          {
            error: {
              message: `Invalid content format in message at index ${index}. Content appears to be incorrectly serialized: "${content.substring(
                0,
                100
              )}". Please ensure content is properly serialized as a string, array, or valid object.`,
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // If content is an object (single object, not array) - might not be OpenAI multimodal format
      if (content && typeof content === 'object' && !Array.isArray(content)) {
        // Check whether it is OpenAI multimodal format (has type field)
        if (!content.type) {
          logger.warn(
            `[OpenAI Chat Completions] content is object format but not multimodal format (index ${index}). Converting to JSON string.`
          );
          // Convert object to JSON string
          try {
            messages[index] = {
              ...msg,
              content: JSON.stringify(content),
            };
          } catch (e) {
            logger.error(
              `[OpenAI Chat Completions] Failed to serialize content object (index ${index}):`,
              e
            );
            return NextResponse.json(
              {
                error: {
                  message: `Failed to serialize content object in message at index ${index}.`,
                  type: 'invalid_request_error',
                },
              },
              { status: 400, headers: corsHeaders }
            );
          }
        }
      }
    }

    // Parse server info from model name (e.g., "spark-ollama-gemma3:27b")
    let { serverName, modelName: parsedModelName } = parseModelName(model);

    // Determine actual model name (use parsed model name if server info exists, otherwise use original)
    let actualModelName = serverName ? parsedModelName : model;

    // Convert model name to actual model ID (supports display names)
    const resolvedModel = await resolveModelId(actualModelName);
    if (resolvedModel !== actualModelName) {
      actualModelName = resolvedModel;
    }

    // Set final model name
    model = actualModelName;

    const matchedModel =
      (await findModelRecord(model)) || (await findModelRecord(actualModelName));
    if (matchedModel) {
      messages = applyMultiturnLimit(
        messages,
        matchedModel.multiturnLimit,
        matchedModel.multiturnUnlimited
      );
    }
    const manualEndpoint =
      matchedModel?.endpoint && String(matchedModel.endpoint).trim().toLowerCase() === 'manual';

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
      } catch (error) {
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

      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg?.role === 'user')?.content;

      const context = {
        apiKey: (matchedModel.apiKey || process.env.OPENAI_API_KEY || '').trim(),
        messages,
        message:
          typeof lastUserMessage === 'string'
            ? lastUserMessage
            : JSON.stringify(lastUserMessage || ''),
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
      const headers = applyTemplate(manualConfig?.headers || {}, context);
      let body = applyTemplate(manualConfig?.body, context);
      const manualStreamSupported = manualConfig?.stream === true;
      const manualStreamEnabled = stream === true;

      if (
        manualUrl.includes('/v1/responses') &&
        body &&
        typeof body === 'object' &&
        body.input === context.message &&
        Array.isArray(context.messages) &&
        context.messages.length > 1
      ) {
        body = { ...body, input: context.messages };
      }

      if (manualStreamEnabled && !manualStreamSupported) {
        return NextResponse.json(
          {
            error: {
              message: 'Manual API does not support streaming on this endpoint.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      if (body && typeof body === 'object') {
        if (manualStreamEnabled) {
          body = { ...body, stream: true };
        } else if (body.stream !== undefined) {
          body = { ...body, stream: false };
        }
      }

      const requestOptions = {
        method,
        headers,
      };
      if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
        requestOptions.body =
          typeof body === 'string' ? body : JSON.stringify(body);
      }

      const startAt = Date.now();
      let manualRes;
      try {
        manualRes = await fetch(manualUrl, requestOptions);
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              message: `Model server connection error: ${error.message}`,
              type: 'server_error',
              details: {
                endpoint: manualUrl,
                error: error.message,
              },
            },
          },
          { status: 500, headers: corsHeaders }
        );
      }

      const responseTime = Date.now() - startAt;
      const promptTokens = messages.reduce(
        (acc, msg) => acc + (msg.content?.length || 0),
        0
      );

      const manualRetryCount = 0;

      if (!manualRes.ok) {
        const errorText = await manualRes.text().catch(() => '');
        Promise.all([
          logOpenAIProxyRequest({
            provider: 'manual',
            level: 'error',
            category: 'openai_proxy_chat',
            endpoint: '/v1/chat/completions',
            model,
            clientIP,
            userAgent,
            userId: userInfo?.userId,
            responseTime,
            statusCode: manualRes.status,
            error: errorText,
            promptTokens,
            completionTokens: 0,
            totalTokens: promptTokens,
          }),
          logExternalApiRequest({
            sourceType: 'external',
            provider: 'manual',
            apiType: 'chat',
            endpoint: '/v1/chat/completions',
            model,
            messages: [
              ...messages,
              ...(responseContent
                ? [{ role: 'assistant', content: responseContent }]
                : []),
            ],
            responseTokenCount: 0,
            promptTokenCount: promptTokens,
            responseTime,
            statusCode: manualRes.status,
            isStream: false,
            error: errorText,
            retryCount: manualRetryCount,
            clientIP,
            userAgent,
            jwtUserId: userInfo?.userId,
            jwtEmail: userInfo?.email,
            jwtName: actualUserName || userInfo?.name,
            jwtRole: userInfo?.role,
            jwtDepartment: userInfo?.department,
            jwtCell: userInfo?.cell,
            tokenHash: tokenInfo?.tokenHash,
            tokenName: tokenInfo?.name,
            ...identificationHeaders,
          }),
        ]).catch((logError) => {
          logger.error('[OpenAI Chat Completions] Logging failed:', logError);
        });

        return NextResponse.json(
          {
            error: {
              message: `Model server error: ${manualRes.status}`,
              type: 'server_error',
            },
          },
          { status: manualRes.status, headers: corsHeaders }
        );
      }

      if (manualStreamEnabled) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');
        let streamedResponseLength = 0;
        let streamedResponseText = '';
        let sawDelta = false;
        let firstResponseAt = null;

        const streamResponse = new ReadableStream({
          async start(controller) {
            const reader = manualRes.body.getReader();
            let buffer = '';
            let currentEvent = '';

            const emitDelta = (text) => {
              if (!text) return;
              sawDelta = true;
              if (!firstResponseAt) {
                firstResponseAt = Date.now();
              }
              streamedResponseText += text;
              streamedResponseLength += text.length;
              const payload = {
                id: createChatCompletionId(),
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: { content: text },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            };

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (!line.trim()) {
                    currentEvent = '';
                    continue;
                  }
                  if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                    continue;
                  }
                  if (!line.startsWith('data:')) continue;

                  const data = line.slice(5).trim();
                  if (data === '[DONE]') {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                    return;
                  }

                  let parsed;
                  try {
                    parsed = JSON.parse(data);
                  } catch (error) {
                    continue;
                  }

                  if (parsed?.choices?.[0]?.delta?.content) {
                    emitDelta(parsed.choices[0].delta.content);
                    continue;
                  }

                  if (
                    currentEvent === 'response.output_text.delta' ||
                    parsed?.type === 'response.output_text.delta'
                  ) {
                    emitDelta(parsed?.delta);
                    continue;
                  }

                  if (
                    currentEvent === 'response.output_text.done' ||
                    parsed?.type === 'response.output_text.done'
                  ) {
                    if (!sawDelta) {
                      emitDelta(parsed?.text);
                    }
                  }
                }
              }
            } catch (streamError) {
              controller.error(streamError);
            } finally {
              const loggedMessages = streamedResponseText
                ? [
                    ...messages,
                    { role: 'assistant', content: streamedResponseText },
                  ]
                : messages;
              Promise.all([
                logOpenAIProxyRequest({
                  provider: 'manual',
                  level: 'info',
                  category: 'openai_proxy_chat',
                  endpoint: '/v1/chat/completions',
                  model,
                  clientIP,
                  userAgent,
                  userId: userInfo?.userId,
                  responseTime: Date.now() - startAt,
                  statusCode: manualRes.status,
                  promptTokens,
                  completionTokens: streamedResponseLength,
                  totalTokens: promptTokens + streamedResponseLength,
                }),
                logExternalApiRequest({
                  sourceType: 'external',
                  provider: 'manual',
                  apiType: 'chat',
                  endpoint: '/v1/chat/completions',
                  model,
                  messages: loggedMessages,
                  responseTokenCount: streamedResponseLength,
                  promptTokenCount: promptTokens,
                  responseTime: Date.now() - startAt,
                  firstResponseTime: firstResponseAt
                    ? firstResponseAt - startAt
                    : Date.now() - startAt,
                  finalResponseTime: Date.now() - startAt,
                  statusCode: manualRes.status,
                  isStream: true,
                  retryCount: manualRetryCount,
                  clientIP,
                  userAgent,
                  jwtUserId: userInfo?.userId,
                  jwtEmail: userInfo?.email,
                  jwtName: actualUserName || userInfo?.name,
                  jwtRole: userInfo?.role,
                  jwtDepartment: userInfo?.department,
                  jwtCell: userInfo?.cell,
                  tokenHash: tokenInfo?.tokenHash,
                  tokenName: tokenInfo?.name,
                  ...identificationHeaders,
                }),
              ]).catch((logError) => {
                logger.error('[OpenAI Chat Completions] Logging failed:', logError);
              });

              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          },
        });

        return new Response(streamResponse, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            ...corsHeaders,
          },
        });
      }

      let responseText = '';
      let responseJson = null;
      const contentType = manualRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseJson = await manualRes.json();
      } else {
        responseText = await manualRes.text();
      }

      let responseContent = '';
      if (responseJson && manualConfig?.responseMapping?.path) {
        const mapped = getValueByPath(
          responseJson,
          manualConfig.responseMapping.path
        );
        responseContent =
          typeof mapped === 'string' ? mapped : JSON.stringify(mapped || '');
      } else if (responseJson) {
        responseContent =
          responseJson.choices?.[0]?.message?.content ||
          responseJson.choices?.[0]?.text ||
          JSON.stringify(responseJson);
      } else {
        responseContent = responseText;
      }

      const completionTokens = responseContent.length;
      const openaiResponse = {
        id: createChatCompletionId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseContent,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      };

      Promise.all([
        logOpenAIProxyRequest({
          provider: 'manual',
          level: 'info',
          category: 'openai_proxy_chat',
          endpoint: '/v1/chat/completions',
          model,
          clientIP,
          userAgent,
          userId: userInfo?.userId,
          responseTime,
          statusCode: manualRes.status,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        }),
        logExternalApiRequest({
          sourceType: 'external',
          provider: 'manual',
          apiType: 'chat',
          endpoint: '/v1/chat/completions',
          model,
          messages,
          responseTokenCount: completionTokens,
          promptTokenCount: promptTokens,
          responseTime,
          statusCode: manualRes.status,
          isStream: false,
          retryCount: manualRetryCount,
          clientIP,
          userAgent,
          jwtUserId: userInfo?.userId,
          jwtEmail: userInfo?.email,
          jwtName: actualUserName || userInfo?.name,
          jwtRole: userInfo?.role,
          jwtDepartment: userInfo?.department,
          jwtCell: userInfo?.cell,
          tokenHash: tokenInfo?.tokenHash,
          tokenName: tokenInfo?.name,
          ...identificationHeaders,
        }),
      ]).catch((logError) => {
        logger.error('[OpenAI Chat Completions] Logging failed:', logError);
      });

      return NextResponse.json(openaiResponse, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // If model ID was converted, parse again to extract server name
    // (Server name may change when converted by partial match)
    const reparsed = parseModelName(model);

    // Check server name from DB configuration (most accurate)
    const { getServerNameForModel, getModelServerEndpointsByName } =
      await import('@/lib/modelServers');
    const dbServerName = await getServerNameForModel(model);

    if (dbServerName) {
      // Verify server name found in DB config actually exists
      const serverEndpoints = await getModelServerEndpointsByName(dbServerName);
      if (serverEndpoints && serverEndpoints.length > 0) {
        // Use it because this server name actually exists
        serverName = dbServerName;
      } else {
        // Ignore it because server name from DB does not actually exist
        logger.warn(
          `[OpenAI Chat Completions] Server name "${dbServerName}" found in DB does not actually exist. Server name will not be used.`
        );
        serverName = null;
      }
    } else if (!serverName && reparsed.serverName) {
      // If not found in DB and original parse has no server name, validate reparsed result before use
      const serverEndpoints = await getModelServerEndpointsByName(
        reparsed.serverName
      );
      if (serverEndpoints && serverEndpoints.length > 0) {
        serverName = reparsed.serverName;
      } else {
        // Ignore parsed server name because it does not actually exist
        serverName = null;
      }
    }

    // If server name is specified, call that server directly; otherwise use round robin
    let modelServerEndpoint;
    let provider;
    let endpointApiKey = '';
    let roundRobinIndex = null;

    if (serverName) {
      // Call using specified server name (round robin if multiple servers share same name)
      const serverEndpoint = await getModelServerEndpointByName(serverName);
      if (serverEndpoint) {
        modelServerEndpoint = serverEndpoint.endpoint;
        provider = serverEndpoint.provider;
        endpointApiKey = serverEndpoint.apiKey || '';
        roundRobinIndex = serverEndpoint.index;
      } else {
        logger.error(
          `[OpenAI Chat Completions] Server name "${serverName}" not found. Model "${model}" exists only in that server group.`
        );
        return NextResponse.json(
          {
            error: {
              message: `Model server group "${serverName}" not found for model "${model}". Please check the model configuration.`,
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      // If server name is missing, try display-name-based round robin
      const labelBasedEndpoint = await getModelServerEndpointByLabel(model);
      if (labelBasedEndpoint) {
        modelServerEndpoint = labelBasedEndpoint.endpoint;
        provider = labelBasedEndpoint.provider;
        endpointApiKey = labelBasedEndpoint.apiKey || '';
        roundRobinIndex = labelBasedEndpoint.index;
      } else {
        // If display-name-based round robin also fails, use global round robin
        const roundRobinResult = await getNextModelServerEndpointWithIndex();
        modelServerEndpoint = roundRobinResult?.endpoint;
        provider = roundRobinResult?.provider;
        endpointApiKey = roundRobinResult?.apiKey || '';
        roundRobinIndex = roundRobinResult?.index;
      }
    }

    if (!modelServerEndpoint) {
      logger.error(
        '[OpenAI Chat Completions] Model server endpoint is not configured.'
      );
      return NextResponse.json(
        {
          error: {
            message:
              'Model server endpoint not configured. Please configure model server in admin settings or set OLLAMA_ENDPOINTS environment variable.',
            type: 'server_error',
          },
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // Retrieve API key (for Gemini provider)
    let apiKey = endpointApiKey;
    if (provider === 'openai-compatible' && !apiKey) {
      apiKey = process.env.OPENAI_COMPAT_API_KEY || '';
    }
    if (provider === 'gemini') {
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
            (e) => e.url && e.url.trim() === modelServerEndpoint.trim()
          );
          if (endpointConfig && endpointConfig.apiKey) {
            apiKey = endpointConfig.apiKey;
          }
        }
      } catch (e) {
        logger.warn('[OpenAI Chat Completions] Failed to retrieve API key:', e.message);
      }
      if (!apiKey) {
        return NextResponse.json(
          {
            error: {
              message: 'Gemini API key is required but not configured.',
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Determine endpoint path based on provider
    // openai-compatible: /v1/chat/completions
    // gemini: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
    // model-server (Ollama): /api/chat
    let modelServerUrl;
    if (provider === 'gemini') {
      const baseUrl =
        modelServerEndpoint.replace(/\/+$/, '') ||
        'https://generativelanguage.googleapis.com';

      // Normalize Gemini model name
      // 1. Remove "models/" prefix (format returned by Gemini API)
      // 2. Remove version tag (:latest, etc.)
      // 3. Trim whitespace
      // Example: "models/gemini-pro:latest" -> "gemini-pro"
      let normalizedModel = model.trim();

      // Remove "models/" prefix
      if (normalizedModel.startsWith('models/')) {
        normalizedModel = normalizedModel.substring(7);
      }

      // Remove version tag (part after colon)
      normalizedModel = normalizedModel.split(':')[0].trim();

      // Remove remaining slash if present (safety guard)
      normalizedModel = normalizedModel.split('/').pop().trim();

      if (!normalizedModel) {
        return NextResponse.json(
          {
            error: {
                message: `Invalid model name: "${model}"`,
              type: 'invalid_request_error',
            },
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const action = stream ? 'streamGenerateContent' : 'generateContent';
      modelServerUrl = buildGeminiGenerateUrl(baseUrl, normalizedModel, action);

      logger.info(
        `[OpenAI Chat Completions] Calling Gemini API: model=${normalizedModel} (original=${model})`
      );
    } else {
      modelServerUrl =
        provider === 'openai-compatible'
          ? buildOpenAiEndpoint(modelServerEndpoint, '/chat/completions')
          : `${modelServerEndpoint.replace(/\/+$/, '')}/api/chat`;
    }

    // Determine request body format based on provider
    let requestBody;
    if (provider === 'gemini') {
      // Convert to Gemini API format
      const convertToGeminiFormat = (messages) => {
        const contents = [];
        for (const msg of messages) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const parts = [];

          // Convert content to string
          let textContent = '';
          if (typeof msg.content === 'string') {
            textContent = msg.content;
          } else if (Array.isArray(msg.content)) {
            textContent = msg.content
              .map((item) => {
                if (typeof item === 'string') return item;
                if (item?.type === 'text' && item.text) return item.text;
                return '';
              })
              .filter(Boolean)
              .join('\n');
          } else if (msg.content && typeof msg.content === 'object') {
            textContent = JSON.stringify(msg.content);
          } else {
            textContent = String(msg.content || '');
          }

          if (textContent) {
            parts.push({ text: textContent });
          }

          if (parts.length > 0) {
            contents.push({ role, parts });
          }
        }
        return { contents };
      };

      requestBody = convertToGeminiFormat(messages);
    } else if (provider === 'openai-compatible') {
      // OpenAI-compatible server: use original OpenAI format as-is (pass through all params including tools/tool_choice)
      requestBody = {
        model,
        messages,
        stream,
        ...(tools !== undefined && { tools }),
        ...(tool_choice !== undefined && { tool_choice }),
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { max_tokens }),
        ...(top_p !== undefined && { top_p }),
        ...(stop !== undefined && { stop }),
        ...(presence_penalty !== undefined && { presence_penalty }),
        ...(frequency_penalty !== undefined && { frequency_penalty }),
        ...(seed !== undefined && { seed }),
        ...(response_format !== undefined && { response_format }),
        ...(n !== undefined && { n }),
        ...(user !== undefined && { user }),
      };
    } else {
      // Ollama server: convert OpenAI format to Ollama format
      // Ollama only accepts string content, while OpenAI also supports arrays (multimodal)
      const convertContentToString = (content) => {
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          // Handle multimodal content arrays
          return content
            .map((item) => {
              if (typeof item === 'string') {
                return item;
              }
              if (item && typeof item === 'object') {
                // Handle OpenAI multimodal format
                if (item.type === 'text' && item.text) {
                  return item.text;
                }
                if (item.type === 'image_url') {
                  // Ollama does not support images, so warn and ignore
                  logger.warn(
                    '[OpenAI Chat Completions] Image content is not supported by Ollama.'
                  );
                  return '';
                }
                // For plain objects without a type field, convert to JSON string
                try {
                  return JSON.stringify(item, null, 2);
                } catch (e) {
                  logger.warn(
                    '[OpenAI Chat Completions] Failed to serialize array item:',
                    e
                  );
                  return String(item);
                }
              }
              // Convert other types to strings
              return String(item || '');
            })
            .filter(Boolean)
            .join('\n');
        }
        // Convert object to JSON string
        if (content && typeof content === 'object') {
          try {
            return JSON.stringify(content, null, 2);
          } catch (e) {
            logger.warn(
              `[OpenAI Chat Completions] ⚠️ Failed to serialize content object: original type=${typeof content}, value=${JSON.stringify(
                content
              )}`
            );
            return String(content || '');
          }
        }
        // Convert other types to strings
        const converted = String(content || '');
        if (
          converted === '[object Object]' ||
          converted.includes('[object Object]')
        ) {
          logger.warn(
            `[OpenAI Chat Completions] ⚠️ content converted to "[object Object]": original type=${typeof content}, value=${JSON.stringify(
              content
            )}`
          );
        }
        return converted;
      };

      const ollamaMessages = messages.map((msg, idx) => {
        const originalContent = msg.content;
        const convertedContent = convertContentToString(msg.content);

        return {
          role: msg.role,
          content: convertedContent,
        };
      });

      // Build Ollama options (temperature, etc. under options)
      const ollamaOptions = {};
      if (temperature !== undefined) ollamaOptions.temperature = temperature;
      if (top_p !== undefined) ollamaOptions.top_p = top_p;
      if (max_tokens !== undefined) ollamaOptions.num_predict = max_tokens;
      if (stop !== undefined) ollamaOptions.stop = Array.isArray(stop) ? stop : [stop];

      requestBody = {
        model,
        messages: ollamaMessages,
        stream,
        ...(tools !== undefined && { tools }),
        ...(tool_choice !== undefined && { tool_choice }),
        ...(Object.keys(ollamaOptions).length > 0 && { options: ollamaOptions }),
      };
    }

    /**
     * Execute a single model server call
     * @param {string} url - model server URL
     * @param {object} options - fetch options
     * @returns {Promise<Response>} model server response
     */
    async function fetchModelServer(url, options) {
      // Configure timeout (can be set via environment variable)
      const timeoutMs = stream
        ? MODEL_SERVER_TIMEOUT_STREAM
        : MODEL_SERVER_TIMEOUT_NORMAL;

      // Configure timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const fetchOptions = {
          ...options,
          signal: controller.signal,
        };

        const response = await fetch(url, fetchOptions);

        // Clear timeout on success
        clearTimeout(timeoutId);

        return response;
      } catch (fetchErr) {
        // Clear timeout when fetch fails
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    }

    /**
     * Model server call helper (includes retry logic)
     * If first attempt succeeds, retry logic is not executed
     * @param {string} url - model server URL
     * @param {object} options - fetch options
     * @param {number} maxRetries - maximum retry count
     * @param {string} specifiedServerName - specified server name (if any)
     * @param {string} currentProvider - current provider
     * @param {string} modelId - model ID (for display-name-based round robin)
     * @returns {Promise<{response: Response, retryCount: number}>} model server response and retry count
     */
    async function fetchWithRetry(
      url,
      options,
      maxRetries = 2,
      specifiedServerName = null,
      currentProvider = 'model-server',
      modelId = null
    ) {
      // First attempt (skip retry logic if it succeeds immediately)
      try {
        const response = await fetchModelServer(url, options);

        // Check HTTP response status code
        if (!response.ok) {
          const status = response.status;
          const isRetryableHttpError =
            status === 404 || // Not Found
            status === 502 || // Bad Gateway
            status === 503 || // Service Unavailable
            status === 504; // Gateway Timeout

          // Read HTTP error response body (to inspect error details)
          let errorBody = '';
          try {
            const clonedResponse = response.clone();
            errorBody = await clonedResponse.text();
          } catch (e) {
            logger.warn(
              '[OpenAI Chat Completions] Failed to read response body:',
              e?.message || e
            );
          }

          if (isRetryableHttpError && maxRetries > 0) {
            logger.error(
              `[OpenAI Chat Completions] HTTP ${status} error, will retry`
            );
          } else {
            logger.error(
              `[OpenAI Chat Completions] HTTP ${status} error: ${errorBody.substring(
                0,
                200
              )}`
            );
            return { response, retryCount: 1 };
          }

          // If retryable error, proceed to retry logic
        } else {
          // Succeeded on first attempt - do not run retry logic
          return { response, retryCount: 1 };
        }
      } catch (error) {
        // Check whether this is a network error
        const isRetryable =
          error.name === 'AbortError' ||
          error.name === 'TimeoutError' ||
          error.code === 'ECONNREFUSED' ||
          error.code === 'ETIMEDOUT' ||
          error.message?.includes('fetch failed') ||
          error.message?.includes('timeout');

        // If not retryable, throw immediately
        if (!isRetryable || maxRetries === 0) {
          logger.error(
            `[OpenAI Chat Completions] Model server call failed (not retryable): ${error.message}`
          );
          throw error;
        }

        // If retryable error, proceed to retry logic
        logger.warn(
          `[OpenAI Chat Completions] Model server call failed, will retry: ${error.message}`
        );
      }

      // Retry logic (runs only when first attempt fails)
      let lastError;
      let lastResponse;
      let retryUrl = url; // Initial value is the original URL

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // If a server is specified, retry on the same server; otherwise retry on another instance
          let nextEndpoint;
          let nextProvider;
          let nextApiKey = '';

          if (specifiedServerName) {
            // Retry on the specified server (round robin if multiple servers share the same name)
            const serverEndpoint = await getModelServerEndpointByName(
              specifiedServerName
            );
            if (serverEndpoint) {
              nextEndpoint = serverEndpoint.endpoint;
              nextProvider = serverEndpoint.provider;
              nextApiKey = serverEndpoint.apiKey || '';
            } else {
              // Use the original URL if specified server cannot be found
              nextEndpoint = url.split('/api/')[0].split('/v1/')[0];
              nextProvider = currentProvider;
            }
          } else {
            // If server name is missing, try display-name-based round robin
            if (modelId) {
              const labelBasedEndpoint = await getModelServerEndpointByLabel(
                modelId
              );
              if (labelBasedEndpoint) {
                nextEndpoint = labelBasedEndpoint.endpoint;
                nextProvider = labelBasedEndpoint.provider;
                nextApiKey = labelBasedEndpoint.apiKey || '';
              } else {
                // If display-name-based round robin also fails, use global round robin
                const roundRobinResult =
                  await getNextModelServerEndpointWithIndex();
                nextEndpoint = roundRobinResult.endpoint;
                nextProvider = roundRobinResult.provider;
                nextApiKey = roundRobinResult.apiKey || '';
              }
            } else {
              // Round robin: retry with another model server instance
              const roundRobinResult =
                await getNextModelServerEndpointWithIndex();
              nextEndpoint = roundRobinResult.endpoint;
              nextProvider = roundRobinResult.provider;
              nextApiKey = roundRobinResult.apiKey || '';
            }
          }

          // For Gemini provider, fetch API key and build URL
          if (nextProvider === 'gemini') {
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
                  (e) => e.url && e.url.trim() === nextEndpoint.trim()
                );
                if (endpointConfig && endpointConfig.apiKey) {
                  nextApiKey = endpointConfig.apiKey;
                }
              }
            } catch (e) {
              logger.warn(
                '[OpenAI Chat Completions] Failed to retrieve API key during retry:',
                e.message
              );
            }
            if (nextApiKey) {
              const baseUrl =
                nextEndpoint.replace(/\/+$/, '') ||
                'https://generativelanguage.googleapis.com';
              const action = stream
                ? 'streamGenerateContent'
                : 'generateContent';
              retryUrl = buildGeminiGenerateUrl(
                baseUrl,
                modelId || model,
                action
              );
              options = {
                ...options,
                headers: buildUpstreamHeaders(nextProvider, nextApiKey),
              };
            } else {
              // Cannot retry without API key
              throw new Error('Gemini API key not found for retry');
            }
          } else {
            if (nextProvider === 'openai-compatible' && !nextApiKey) {
              nextApiKey = process.env.OPENAI_COMPAT_API_KEY || '';
            }
            options = {
              ...options,
              headers: buildUpstreamHeaders(nextProvider, nextApiKey),
            };
            retryUrl =
              nextProvider === 'openai-compatible'
                ? buildOpenAiEndpoint(nextEndpoint, '/chat/completions')
                : `${nextEndpoint.replace(/\/+$/, '')}/api/chat`;
          }

          // Wait before retry (can be configured via environment variable)
          await new Promise((resolve) =>
            setTimeout(resolve, MODEL_SERVER_RETRY_DELAY)
          );

          const response = await fetchModelServer(retryUrl, options);

          // Check HTTP response status code
          if (!response.ok) {
            const status = response.status;
            const isRetryableHttpError =
              status === 404 ||
              status === 502 ||
              status === 503 ||
              status === 504;

            // Read HTTP error response body
            let errorBody = '';
            try {
              const clonedResponse = response.clone();
              errorBody = await clonedResponse.text();
            } catch (e) {
              logger.warn(
                '[OpenAI Chat Completions] Failed to read response body:',
                e?.message || e
              );
            }

            if (isRetryableHttpError && attempt < maxRetries) {
              logger.warn(
                `[OpenAI Chat Completions] HTTP ${status} error, retrying...`
              );
              lastResponse = response;
              continue;
            }

            // Return response for non-retryable HTTP errors
            logger.error(
              `[OpenAI Chat Completions] HTTP ${status} error: ${errorBody.substring(
                0,
                200
              )}`
            );
            return { response, retryCount: attempt + 1 };
          }

          // Successful response
          return { response, retryCount: attempt + 1 };
        } catch (error) {
          lastError = error;

          // Check whether this is a retryable network error
          const isRetryable =
            error.name === 'AbortError' ||
            error.name === 'TimeoutError' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT' ||
            error.message?.includes('fetch failed') ||
            error.message?.includes('timeout');

          // Continue if error is retryable and this is not the last attempt
          if (isRetryable && attempt < maxRetries) {
            logger.warn(
              `[OpenAI Chat Completions] Retry ${
                attempt + 1
              }/${maxRetries} failed: ${error.message}`
            );
            continue;
          }

          // Throw error if not retryable or this is the last attempt
          logger.error(
            `[OpenAI Chat Completions] Model server call failed: ${error.message}`
          );
          throw error;
        }
      }

      // Return final response or error after all retries fail
      if (lastResponse) {
        return { response: lastResponse, retryCount: maxRetries + 1 };
      }
      throw lastError;
    }

    const stringifiedBody = JSON.stringify(requestBody);

    let modelServerRes;
    let retryCount = 1; // Default: success on first attempt
    try {
      const fetchResult = await fetchWithRetry(
        modelServerUrl,
        {
          method: 'POST',
          headers: buildUpstreamHeaders(provider, apiKey),
          body: stringifiedBody,
        },
        2, // Maximum 2 retries (3 attempts total)
        serverName || null, // Pass specified server name
        provider, // Pass current provider
        model // Model ID (for display-name-based round robin)
      );
      modelServerRes = fetchResult.response;
      retryCount = fetchResult.retryCount;
    } catch (fetchError) {
      const responseTime = Date.now() - startTime;
      const errorMessage = fetchError.message || 'Unknown error';
      const isConnectionRefused =
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('fetch failed');
      const isTimeout =
        errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT');

      logger.error('[OpenAI Chat Completions] Model server connection error:', {
        url: redactEndpointForLog(modelServerUrl),
        error: errorMessage,
        type: fetchError.name || 'Unknown',
        code: fetchError.code,
      });

      // Guidance for connection issues in Docker environments
      if (isConnectionRefused) {
        logger.error(
          '[OpenAI Chat Completions] Connection refused. In Docker environments:',
          '- Use http://host.docker.internal:11434 to access the host Ollama server',
          '- Or use the same network in docker compose.yml',
          '- Or set the OLLAMA_ENDPOINTS environment variable'
        );
      }

      // Run logging in fire-and-forget mode (improves response speed)
      Promise.all([
        logOpenAIProxyRequest({
          provider: 'openai-compatible',
          level: 'error',
          category: 'openai_proxy_chat',
          endpoint: '/v1/chat/completions',
          model,
          clientIP,
          userAgent,
          userId: userInfo?.userId,
          responseTime,
          statusCode: 503,
          error: `Connection error: ${errorMessage}`,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        }),
        logExternalApiRequest({
          sourceType: 'external',
          provider: 'openai-compatible',
          apiType: 'chat',
          endpoint: '/v1/chat/completions',
          model,
          messages,
          responseTokenCount: 0,
          promptTokenCount: 0,
          responseTime,
          statusCode: 503,
          isStream: false,
          error: `Connection error: ${errorMessage}`,
          retryCount: 3, // Maximum retry count (failed)
          clientIP,
          userAgent,
          jwtUserId: userInfo?.userId,
          jwtEmail: userInfo?.email,
          jwtName: actualUserName || userInfo?.name,
          jwtRole: userInfo?.role,
          jwtDepartment: userInfo?.department,
          jwtCell: userInfo?.cell,
          tokenHash: tokenInfo?.tokenHash,
          tokenName: tokenInfo?.name,
          ...identificationHeaders,
        }),
      ]).catch((logError) => {
        logger.error('[OpenAI Chat Completions] Logging failed:', logError);
      });

      // Provide a clearer error message
      let userFriendlyMessage = `Model server connection error: ${errorMessage}`;
      if (isConnectionRefused) {
        userFriendlyMessage +=
          '. Please check if the model server is running and accessible.';
      } else if (isTimeout) {
        userFriendlyMessage +=
          '. The request timed out. Please check the model server status.';
      }

      return NextResponse.json(
        {
          error: {
            message: userFriendlyMessage,
            type: 'server_error',
            details: {
              endpoint: redactEndpointForLog(modelServerUrl),
              error: errorMessage,
            },
          },
        },
        { status: 503, headers: corsHeaders }
      );
    }

    if (!modelServerRes.ok) {
      let errorText = await modelServerRes.text();

      const hasRequestedTools = Array.isArray(tools) && tools.length > 0;

      if (
        hasRequestedTools &&
        isToolUnsupportedByModelError(modelServerRes.status, errorText) &&
        !isToolChoiceRequired(tool_choice)
      ) {
        try {
          const fallbackBodyObj = { ...requestBody };
          delete fallbackBodyObj.tools;
          delete fallbackBodyObj.tool_choice;

          const fallbackRes = await fetchModelServer(modelServerUrl, {
            method: 'POST',
            headers: buildUpstreamHeaders(provider, apiKey),
            body: JSON.stringify(fallbackBodyObj),
          });

          if (fallbackRes.ok) {
            logger.warn(
              '[OpenAI Chat Completions] Model responded that tools are unsupported; retry succeeded after removing tools'
            );
            modelServerRes = fallbackRes;
            retryCount += 1;
          } else {
            errorText = await fallbackRes.text();
            modelServerRes = fallbackRes;
          }
        } catch (fallbackError) {
          logger.error(
            '[OpenAI Chat Completions] tools-removed fallback retry failed:',
            fallbackError?.message || fallbackError
          );
        }
      }

      if (!modelServerRes.ok) {
        const responseTime = Date.now() - startTime;
        logger.error(
          `[OpenAI Chat Completions] Model server error: ${modelServerRes.status}`,
          {
            url: redactEndpointForLog(modelServerUrl),
            status: modelServerRes.status,
            statusText: modelServerRes.statusText,
            error: errorText,
            requestBody: JSON.stringify(requestBody).substring(0, 500),
          }
        );

        // Estimate prompt tokens
        const promptTokens = messages.reduce(
          (acc, msg) => acc + (msg.content?.length || 0),
          0
        );

        // Run logging in fire-and-forget mode (improves response speed)
        Promise.all([
          logOpenAIProxyRequest({
            provider: 'openai-compatible',
            level: 'error',
            category: 'openai_proxy_chat',
            endpoint: '/v1/chat/completions',
            model,
            clientIP,
            userAgent,
            userId: userInfo?.userId,
            responseTime,
            statusCode: modelServerRes.status,
            error: errorText,
            promptTokens,
            completionTokens: 0,
            totalTokens: promptTokens,
          }),
          logExternalApiRequest({
            sourceType: 'external',
            provider: 'openai-compatible',
            apiType: 'chat',
            endpoint: '/v1/chat/completions',
            model,
            messages,
            responseTokenCount: 0,
            promptTokenCount: promptTokens,
            responseTime,
            statusCode: modelServerRes.status,
            isStream: false,
            error: errorText,
            retryCount: retryCount,
            clientIP,
            userAgent,
            jwtUserId: userInfo?.userId,
            jwtEmail: userInfo?.email,
            jwtName: actualUserName || userInfo?.name,
            jwtRole: userInfo?.role,
            jwtDepartment: userInfo?.department,
            jwtCell: userInfo?.cell,
            tokenHash: tokenInfo?.tokenHash,
            tokenName: tokenInfo?.name,
            ...identificationHeaders,
          }),
        ]).catch((logError) => {
          logger.error('[OpenAI Chat Completions] Logging failed:', logError);
        });

        return NextResponse.json(
          {
            error: {
              message: `Model server error: ${modelServerRes.status}`,
              type: 'server_error',
            },
          },
          { status: modelServerRes.status, headers: corsHeaders }
        );
      }
    }

    // Estimate prompt tokens
    const promptTokens = messages.reduce(
      (acc, msg) => acc + (msg.content?.length || 0),
      0
    );

    if (stream) {
      // Handle streaming response
      const encoder = new TextEncoder();
      let accumulatedResponse = '';
      let responseId = createChatCompletionId();
      let created = Math.floor(Date.now() / 1000);

      const stream = new ReadableStream({
        async start(controller) {
          const reader = modelServerRes.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let controllerClosed = false;
          let sseBuffer = '';
          let firstResponseAt = null;

          // Safe enqueue helper function
          const safeEnqueue = (chunk) => {
            if (!controllerClosed) {
              try {
                if (!firstResponseAt) {
                  firstResponseAt = Date.now();
                }
                controller.enqueue(chunk);
              } catch (e) {
                if (e.name === 'TypeError' && e.message.includes('closed')) {
                  controllerClosed = true;
                } else {
                  throw e;
                }
              }
            }
          };

          // Safe close helper function
          const safeClose = async () => {
            // Prevent Next.js App Router race condition:
            // If controller.close() is called immediately, the connection may close
            // before the [DONE] chunk is TCP-flushed, causing a "premature close"
            // error in Continue/Cline. Wait 20ms to let the final chunk reach the client.
            await new Promise((r) => setTimeout(r, 20));
            if (!controllerClosed) {
              try {
                controller.close();
                controllerClosed = true;
              } catch (e) {
                if (e.name === 'TypeError' && e.message.includes('closed')) {
                  controllerClosed = true;
                }
                // Ignore other errors (already closed or in error state)
              }
            }
          };

          const processSseText = (text) => {
            if (!text) return;
            sseBuffer += text;
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content =
                  parsed?.choices?.[0]?.delta?.content ||
                  parsed?.choices?.[0]?.message?.content ||
                  '';
                if (content) accumulatedResponse += content;
              } catch (e) {
                continue;
              }
            }
          };

          try {
            // Read first chunk to detect format
            let firstChunk = null;
            let isSSEFormat =
              provider === 'openai-compatible' || provider === 'gemini';

            if (provider === 'gemini') {
              // Handle Gemini API streaming response
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  const chunk = decoder.decode(value, { stream: true });
                  const lines = chunk.split('\n');

                  for (const line of lines) {
                    if (!line.trim() || controllerClosed) continue;

                    try {
                      // Gemini streaming response uses newline-delimited JSON objects
                      const geminiData = JSON.parse(line);

                      if (geminiData.candidates && geminiData.candidates[0]) {
                        const candidate = geminiData.candidates[0];
                        const content = candidate.content;

                        if (content && content.parts && content.parts[0]) {
                          const text = content.parts[0].text || '';
                          if (text) {
                            accumulatedResponse += text;

                            // Convert to OpenAI SSE format
                            const openaiChunk = {
                              id: responseId,
                              object: 'chat.completion.chunk',
                              created,
                              model,
                              choices: [
                                {
                                  index: 0,
                                  delta: { content: text },
                                  finish_reason: candidate.finishReason || null,
                                },
                              ],
                            };

                            safeEnqueue(
                              encoder.encode(
                                `data: ${JSON.stringify(openaiChunk)}\n\n`
                              )
                            );
                          }
                        }

                        // Handle completion signal
                        if (candidate.finishReason) {
                          const finalChunk = {
                            id: responseId,
                            object: 'chat.completion.chunk',
                            created,
                            model,
                            choices: [
                              {
                                index: 0,
                                delta: {},
                                finish_reason: candidate.finishReason,
                              },
                            ],
                          };
                          safeEnqueue(
                            encoder.encode(
                              `data: ${JSON.stringify(finalChunk)}\n\n`
                            )
                          );
                          safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                          await safeClose();
                          return;
                        }
                      }
                    } catch (e) {
                      // Ignore JSON parse failures (empty lines, etc.)
                      if (line.trim()) {
                        logger.warn(
                          '[OpenAI Chat Completions] Gemini JSON parse failed:',
                          line.substring(0, 100)
                        );
                      }
                    }
                  }
                }

                // End stream
                safeEnqueue(encoder.encode('data: [DONE]\n\n'));
                await safeClose();
              } catch (error) {
                logger.error(
                  '[OpenAI Chat Completions] Gemini streaming error:',
                  error
                );
                await safeClose();
              }
              return;
            }

            if (!isSSEFormat) {
              // If provider is model-server, detect actual response format
              const peekResult = await reader.read();
              if (peekResult.done) {
                await safeClose();
                return;
              }
              firstChunk = peekResult.value;
              const peekText = decoder.decode(firstChunk, { stream: true });
              // Detect SSE format: check whether it starts with "data: "
              isSSEFormat = peekText.trim().startsWith('data:');

              // Add first chunk to buffer
              buffer = peekText;
            }

            if (isSSEFormat || provider === 'openai-compatible') {
              // OpenAI-compatible server or SSE format: pass through original SSE stream
              if (firstChunk) {
                // Send the already-read first chunk
                safeEnqueue(firstChunk);
                processSseText(decoder.decode(firstChunk, { stream: true }));
              }

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                safeEnqueue(value);
                processSseText(decoder.decode(value, { stream: true }));
                if (controllerClosed) break;
              }
              // openai-compatible: explicitly send [DONE] in case upstream does not
              // (If upstream already sent [DONE], Continue handles duplication safely)
              if (!controllerClosed) {
                safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } else {
              // Ollama server: convert JSONL to OpenAI SSE format
              let ollamaToolCallsEmitted = false;
              if (firstChunk) {
                buffer = decoder.decode(firstChunk, { stream: true });
              }
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (controllerClosed) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (!line.trim() || controllerClosed) continue;
                  try {
                    const ollamaResponse = JSON.parse(line);
                    const content =
                      ollamaResponse.response ||
                      ollamaResponse.message?.content ||
                      '';
                    const toolCalls = ollamaResponse.message?.tool_calls;

                    if (content) {
                      accumulatedResponse += content;
                      const openaiChunk = {
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model,
                        choices: [
                          {
                            index: 0,
                            delta: { role: 'assistant', content },
                            finish_reason: null,
                          },
                        ],
                      };
                      const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
                      safeEnqueue(encoder.encode(sseData));
                    } else if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
                      ollamaToolCallsEmitted = true;
                      const openaiToolCalls = toolCalls.map((tc, idx) => ({
                        index: idx,
                        id: `call_${Date.now()}_${idx}`,
                        type: 'function',
                        function: {
                          name: tc.function?.name || '',
                          arguments: typeof tc.function?.arguments === 'string'
                            ? tc.function.arguments
                            : JSON.stringify(tc.function?.arguments || {}),
                        },
                      }));
                      const toolCallChunk = {
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model,
                        choices: [
                          {
                            index: 0,
                            delta: { role: 'assistant', content: '', tool_calls: openaiToolCalls },
                            finish_reason: null,
                          },
                        ],
                      };
                      safeEnqueue(encoder.encode(`data: ${JSON.stringify(toolCallChunk)}\n\n`));
                    }
                  } catch (e) {
                    if (!line.trim().startsWith('data:')) {
                      logger.warn(
                        '[OpenAI Chat Completions] JSON parse failed:',
                        line.substring(0, 100)
                      );
                    }
                  }
                }
              }

              // Handle remaining buffer and end signal
              if (!controllerClosed) {
                if (buffer.trim()) {
                  try {
                    const ollamaResponse = JSON.parse(buffer);
                    const content =
                      ollamaResponse.response ||
                      ollamaResponse.message?.content ||
                      '';
                    const toolCalls = ollamaResponse.message?.tool_calls;

                    if (content) {
                      accumulatedResponse += content;
                      const openaiChunk = {
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model,
                        choices: [
                          {
                            index: 0,
                            delta: { role: 'assistant', content },
                            finish_reason: null,
                          },
                        ],
                      };
                      const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
                      safeEnqueue(encoder.encode(sseData));
                    } else if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
                      ollamaToolCallsEmitted = true;
                      const openaiToolCalls = toolCalls.map((tc, idx) => ({
                        index: idx,
                        id: `call_${Date.now()}_${idx}`,
                        type: 'function',
                        function: {
                          name: tc.function?.name || '',
                          arguments: typeof tc.function?.arguments === 'string'
                            ? tc.function.arguments
                            : JSON.stringify(tc.function?.arguments || {}),
                        },
                      }));
                      const toolCallChunk = {
                        id: responseId,
                        object: 'chat.completion.chunk',
                        created,
                        model,
                        choices: [
                          {
                            index: 0,
                            delta: { role: 'assistant', content: '', tool_calls: openaiToolCalls },
                            finish_reason: null,
                          },
                        ],
                      };
                      safeEnqueue(encoder.encode(`data: ${JSON.stringify(toolCallChunk)}\n\n`));
                    }
                  } catch (e) {
                    if (process.env.NODE_ENV === 'development') {
                      logger.debug(
                        '[OpenAI Chat Completions] Ollama JSON parse failed:',
                        e?.message || e
                      );
                    }
                  }
                }
              // End signal (only for Ollama conversion)
                const doneChunk = {
                  id: responseId,
                  object: 'chat.completion.chunk',
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: ollamaToolCallsEmitted ? 'tool_calls' : 'stop',
                    },
                  ],
                };
                safeEnqueue(
                  encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`)
                );
                safeEnqueue(encoder.encode('data: [DONE]\n\n'));
              }
            }

            // Logging (complete before closing controller)
            const responseTime = Date.now() - startTime;
            const firstResponseTime = firstResponseAt
              ? firstResponseAt - startTime
              : responseTime;
            const completionTokens = accumulatedResponse.length;

            // Run logging asynchronously without affecting stream closure on errors
            Promise.all([
              logOpenAIProxyRequest({
                provider: 'openai-compatible',
                level: 'info',
                category: 'openai_proxy_chat',
                endpoint: '/v1/chat/completions',
                model,
                clientIP,
                userAgent,
                userId: userInfo?.userId,
                responseTime,
                statusCode: modelServerRes.status,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
              }),
              logQARequest({
                clientIP,
                model,
                prompt: messages,
                response: null,
                isStream: true,
                responseTime,
                statusCode: modelServerRes.status,
              }),
              logExternalApiRequest({
                sourceType: 'external',
                provider: 'openai-compatible',
                apiType: 'chat',
                endpoint: '/v1/chat/completions',
                model,
                messages: [
                  ...messages,
                  ...(accumulatedResponse
                    ? [{ role: 'assistant', content: accumulatedResponse }]
                    : []),
                ],
                responseTokenCount: completionTokens,
                promptTokenCount: promptTokens,
                responseTime,
                firstResponseTime,
                finalResponseTime: responseTime,
                statusCode: modelServerRes.status,
                isStream: true,
                retryCount: retryCount,
                clientIP,
                userAgent,
                jwtUserId: userInfo?.userId,
                jwtEmail: userInfo?.email,
                jwtName: actualUserName || userInfo?.name,
                jwtRole: userInfo?.role,
                jwtDepartment: userInfo?.department,
                jwtCell: userInfo?.cell,
                tokenHash: tokenInfo?.tokenHash,
                tokenName: tokenInfo?.name,
                ...identificationHeaders,
              }),
              logOpenAIRequest(`openai-proxy-${roundRobinIndex}`, {
                method: 'POST',
                endpoint: '/v1/chat/completions',
                model,
                messages,
                userAgent,
                clientIP,
                requestSize: JSON.stringify(body).length,
                responseTime,
                responseStatus: modelServerRes.status,
                responseSize: completionTokens,
                isStream: true,
                level: 'info',
                roundRobinIndex,
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens,
                userId: userInfo?.userId,
                roomId: null,
              }),
            ]).catch((logError) => {
              // Ignore logging failures (no impact on stream closure)
              logger.error('[OpenAI Chat Completions] Logging failed:', logError);
            });

            // Close stream successfully
            await safeClose();
          } catch (e) {
            logger.error('[OpenAI Chat Completions] Stream processing error:', e);
            if (!controllerClosed) {
              try {
                controller.error(e);
                controllerClosed = true;
              } catch (err) {
                // Ignore if controller is already closed or in error state
                controllerClosed = true;
              }
            }
          }
        },
      });

      return new Response(stream, {
        status: modelServerRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders,
        },
      });
    } else {
      // Handle non-streaming response
      const responseData = await modelServerRes.text();
      const responseTime = Date.now() - startTime;

      let openaiResponse;
      let completionTokens = 0;
      let responseContent = '';

      if (provider === 'gemini') {
        // Gemini API: convert response to OpenAI format
        try {
          const geminiResponse = JSON.parse(responseData);
          if (geminiResponse.candidates && geminiResponse.candidates[0]) {
            const candidate = geminiResponse.candidates[0];
            const content = candidate.content;

            if (content && content.parts && content.parts[0]) {
              responseContent = content.parts[0].text || '';
            }
          }

          completionTokens = responseContent.length;

          // Convert to OpenAI format
          openaiResponse = {
            id: createChatCompletionId(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: responseContent,
                },
                finish_reason:
                  geminiResponse.candidates?.[0]?.finishReason || 'stop',
              },
            ],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          };
        } catch (e) {
          logger.error('[OpenAI Chat Completions] Failed to parse Gemini response:', e);
          return NextResponse.json(
            {
              error: {
                message: 'Failed to parse Gemini API response',
                type: 'server_error',
              },
            },
            { status: 500, headers: corsHeaders }
          );
        }
      } else if (provider === 'openai-compatible') {
        // OpenAI-compatible server: use original response as-is
        try {
          openaiResponse = JSON.parse(responseData);
          // OpenAI response format is already valid, so use it directly
          responseContent =
            openaiResponse.choices?.[0]?.message?.content || '';
          completionTokens =
            openaiResponse.usage?.completion_tokens ||
            responseContent.length ||
            0;
        } catch (e) {
          logger.error('[OpenAI Chat Completions] Failed to parse response:', e);
          return NextResponse.json(
            {
              error: {
                message: 'Failed to parse model server response',
                type: 'server_error',
              },
            },
            { status: 500, headers: corsHeaders }
          );
        }
      } else {
        // Ollama server: convert JSON to OpenAI JSON format
        let ollamaToolCalls = null;
        try {
          const ollamaResponse = JSON.parse(responseData);
          responseContent =
            ollamaResponse.message?.content || ollamaResponse.response || '';
          completionTokens = responseContent.length;
          ollamaToolCalls = ollamaResponse.message?.tool_calls || null;
        } catch (e) {
          logger.error('[OpenAI Chat Completions] Failed to parse response:', e);
          return NextResponse.json(
            {
              error: {
                message: 'Failed to parse model server response',
                type: 'server_error',
              },
            },
            { status: 500, headers: corsHeaders }
          );
        }

        // Include tool_calls in message
        const messageObj = { role: 'assistant', content: responseContent || null };
        if (ollamaToolCalls && ollamaToolCalls.length > 0) {
          messageObj.tool_calls = ollamaToolCalls.map((tc, idx) => ({
            id: `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments || {}),
            },
          }));
        }
        // Convert to OpenAI format
        openaiResponse = {
          id: createChatCompletionId(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: messageObj,
              finish_reason: (ollamaToolCalls && ollamaToolCalls.length > 0) ? 'tool_calls' : 'stop',
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        };
      }

      // Collect request headers
      const requestHeadersObj = {};
      request.headers.forEach((value, key) => {
        requestHeadersObj[key] = value;
      });

      // Collect request body
      const requestBodyObj = {
        model,
        messages,
        ...(body.temperature !== undefined && {
          temperature: body.temperature,
        }),
        ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
        ...(body.stream !== undefined && { stream: body.stream }),
        ...(body.top_p !== undefined && { top_p: body.top_p }),
        ...(body.frequency_penalty !== undefined && {
          frequency_penalty: body.frequency_penalty,
        }),
        ...(body.presence_penalty !== undefined && {
          presence_penalty: body.presence_penalty,
        }),
      };

      // Collect response headers
      const responseHeadersObj = {};
      modelServerRes.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });

      // Collect response body (use already-read responseContent)
      let responseBodyObj = null;
      if (!stream && responseContent) {
        try {
          // Use openaiResponse object if available; otherwise parse responseContent
          responseBodyObj = openaiResponse || JSON.parse(responseContent);
        } catch (e) {
          // If it is already a parsed object
          try {
            responseBodyObj =
              typeof responseContent === 'string'
                ? JSON.parse(responseContent)
                : responseContent;
          } catch (e2) {
            responseBodyObj = { content: responseContent };
          }
        }
      }

      // Run logging in fire-and-forget mode (improves response speed)
      Promise.all([
        logOpenAIProxyRequest({
          provider: 'openai-compatible',
          level: 'info',
          category: 'openai_proxy_chat',
          endpoint: '/v1/chat/completions',
          model,
          clientIP,
          userAgent,
          userId: userInfo?.userId,
          responseTime,
          statusCode: modelServerRes.status,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        }),
        logQARequest({
          clientIP,
          model,
          prompt: messages,
          response: responseContent,
          isStream: false,
          responseTime,
          statusCode: modelServerRes.status,
        }),
        logExternalApiRequest({
          sourceType: 'external',
          provider: 'openai-compatible',
          apiType: 'chat',
          endpoint: '/v1/chat/completions',
          model,
          messages: [
            ...messages,
            ...(responseContent
              ? [{ role: 'assistant', content: responseContent }]
              : []),
          ],
          responseTokenCount: completionTokens,
          promptTokenCount: promptTokens,
          responseTime,
          statusCode: modelServerRes.status,
          isStream: false,
          retryCount: retryCount,
          clientIP,
          userAgent,
          jwtUserId: userInfo?.userId,
          jwtEmail: userInfo?.email,
          jwtName: actualUserName || userInfo?.name,
          jwtRole: userInfo?.role,
          jwtDepartment: userInfo?.department,
          jwtCell: userInfo?.cell,
          tokenHash: tokenInfo?.tokenHash,
          tokenName: tokenInfo?.name,
          requestHeaders: requestHeadersObj,
          requestBody: requestBodyObj,
          responseHeaders: responseHeadersObj,
          responseBody: responseBodyObj,
          ...identificationHeaders,
        }),
        logOpenAIRequest(`openai-proxy-${roundRobinIndex}`, {
          method: 'POST',
          endpoint: '/v1/chat/completions',
          model,
          messages,
          userAgent,
          clientIP,
          requestSize: JSON.stringify(body).length,
          responseTime,
          responseStatus: modelServerRes.status,
          responseSize: responseContent.length,
          isStream: false,
          level: 'info',
          roundRobinIndex,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          userId: userInfo?.userId,
          roomId: null,
        }),
      ]).catch((logError) => {
        logger.error('[OpenAI Chat Completions] Logging failed:', logError);
      });

      return NextResponse.json(openaiResponse, {
        status: modelServerRes.status,
        headers: corsHeaders,
      });
    }
  } catch (error) {
    logger.error('[OpenAI Chat Completions] Server error:', error);

    const responseTime = Date.now() - startTime;
    const errorMessage = error.message || 'Internal server error';

    // Run logging in fire-and-forget mode (improves response speed)
    Promise.all([
      logOpenAIProxyRequest({
        provider: 'openai-compatible',
        level: 'error',
        category: 'openai_proxy_chat',
        endpoint: '/v1/chat/completions',
        model: 'unknown',
        clientIP,
        userAgent,
        userId: userInfo?.userId,
        responseTime,
        statusCode: 500,
        error: errorMessage,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      logExternalApiRequest({
        sourceType: 'external',
        provider: 'openai-compatible',
        apiType: 'chat',
        endpoint: '/v1/chat/completions',
        model: 'unknown',
        messages: null,
        responseTokenCount: 0,
        promptTokenCount: 0,
        responseTime,
        statusCode: 500,
        isStream: false,
        error: errorMessage,
        retryCount: 0, // Failed before retry due to server error
        clientIP,
        userAgent,
        jwtUserId: userInfo?.userId,
        jwtEmail: userInfo?.email,
        jwtName: actualUserName || userInfo?.name,
        jwtRole: userInfo?.role,
        jwtDepartment: userInfo?.department,
        jwtCell: userInfo?.cell,
        tokenHash: tokenInfo?.tokenHash,
        tokenName: tokenInfo?.name,
        ...identificationHeaders,
      }),
    ]).catch((logError) => {
      logger.error('[OpenAI Chat Completions] Logging failed:', logError);
    });

    return NextResponse.json(
      {
        error: {
          message: errorMessage,
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-User-Id, X-Organization-Id, X-Project-Id, X-Environment, X-Client-Name, X-Client-Version, X-User-Name, X-Workspace, X-Session-Id, X-Request-Id',
      },
    }
  );
}
