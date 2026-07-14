import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getNextModelServerEndpointWithIndex,
  getModelServerEndpointByName,
  getModelServerEndpointByLabel,
  parseModelName,
} from '@/lib/modelServers';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { getClientIP } from '@/lib/ip';
import { verifyApiToken } from '@/lib/apiTokenUtils';
import { fetchWithProviderPolicy } from '@/lib/security/provider-outbound.mjs';
import { resolveOpenAICompatibleKey } from '@/lib/security/provider-runtime-credentials.mjs';
import { createProviderFailure } from '@/lib/security/provider-errors.mjs';

// OpenAI-compatible legacy Completions API (FIM / Autocomplete only)
// IDE extensions like Continue request this route when useLegacyCompletionsEndpoint: true is set
// Request: { model, prompt, suffix?, max_tokens?, temperature?, stop?, stream? }
// Response: { id, object: "text_completion", choices: [{ text, index, finish_reason }], usage }

export const runtime = 'nodejs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Client-Name, X-Client-Version, X-User-Id',
};

const createCompletionId = () =>
  `cmpl-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

// ─── Resolve model server endpoint (same pattern as embeddings) ──────────────
async function resolveEndpoint(modelId) {
  if (modelId) {
    const { serverName, modelName } = parseModelName(modelId);
    if (serverName) {
      const serverEndpoint = await getModelServerEndpointByName(serverName);
      if (serverEndpoint) return { ...serverEndpoint, modelName };
    }

    const labelEndpoint = await getModelServerEndpointByLabel(modelId);
    if (labelEndpoint) return { ...labelEndpoint, modelName: modelId };
  }

  const fallback = await getNextModelServerEndpointWithIndex();
  if (!fallback?.endpoint) return null;
  return { ...fallback, modelName: modelId };
}

function buildOpenAiUrl(endpoint, path) {
  const trimmed = endpoint.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return `${trimmed}${path}`;
  return `${trimmed}/v1${path}`;
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
    if (value === '{{prompt}}') return context.prompt;
    let output = value;
    if (output.includes('{{OPENAI_API_KEY}}')) {
      output = output.replaceAll('{{OPENAI_API_KEY}}', context.apiKey || '');
    }
    if (output.includes('{{prompt}}')) {
      output = output.replaceAll(
        '{{prompt}}',
        typeof context.prompt === 'string'
          ? context.prompt
          : JSON.stringify(context.prompt || '')
      );
    }
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => applyTemplate(item, context));
  if (value && typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = applyTemplate(val, context);
    });
    return next;
  }
  return value;
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
    logger.warn('[Model Config] Failed to load model config:', error.message);
    return null;
  }
}

async function findModelRecord(modelId) {
  if (!modelId) return null;
  const modelConfig = await getModelConfig();
  if (!modelConfig?.categories) return null;
  const allModels = [];
  Object.values(modelConfig.categories).forEach((category) => {
    if (category.models && Array.isArray(category.models)) allModels.push(...category.models);
  });
  let found = allModels.find((m) => m.id === modelId);
  if (!found) found = allModels.find((m) => m.modelName === modelId);
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
      return (
        mNameLower.includes(String(modelId).toLowerCase()) ||
        mNameLower.startsWith(modelBase.toLowerCase() + ':')
      );
    });
  }
  return found || null;
}

// ─── Convert Ollama /api/generate stream to OpenAI SSE ───────────────────────
function ollamaStreamToCompletionSSE(ollamaStream, model, completionId, onComplete) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = ollamaStream.getReader();
      let buffer = '';
      let usage = { promptTokens: 0, completionTokens: 0 };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              const text = chunk.response ?? '';
              const isDone = chunk.done === true;

              if (isDone) {
                usage.promptTokens = chunk.prompt_eval_count ?? 0;
                usage.completionTokens = chunk.eval_count ?? 0;
              }

              const sseChunk = {
                id: completionId,
                object: 'text_completion',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    text,
                    index: 0,
                    finish_reason: isDone ? 'stop' : null,
                  },
                ],
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseChunk)}\n\n`)
              );

              if (isDone) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } catch {
              // Ignore lines that fail parsing
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
        if (onComplete) onComplete(usage);
      }
    },
  });
}

function chatToCompletionSSE(chatStream, model, completionId, onComplete) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = chatStream.getReader();
      let buffer = '';
      let usage = { promptTokens: 0, completionTokens: 0 };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === 'data: [DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }
            if (!trimmed.startsWith('data: ')) continue;

            try {
              const chunk = JSON.parse(trimmed.slice(6));
              const delta = chunk.choices?.[0]?.delta;
              const text = delta?.content || '';
              const finishReason = chunk.choices?.[0]?.finish_reason || null;

              if (chunk.usage) {
                usage.promptTokens = chunk.usage.prompt_tokens ?? 0;
                usage.completionTokens = chunk.usage.completion_tokens ?? 0;
              }

              if (!text && !finishReason) continue;

              const sseChunk = {
                id: completionId,
                object: 'text_completion',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ text, index: 0, finish_reason: finishReason }],
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseChunk)}\n\n`)
              );
            } catch {
              // Ignore lines that fail parsing
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
        if (onComplete) onComplete(usage);
      }
    },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(request) {
  const startTime = Date.now();
  const clientIP = getClientIP(request);
  const userAgent =
    request.headers.get('user-agent') ||
    request.headers.get('x-client-name') ||
    'unknown';

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
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

  const { userInfo, tokenInfo } = verificationResult;
  const logCompletionRequest = (fields) =>
    logExternalApiRequest({
      jwtUserId: userInfo?.userId,
      tokenHash: tokenInfo?.tokenHash,
      tokenName: tokenInfo?.name,
      ...fields,
    }).catch(() => {});

  try {
    const body = await request.json().catch(() => ({}));
    const {
      model,
      prompt,
      suffix,
      max_tokens,
      temperature,
      stop,
      stream: isStream = false,
    } = body;

    if (!model) {
      return NextResponse.json(
        {
          error: {
            message: 'model is required.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (prompt == null) {
      return NextResponse.json(
        {
          error: {
            message: 'prompt is required.',
            type: 'invalid_request_error',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const completionId = createCompletionId();

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
        prompt: Array.isArray(prompt) ? prompt.join('') : String(prompt),
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

      if (manualUrl.includes('/chat/completions')) {
        const chatHeaders = applyTemplate(manualConfig?.headers || {}, context);
        if (!chatHeaders['Content-Type']) chatHeaders['Content-Type'] = 'application/json';

        let fimPrompt = context.prompt;
        if (suffix && !fimPrompt.includes('<|fim_prefix|>')) {
          fimPrompt = `<|fim_prefix|>${fimPrompt}<|fim_suffix|>${suffix}<|fim_middle|>`;
        }

        const configBody = applyTemplate(manualConfig?.body, context);
        const chatModel =
          configBody && typeof configBody === 'object' && configBody.model
            ? configBody.model
            : matchedModel.modelName || model;

        const chatBody = {
          model: chatModel,
          messages: [{ role: 'user', content: fimPrompt }],
          stream: Boolean(isStream),
        };
        if (max_tokens != null) chatBody.max_tokens = max_tokens;
        if (temperature != null) chatBody.temperature = temperature;
        if (stop != null) chatBody.stop = Array.isArray(stop) ? stop : [stop];

        let chatRes;
        try {
          chatRes = await fetchWithProviderPolicy(manualUrl, {
            method: 'POST',
            headers: chatHeaders,
            body: JSON.stringify(chatBody),
            signal: AbortSignal.timeout(60000),
          });
        } catch (error) {
          const failure = createProviderFailure(
            error,
            'Unable to connect to the configured model provider.'
          );
          logger.error('[v1/completions] Manual chat fallback failed:', {
            correlationId: failure.correlationId,
            ...failure.log,
          });
          return NextResponse.json(
            failure.openAI,
            { status: 503, headers: { ...corsHeaders, ...failure.headers } }
          );
        }

        if (!chatRes.ok) {
          const errorText = await chatRes.text().catch(() => '');
          return NextResponse.json(
            {
              error: {
                message: `Model server error: ${chatRes.status} ${errorText}`.trim(),
                type: 'server_error',
              },
            },
            { status: chatRes.status, headers: corsHeaders }
          );
        }

        if (isStream && chatRes.body) {
          const onComplete = (usage) => {
            logCompletionRequest({
              apiType: 'completions',
              model,
              endpoint: '/v1/completions',
              promptTokenCount: usage.promptTokens,
              responseTokenCount: usage.completionTokens,
              isStream: true,
              responseTime: Date.now() - startTime,
              statusCode: 200,
              clientIP,
              userAgent,
            });
          };
          const completionStream = chatToCompletionSSE(chatRes.body, model, completionId, onComplete);
          return new Response(completionStream, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        }

        const chatData = await chatRes.json().catch(() => ({}));

        logCompletionRequest({
          apiType: 'completions',
          model,
          endpoint: '/v1/completions',
          promptTokenCount: chatData.usage?.prompt_tokens ?? 0,
          responseTokenCount: chatData.usage?.completion_tokens ?? 0,
          isStream: false,
          responseTime: Date.now() - startTime,
          statusCode: 200,
          clientIP,
          userAgent,
        });

        return NextResponse.json(
          {
            id: completionId,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                text: chatData.choices?.[0]?.message?.content || '',
                index: 0,
                finish_reason: chatData.choices?.[0]?.finish_reason || 'stop',
              },
            ],
            usage: chatData.usage || {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          },
          { status: 200, headers: corsHeaders }
        );
      }

      const method = (manualConfig?.method || 'POST').toUpperCase();
      const reqHeaders = applyTemplate(manualConfig?.headers || {}, context);
      let reqBody = applyTemplate(manualConfig?.body, context);
      const manualStreamSupported = manualConfig?.stream === true;

      if (isStream && !manualStreamSupported) {
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

      if (reqBody && typeof reqBody === 'object') {
        if (isStream) {
          reqBody = { ...reqBody, stream: true };
        } else if (reqBody.stream !== undefined) {
          reqBody = { ...reqBody, stream: false };
        }
      }

      const requestOptions = { method, headers: reqHeaders };
      if (method !== 'GET' && method !== 'HEAD' && reqBody !== undefined) {
        requestOptions.body =
          typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody);
      }

      let manualRes;
      try {
        manualRes = await fetchWithProviderPolicy(manualUrl, {
          ...requestOptions,
          signal: AbortSignal.timeout(60000),
        });
      } catch (error) {
        const failure = createProviderFailure(
          error,
          'Unable to connect to the configured model provider.'
        );
        logger.error('[v1/completions] Manual provider request failed:', {
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

      if (isStream && manualRes.body) {
        logCompletionRequest({
          apiType: 'completions',
          model,
          endpoint: '/v1/completions',
          promptTokenCount: 0,
          responseTokenCount: 0,
          isStream: true,
          responseTime: Date.now() - startTime,
          statusCode: 200,
          clientIP,
          userAgent,
        });
        return new Response(manualRes.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      const manualData = await manualRes.json().catch(() => ({}));
      const responsePath = manualConfig?.responseMapping?.path;
      const finalData = responsePath
        ? {
            id: completionId,
            object: 'text_completion',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                text: getValueByPath(manualData, responsePath) || '',
                index: 0,
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          }
        : manualData;

      logCompletionRequest({
        apiType: 'completions',
        model,
        endpoint: '/v1/completions',
        promptTokenCount: finalData.usage?.prompt_tokens ?? 0,
        responseTokenCount: finalData.usage?.completion_tokens ?? 0,
        isStream: false,
        responseTime: Date.now() - startTime,
        statusCode: 200,
        clientIP,
        userAgent,
      });
      return NextResponse.json(finalData, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Resolve endpoint
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

    // ── OpenAI-compatible: forward /v1/completions as-is ─────────────────────
    if (provider === 'openai-compatible') {
      const targetUrl = buildOpenAiUrl(endpoint, '/completions');
      const headers = { 'Content-Type': 'application/json' };
      const compatibleApiKey = await resolveOpenAICompatibleKey(endpointApiKey);
      if (compatibleApiKey) {
        headers.Authorization = `Bearer ${compatibleApiKey}`;
      }

      const response = await fetchWithProviderPolicy(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, model: resolvedModel }),
        signal: AbortSignal.timeout(60000),
      });

      if (isStream) {
        logCompletionRequest({
          apiType: 'completions',
          model: resolvedModel,
          endpoint: '/v1/completions',
          promptTokenCount: 0,
          responseTokenCount: 0,
          isStream: true,
          responseTime: Date.now() - startTime,
          statusCode: 200,
          clientIP,
          userAgent,
        });
        return new Response(response.body, {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      const data = await response.json().catch(() => ({}));
      logCompletionRequest({
        apiType: 'completions',
        model: resolvedModel,
        endpoint: '/v1/completions',
        promptTokenCount: data.usage?.prompt_tokens ?? 0,
        responseTokenCount: data.usage?.completion_tokens ?? 0,
        isStream: false,
        responseTime: Date.now() - startTime,
        statusCode: response.status,
        clientIP,
        userAgent,
      });
      return NextResponse.json(data, {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ── Ollama: map to /api/generate ──────────────────────────────────────────
    // Continue sends FIM tokens directly inside prompt
    // so suffix is not handled separately and prompt is forwarded as-is
    const ollamaPrompt = Array.isArray(prompt)
      ? prompt.join('')
      : String(prompt);

    const ollamaBody = {
      model: resolvedModel,
      prompt: ollamaPrompt,
      raw: true,
      stream: Boolean(isStream),
      options: {
        ...(temperature != null && { temperature }),
        ...(max_tokens != null && { num_predict: max_tokens }),
        ...(stop != null && {
          stop: Array.isArray(stop) ? stop : [stop],
        }),
      },
    };

    // If suffix exists, pass it to Ollama suffix field (supported by some FIM models)
    if (suffix != null) {
      ollamaBody.suffix = String(suffix);
    }

    const targetUrl = `${endpoint.replace(/\/+$/, '')}/api/generate`;

    // Streaming response
    if (isStream) {
      const ollamaRes = await fetchWithProviderPolicy(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaBody),
        signal: AbortSignal.timeout(60000),
      });

      if (!ollamaRes.ok || !ollamaRes.body) {
        return NextResponse.json(
          {
            error: {
              message: `Model server error: ${ollamaRes.status}`,
              type: 'server_error',
            },
          },
          { status: ollamaRes.status, headers: corsHeaders }
        );
      }

      const onComplete = (usage) => {
        logCompletionRequest({
          apiType: 'completions',
          model: resolvedModel,
          endpoint: '/v1/completions',
          promptTokenCount: usage.promptTokens,
          responseTokenCount: usage.completionTokens,
          isStream: true,
          responseTime: Date.now() - startTime,
          statusCode: 200,
          clientIP,
          userAgent,
        });
      };
      const sseStream = ollamaStreamToCompletionSSE(
        ollamaRes.body,
        resolvedModel,
        completionId,
        onComplete
      );

      return new Response(sseStream, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const ollamaRes = await fetchWithProviderPolicy(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody),
      signal: AbortSignal.timeout(60000),
    });

    const ollamaData = await ollamaRes.json().catch(() => ({}));

    if (!ollamaRes.ok) {
      return NextResponse.json(
        {
          error: {
            message:
              ollamaData.error ||
              `Model server error: ${ollamaRes.status}`,
            type: 'server_error',
          },
        },
        { status: ollamaRes.status, headers: corsHeaders }
      );
    }

    // Convert Ollama response to OpenAI text_completion format
    const openAIResponse = {
      id: completionId,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model: resolvedModel,
      choices: [
        {
          text: ollamaData.response ?? '',
          index: 0,
          finish_reason: ollamaData.done ? 'stop' : 'length',
        },
      ],
      usage: {
        prompt_tokens: ollamaData.prompt_eval_count ?? 0,
        completion_tokens: ollamaData.eval_count ?? 0,
        total_tokens:
          (ollamaData.prompt_eval_count ?? 0) +
          (ollamaData.eval_count ?? 0),
      },
    };

    // External API logging
    logCompletionRequest({
      apiType: 'completions',
      model: resolvedModel,
      endpoint: '/v1/completions',
      promptTokenCount: ollamaData.prompt_eval_count ?? 0,
      responseTokenCount: ollamaData.eval_count ?? 0,
      isStream: false,
      responseTime: Date.now() - startTime,
      statusCode: 200,
      clientIP,
      userAgent,
    });

    return NextResponse.json(openAIResponse, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    const failure = createProviderFailure(error);
    logger.error('[v1/completions] Server error:', {
      correlationId: failure.correlationId,
      ...failure.log,
    });
    return NextResponse.json(
      failure.openAI,
      { status: 500, headers: { ...corsHeaders, ...failure.headers } }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}
