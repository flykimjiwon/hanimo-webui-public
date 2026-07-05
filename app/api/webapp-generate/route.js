import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { updateLastActive } from '@/lib/auth';
import jwt from 'jsonwebtoken';
import {
  getNextModelServerEndpointWithIndex,
  parseModelName,
  getModelServerEndpointByName,
  resolveModelId,
} from '@/lib/modelServers';
import {
  logModelServerRequest,
  logModelServerAPICall,
} from '@/lib/modelServerMonitor';
import { getClientIP } from '@/lib/ip';
import { logInfo, logWarn } from '@/lib/instanceLogger';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { detectAndMaskPII } from '@/lib/piiFilter';

export const runtime = 'nodejs';

// This file only provides basic LLM proxy functionality without model validation or prompt engineering.

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
      output = output.replaceAll(
        '{{OPENAI_API_KEY}}',
        context.apiKey || ''
      );
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

function normalizeResponsesContent(content, role) {
  const isAssistant = role === 'assistant';
  const textType = isAssistant ? 'output_text' : 'input_text';
  if (typeof content === 'string') {
    return content ? [{ type: textType, text: content }] : [];
  }
  if (!Array.isArray(content)) {
    const text = content ? String(content) : '';
    return text ? [{ type: textType, text }] : [];
  }
  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item ? { type: textType, text: item } : null;
      }
      if (!item || typeof item !== 'object') return null;
      if (item.type === 'input_text' || item.type === 'input_image') {
        return item;
      }
      if (item.type === 'text') {
        return item.text ? { type: textType, text: item.text } : null;
      }
      if (item.type === 'image_url') {
        const url = item.image_url?.url || item.url;
        if (isAssistant) return null;
        return url ? { type: 'input_image', image_url: url } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function convertToResponsesInput(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: normalizeResponsesContent(msg.content, msg.role),
  }));
}

function normalizeImageInput(image) {
  if (!image) return null;
  let dataUrl = null;
  let mimeType = null;
  let name = null;
  let size = null;

  if (typeof image === 'string') {
    dataUrl = image;
  } else if (typeof image === 'object') {
    dataUrl = image.dataUrl || image.url || image.data || null;
    mimeType = image.type || image.mimeType || null;
    name = image.name || null;
    size = Number.isFinite(image.size) ? image.size : null;
  }

  if (!dataUrl) return null;

  let data = '';
  if (dataUrl.startsWith('data:')) {
    const [meta, base64] = dataUrl.split(',');
    data = base64 || '';
    if (!mimeType) {
      const match = meta.match(/data:(.*?);base64/i);
      if (match) {
        mimeType = match[1];
      }
    }
  } else {
    data = dataUrl;
  }

  return {
    dataUrl,
    data,
    mimeType: mimeType || 'image/jpeg',
    name,
    size,
  };
}

function ensureDataUrl(image) {
  if (!image) return '';
  if (image.dataUrl && image.dataUrl.startsWith('data:')) {
    return image.dataUrl;
  }
  const data = image.data || '';
  return `data:${image.mimeType || 'image/jpeg'};base64,${data}`;
}

function buildUserContent(text, images) {
  if (!images || images.length === 0) return text;
  const content = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  images.forEach((image) => {
    const url = ensureDataUrl(image);
    if (url) {
      content.push({ type: 'image_url', image_url: { url } });
    }
  });
  return content;
}

function parseDataUrl(url) {
  if (!url) return { data: '', mimeType: 'image/jpeg' };
  if (url.startsWith('data:')) {
    const [meta, base64] = url.split(',');
    const match = meta.match(/data:(.*?);base64/i);
    return {
      data: base64 || '',
      mimeType: match?.[1] || 'image/jpeg',
    };
  }
  return { data: url, mimeType: 'image/jpeg' };
}

async function findModelRecord(modelId) {
  if (!modelId) return null;
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

    if (!categories) return null;

    const allModels = [];
    Object.values(categories).forEach((category) => {
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
  } catch (error) {
    console.warn('[Model Config] Model settings query failed:', error.message);
    return null;
  }
}

function applyMultiturnLimit(history, limit, unlimited) {
  if (!Array.isArray(history)) return history;
  if (unlimited) return history;
  const numericLimit = Number.parseInt(limit, 10);
  if (!numericLimit || numericLimit <= 0) return history;
  return history.slice(-(numericLimit * 2));
}

function buildMessagesWithResponse(baseMessages, responseText) {
  if (!responseText) return baseMessages;
  return [
    ...baseMessages,
    {
      role: 'assistant',
      content: responseText,
    },
  ];
}

function getApiTypeForLog(requestPurpose) {
  const normalizedPurpose = String(requestPurpose || '').trim().toLowerCase();

  if (normalizedPurpose === 'image-analysis') {
    return 'image-analysis';
  }

  if (
    normalizedPurpose === 'ppt-generate' ||
    normalizedPurpose === 'ppt-generation' ||
    normalizedPurpose === 'ppt'
  ) {
    return 'ppt-generate';
  }

  return 'chat';
}

async function logImageAnalysisToMessages({
  requestPurpose,
  roomId,
  userId,
  userRole,
  model,
  text,
  clientIP,
}) {
  if (requestPurpose !== 'image-analysis') return;
  if (!roomId || !userId) return;
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText) return;

  try {
    await query(
      `INSERT INTO messages (role, user_role, model, text, room_id, user_id, client_ip, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'assistant',
        userRole || 'user',
        model || null,
        `[image-analysis]\n${normalizedText}`,
        roomId,
        userId,
        clientIP || null,
        new Date(),
      ]
    );
  } catch (error) {
    console.warn('[image-analysis] Failed to save messages log:', error?.message || error);
  }
}

export async function POST(request) {
  try {
    // Extract client IP and user info
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    const isGhostMode = request.headers.get('x-ghost-mode') === 'true';
    const maybeLogExternalApi = isGhostMode
      ? async () => {}
      : logExternalApiRequest;

    // Request start log
    logInfo('AI generation request started', {
      userAgent,
      ip: clientIP,
    });

    // JWT validation
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      logWarn('Authentication failed: missing Bearer token');
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }
    const token = authHeader.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.warn('[Catch] Error occurred:', error.message);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Record last active time (10-minute throttle)
    if (payload?.sub) updateLastActive(payload.sub);

    // Client payload
    const {
      roomId,
      model, // Model UUID or model name
      prompt: clientOriginalPrompt, // Rename 'prompt' variable to avoid conflicts
      question,
      multiturnHistory = [],
      images = [],
      piiInputProcessed = false,
      requestPurpose = 'chat',
      customInstruction = '',
      ...llmPayload
    } = await request.json();

    const normalizedImages = Array.isArray(images)
      ? images.map(normalizeImageInput).filter(Boolean)
      : [];
    if (normalizedImages.length > 0) {
      console.log(
        `[generate] Received ${normalizedImages.length} image(s)`,
        normalizedImages.map((image, index) => ({
          index: index + 1,
          name: image.name || 'unknown',
          size: Number.isFinite(image.size) ? image.size : null,
          mimeType: image.mimeType,
        }))
      );
    }

    // Convert model UUID to actual model name
    const actualModelName = await resolveModelId(model);
    const matchedModel = await findModelRecord(actualModelName);

    console.log('[generate] Model info:', {
      originalModel: model,
      actualModelName: actualModelName,
    });

    // Build final prompt (for logging)
    const finalPrompt = clientOriginalPrompt || question || '';

    console.log(
      '[generate] Raw multiturnHistory received from client:',
      multiturnHistory
    );
    console.log('[generate] Raw question received from client:', question);

    // PostgreSQL client connection

    const fileContent = '';
    const filteredMultiturnHistory = applyMultiturnLimit(
      multiturnHistory,
      matchedModel?.multiturnLimit,
      matchedModel?.multiturnUnlimited
    );

    // Retrieve per-model system prompt and model-specific server (using UUID)
    let systemPrompt = null;
    let modelEndpointUrl = null;
    let modelApiConfig = null;
    let modelApiKey = null;
    let isManualEndpoint = false;
    try {
      // Query model in new table structure (including legacy support)
      const { getModelsFromTables } = await import('@/lib/modelTables');
      let categories = await getModelsFromTables();

      // If new tables are empty, query legacy model_config
      if (!categories) {
        const modelConfigResult = await query(
          'SELECT config FROM model_config WHERE config_type = $1',
          ['models']
        );
        if (modelConfigResult.rows.length > 0) {
          categories = modelConfigResult.rows[0].config?.categories || null;
        }
      }

      if (categories) {
        // Find matching model across all categories (search by UUID, modelName, label)
        for (const category of Object.values(categories)) {
          const foundModel = category.models?.find(
            (m) => m.id === model || m.modelName === model || m.label === model
          );
          if (foundModel) {
              console.log('[DEBUG] foundModel found:', {
              id: foundModel.id,
              modelName: foundModel.modelName,
              label: foundModel.label,
              endpoint: foundModel.endpoint,
              hasApiConfig: !!foundModel.apiConfig,
              hasApiKey: !!foundModel.apiKey
            });
            if (foundModel.systemPrompt && foundModel.systemPrompt.length > 0) {
              systemPrompt = foundModel.systemPrompt
                .filter((line) => line.trim() !== '')
                .join('\n');
              console.log(
                `[generate] Applied system prompt for model ${model} (${actualModelName}): ${systemPrompt.length} chars`
              );
            }
            if (
              foundModel.endpoint &&
              typeof foundModel.endpoint === 'string'
            ) {
              modelEndpointUrl = foundModel.endpoint.trim();
              console.log('[DEBUG] modelEndpointUrl set:', modelEndpointUrl);
            }
            if (modelEndpointUrl === 'manual') {
              isManualEndpoint = true;
              modelApiConfig = foundModel.apiConfig || null;
              modelApiKey = foundModel.apiKey || null;
              console.log('[DEBUG] Manual endpoint detected:', {
                isManualEndpoint,
                hasApiConfig: !!modelApiConfig,
                hasApiKey: !!modelApiKey
              });
            }
            if (systemPrompt || modelEndpointUrl) break;
          }
        }
      }
    } catch (systemPromptError) {
      console.warn(
        '[generate] Failed to fetch system prompt:',
        systemPromptError.message
      );
    }

    if (
      customInstruction &&
      typeof customInstruction === 'string' &&
      customInstruction.trim()
    ) {
      systemPrompt = systemPrompt
        ? `${systemPrompt}\n\n[Custom Instruction]\n${customInstruction.trim()}`
        : customInstruction.trim();
    }

    let maxUserQuestionLength = 300000;
    try {
      const settingsResult = await query(
        `SELECT max_user_question_length FROM settings WHERE config_type = $1 LIMIT 1`,
        ['general']
      );
      const settingsRow = settingsResult.rows[0];
      if (
        settingsRow &&
        typeof settingsRow.max_user_question_length === 'number'
      ) {
        maxUserQuestionLength = settingsRow.max_user_question_length;
      }
    } catch (error) {
      console.warn('[generate] Failed to fetch question length setting:', error.message);
    }

    // Validate user question (length check)
    const { validateUserQuestion } = await import('@/lib/contextManager');
    const userValidation = validateUserQuestion(
      question,
      maxUserQuestionLength
    );
    if (!userValidation.valid) {
      return NextResponse.json(
        {
          error: userValidation.error,
        },
        { status: 400 }
      );
    }

    const systemPromptPreview = systemPrompt
      ? systemPrompt.replace(/\s+/g, ' ').slice(0, 120)
      : '';
    console.log(
      `[generate] Question length: ${question.length} chars, file content: ${fileContent.length} chars, history: ${filteredMultiturnHistory.length} messages`
    );
    console.log(
      `[generate] systemPrompt applied: ${!!systemPrompt}, length: ${systemPrompt ? systemPrompt.length : 0}, preview: "${systemPromptPreview}"`
    );

    let finalQuestion = question;
    if (matchedModel?.piiFilterRequest && piiInputProcessed !== true) {
      const piiResult = await detectAndMaskPII(question, {
        mxtVrf: matchedModel?.piiRequestMxtVrf !== false,
        maskOpt: matchedModel?.piiRequestMaskOpt !== false,
      }, {
        model: actualModelName,
        roomId: roomId || null,
        clientIP,
        userAgent,
        xForwardedFor: request.headers.get('x-forwarded-for'),
        xRealIP: request.headers.get('x-real-ip'),
        acceptLanguage: request.headers.get('accept-language'),
        referer: request.headers.get('referer'),
        origin: request.headers.get('origin'),
        jwtUserId: payload?.sub || null,
        jwtEmail: payload?.email || null,
        jwtName: payload?.name || null,
        jwtRole: payload?.role || null,
      });
      if (piiResult.detected) {
        console.log(`[PII] Detected ${piiResult.detectedCnt} PII item(s) in request -> blocked LLM call`);
        const piiNotice = `⚠️ Personal information was detected. Please copy the filtered content and ask again.\n\nMasked content:\n${piiResult.maskedText}`;
        const maskedStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ response: piiNotice }) + '\n'));
            controller.close();
          },
        });
        return new Response(maskedStream, { headers: { 'Content-Type': 'application/x-ndjson' } });
      }
    }

    const userText = fileContent ? `${fileContent}\n\n${finalQuestion}` : finalQuestion;
    const userContent = buildUserContent(userText, normalizedImages);

    // Build full message history for logging (multiturnHistory + current question)
    const fullMessagesForLogging = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...filteredMultiturnHistory.map((msg) => ({
        role: msg.role,
        content: typeof msg.text === 'string' ? msg.text : msg.text || '',
      })),
      { role: 'user', content: userContent },
    ];

    // Resolve model server type (DB -> env fallback) and prioritize model-specific server
    let endpointType = 'llm';
    let openaiCompatBase = process.env.OPENAI_COMPAT_BASE || '';
    let openaiCompatApiKey = process.env.OPENAI_COMPAT_API_KEY || '';
    let forcedLlmEndpoint = null;
    try {
      const settingsResult = await query(
        `SELECT * FROM settings WHERE config_type = $1 LIMIT 1`,
        ['general']
      );
      const settingsRow = settingsResult.rows[0];

      if (settingsRow) {
        const settingsDoc = {
          ...settingsRow,
          endpointType: settingsRow.endpoint_type,
          openaiCompatBase: settingsRow.openai_compat_base,
          openaiCompatApiKey: settingsRow.openai_compat_api_key,
          customEndpoints: settingsRow.custom_endpoints,
        };

        endpointType =
          settingsDoc.endpointType === 'openai-compatible'
            ? 'openai-compatible'
            : 'llm';
        if (settingsDoc.openaiCompatBase)
          openaiCompatBase = settingsDoc.openaiCompatBase;
        if (settingsDoc.openaiCompatApiKey)
          openaiCompatApiKey = settingsDoc.openaiCompatApiKey;
        // If model specifies endpoint, override based on provider
        if (modelEndpointUrl) {
          const list = Array.isArray(settingsDoc.customEndpoints)
            ? settingsDoc.customEndpoints
            : [];
          const matched = list.find((e) => e.url === modelEndpointUrl);
          if (matched) {
            if (matched.provider === 'openai-compatible') {
              endpointType = 'openai-compatible';
              openaiCompatBase = matched.url;
            }
          }
        }
      }
    } catch (settingsError) {
      console.warn('[generate] Failed to load settings:', settingsError.message);
    }
    if (isManualEndpoint) {
      endpointType = 'manual';
      console.log('[DEBUG] endpointType set to manual');
    }
    console.log('[DEBUG] Final endpointType:', endpointType);

    // Analyze request type
    const hasFiles = normalizedImages.length > 0;
    const requestType = hasFiles ? 'multimodal' : 'text';
    const apiTypeForLog = getApiTypeForLog(requestPurpose);

    if (endpointType === 'manual') {
      if (!modelApiConfig) {
        return NextResponse.json(
          { error: 'Manual API configuration is missing.' },
          { status: 400 }
        );
      }

      let manualConfig;
      try {
        manualConfig =
          typeof modelApiConfig === 'string'
            ? JSON.parse(modelApiConfig)
            : modelApiConfig;
      } catch (error) {
        return NextResponse.json(
          { error: 'Failed to parse manual API configuration JSON.' },
          { status: 400 }
        );
      }

      const baseMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...filteredMultiturnHistory.map((msg) => ({
          role: msg.role,
          content: typeof msg.text === 'string' ? msg.text : msg.text || '',
        })),
        {
          role: 'user',
          content: userContent,
        },
      ];

      const context = {
        apiKey: (modelApiKey || process.env.OPENAI_API_KEY || '').trim(),
        messages: baseMessages,
        message: userText,
      };

      const manualUrl = applyTemplate(manualConfig?.url, context);
      if (!manualUrl) {
        return NextResponse.json(
          { error: 'Manual API URL is not configured.' },
          { status: 400 }
        );
      }

      const method = (manualConfig?.method || 'POST').toUpperCase();
      const headers = applyTemplate(manualConfig?.headers || {}, context);
      let body = applyTemplate(manualConfig?.body, context);
      const manualStreamEnabled = manualConfig?.stream === true;

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
      if (
        manualUrl.includes('/v1/responses') &&
        body &&
        typeof body === 'object' &&
        Array.isArray(body.input)
      ) {
        body = { ...body, input: convertToResponsesInput(body.input) };
      }

      console.log('[Manual API] Configuration check:', {
        hasStream: !!manualConfig?.stream,
        streamValue: manualConfig?.stream,
        manualStreamEnabled,
        bodyHasStream: body?.stream,
      });

      if (
        manualStreamEnabled &&
        body &&
        typeof body === 'object' &&
        body.stream === undefined
      ) {
        body = { ...body, stream: true };
      }

      const requestOptions = {
        method,
        headers,
      };
      if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
        requestOptions.body =
          typeof body === 'string' ? body : JSON.stringify(body);
      }

      console.log('[Manual API] Sending request:', {
        url: manualUrl,
        method,
        bodyPreview: typeof requestOptions.body === 'string'
          ? requestOptions.body.substring(0, 200)
          : 'N/A',
      });

      const startAt = Date.now();
      const manualRes = await fetch(manualUrl, requestOptions);
      if (!manualRes.ok) {
        const errorText = await manualRes.text().catch(() => '');
        try {
          await maybeLogExternalApi({
            sourceType: 'internal',
            provider: 'manual',
            apiType: apiTypeForLog,
            endpoint: manualUrl,
            model: actualModelName,
            messages: fullMessagesForLogging,
            promptTokenCount: finalPrompt.length,
            responseTokenCount: 0,
            responseTime: Date.now() - startAt,
            statusCode: manualRes.status,
            isStream: manualStreamEnabled,
            error: `Manual API request failed: HTTP ${manualRes.status}`,
            clientIP,
            userAgent,
            roomId: roomId || null,
            jwtUserId: payload?.sub || null,
            jwtEmail: payload?.email || null,
            jwtName: payload?.name || null,
            jwtRole: payload?.role || null,
            xForwardedFor: request.headers.get('x-forwarded-for'),
            xRealIP: request.headers.get('x-real-ip'),
            acceptLanguage: request.headers.get('accept-language'),
            referer: request.headers.get('referer'),
            origin: request.headers.get('origin'),
          });
        } catch (logErr) {
          console.warn(
              '[manual] External API logging failed (ignored):',
            logErr?.message || logErr
          );
        }
        return NextResponse.json(
          {
            error: `Manual API request failed: HTTP ${manualRes.status}`,
            details: errorText,
          },
          { status: manualRes.status }
        );
      }

      const manualContentType = manualRes.headers.get('content-type') || '';
      const truncatePreview = (value, limit = 500) => {
        if (!value) return '';
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        if (text.length <= limit) return text;
        return `${text.slice(0, limit)}…(${text.length} chars)`;
      };

      console.log('[Manual API] Response received:', {
        status: manualRes.status,
        contentType: manualContentType,
        manualStreamEnabled,
        willUseStreaming: manualStreamEnabled,
      });

      // If stream: true is set, handle as streaming regardless of Content-Type
      if (manualStreamEnabled) {
        console.log('[Manual API] Start processing in streaming mode');
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');
        let streamedResponseLength = 0;
        let sawDelta = false;
        let streamedResponseText = '';
        let streamErrorInfo = null;
        const previewEvents = [];
        const maxPreviewEvents = 3;
        const stream = new ReadableStream({
          async start(controller) {
            const reader = manualRes.body.getReader();
            let buffer = '';
            let currentEvent = '';

            const coerceDeltaText = (value) => {
              if (!value) return '';
              if (typeof value === 'string') return value;
              if (Array.isArray(value)) {
                return value
                  .map((item) => {
                    if (!item) return '';
                    if (typeof item === 'string') return item;
                    return item.text || '';
                  })
                  .join('');
              }
              if (typeof value === 'object') {
                return value.text || '';
              }
              return '';
            };

            const extractTextFromResponse = (parsed) => {
              const collect = (items = []) =>
                items
                  .map((item) => {
                    if (!item) return '';
                    if (Array.isArray(item.content)) {
                      return item.content
                        .map((contentItem) => contentItem?.text || '')
                        .join('');
                    }
                    return item.text || '';
                  })
                  .join('');

              if (parsed?.response?.output) {
                return collect(parsed.response.output);
              }
              if (parsed?.output) {
                return collect(parsed.output);
              }
              return '';
            };

            const emitDelta = (text) => {
              const normalized = coerceDeltaText(text);
              if (!normalized) return;
              sawDelta = true;
              streamedResponseText += normalized;
              streamedResponseLength += normalized.length;
              const payload = {
                choices: [{ delta: { content: normalized } }],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            };

            let chunkCount = 0;
            let firstChunkLogged = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log('[Manual API] Stream ended, total chunks:', chunkCount);
                  break;
                }
                chunkCount++;
                if (!firstChunkLogged) {
                  console.log('[Manual API] First response chunk received');
                  firstChunkLogged = true;
                }
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
                  if (previewEvents.length < maxPreviewEvents) {
                    previewEvents.push({
                      event: currentEvent || null,
                      data: truncatePreview(data),
                    });
                  }
                  if (data === '[DONE]') {
                    console.log('[Manual API] [DONE] received');
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                    return;
                  }

                  let parsed;
                  try {
                    parsed = JSON.parse(data);
                  } catch (error) {
    console.warn('[Loop] Failed to process item (skipped):', error.message);
    continue;
  }
                  if (
                    currentEvent === 'error' ||
                    parsed?.type === 'error' ||
                    parsed?.error
                  ) {
                    const errorInfo = parsed?.error || parsed || {};
                    streamErrorInfo = {
                      message:
                        errorInfo.message ||
                        'An error occurred while processing the request.',
                      type: errorInfo.type || 'error',
                      code: errorInfo.code || null,
                    };
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({
                          error: streamErrorInfo,
                        })}\n\n`
                      )
                    );
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                    return;
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
                    continue;
                  }

                  if (!sawDelta) {
                    const fallbackText = extractTextFromResponse(parsed);
                    if (fallbackText) {
                      emitDelta(fallbackText);
                    }
                  }
                }
              }
            } catch (streamError) {
              console.error('[manual stream] Stream processing error:', streamError);
              controller.error(streamError);
            } finally {
              console.log('[Manual API] Stream response preview:', {
                status: manualRes.status,
                contentType: manualContentType,
                sawDelta,
                streamErrorInfo,
                previewEvents,
              });
              try {
                await maybeLogExternalApi({
                  sourceType: 'internal',
                  provider: 'manual',
                  apiType: apiTypeForLog,
                  endpoint: manualUrl,
                  model: actualModelName,
                  messages: buildMessagesWithResponse(
                    fullMessagesForLogging,
                    streamedResponseText
                  ),
                  promptTokenCount: finalPrompt.length,
                  responseTokenCount: streamedResponseLength,
                  responseTime: Date.now() - startAt,
                  statusCode: streamErrorInfo ? 429 : manualRes.status,
                  isStream: true,
                  error: streamErrorInfo
                    ? `Manual API stream error: ${streamErrorInfo.message}`
                    : undefined,
                  clientIP,
                  userAgent,
                  roomId: roomId || null,
                  jwtUserId: payload?.sub || null,
                  jwtEmail: payload?.email || null,
                  jwtName: payload?.name || null,
                  jwtRole: payload?.role || null,
                  xForwardedFor: request.headers.get('x-forwarded-for'),
                  xRealIP: request.headers.get('x-real-ip'),
                  acceptLanguage: request.headers.get('accept-language'),
                  referer: request.headers.get('referer'),
                  origin: request.headers.get('origin'),
                });
              } catch (logErr) {
                console.warn(
                  '[manual] External API logging failed (ignored):',
                  logErr?.message || logErr
                );
              }
              await logImageAnalysisToMessages({
                requestPurpose,
                roomId: roomId || null,
                userId: payload?.sub || null,
                userRole: payload?.role || null,
                model: actualModelName,
                text: streamedResponseText,
                clientIP,
              });
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }

      let responseData = null;
      let responseText = '';
      try {
        responseData = await manualRes.json();
      } catch (error) {
        responseText = await manualRes.text().catch(() => '');
      }
      console.log('[Manual API] Non-streaming response preview:', {
        status: manualRes.status,
        contentType: manualContentType,
        responseText: truncatePreview(responseText),
        responseJson: responseData ? truncatePreview(responseData) : null,
      });

      const responsePath = manualConfig?.responseMapping?.path;
      let mapped =
        responseData && responsePath
          ? getValueByPath(responseData, responsePath)
          : null;
      if (mapped === null || mapped === undefined) {
        if (responseText) {
          mapped = responseText;
        } else if (responseData) {
          mapped =
            typeof responseData === 'string'
              ? responseData
              : JSON.stringify(responseData);
        } else {
          mapped = '';
        }
      }

      const responseString =
        typeof mapped === 'string' ? mapped : JSON.stringify(mapped);
      try {
        await maybeLogExternalApi({
          sourceType: 'internal',
          provider: 'manual',
          apiType: apiTypeForLog,
          endpoint: manualUrl,
          model: actualModelName,
          messages: buildMessagesWithResponse(
            fullMessagesForLogging,
            responseString
          ),
          promptTokenCount: finalPrompt.length,
          responseTokenCount: responseString.length,
          responseTime: Date.now() - startAt,
          statusCode: manualRes.status,
          isStream: false,
          clientIP,
          userAgent,
          roomId: roomId || null,
          jwtUserId: payload?.sub || null,
          jwtEmail: payload?.email || null,
          jwtName: payload?.name || null,
          jwtRole: payload?.role || null,
          xForwardedFor: request.headers.get('x-forwarded-for'),
          xRealIP: request.headers.get('x-real-ip'),
          acceptLanguage: request.headers.get('accept-language'),
          referer: request.headers.get('referer'),
          origin: request.headers.get('origin'),
        });
      } catch (logErr) {
        console.warn(
          '[manual] External API logging failed (ignored):',
          logErr?.message || logErr
        );
      }
      await logImageAnalysisToMessages({
        requestPurpose,
        roomId: roomId || null,
        userId: payload?.sub || null,
        userRole: payload?.role || null,
        model: actualModelName,
        text: responseString,
        clientIP,
      });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ response: responseString })}\n`)
          );
          controller.close();
        },
      });

      return new Response(stream, {
        status: manualRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (endpointType === 'gemini') {
      // Call Gemini API
      const base =
        (openaiCompatBase || '').replace(/\/+$/, '') ||
        'https://generativelanguage.googleapis.com';
      if (!openaiCompatApiKey) {
        return NextResponse.json(
          { error: 'Gemini API key is not configured.' },
          { status: 400 }
        );
      }

      // Normalize Gemini model name
      // 1. Remove "models/" prefix (format returned by Gemini API)
      // 2. Remove version tags (:latest, etc.)
      // 3. Trim whitespace
      // Example: "models/gemini-pro:latest" -> "gemini-pro"
      // Example: "gemini-pro:latest" -> "gemini-pro"
      let normalizedModel = actualModelName.trim();

      while (normalizedModel.startsWith('models/')) {
        normalizedModel = normalizedModel.substring(7);
      }

      normalizedModel = normalizedModel.split(':')[0].trim();

      // If a slash remains, use only the last segment (safety guard)
      if (normalizedModel.includes('/')) {
        normalizedModel = normalizedModel.split('/').pop().trim();
      }

      if (!normalizedModel) {
        return NextResponse.json(
          { error: `Invalid model name: "${actualModelName}"` },
          { status: 400 }
        );
      }

      // Check once more to prevent models/ duplication in URL
      const cleanModelName = normalizedModel.replace(/^models\//, '');
      const geminiUrl = `${base}/v1beta/models/${cleanModelName}:streamGenerateContent?key=${openaiCompatApiKey}`;
      const headers = { 'Content-Type': 'application/json' };

      console.log(
        `[generate] Gemini API call: model=${cleanModelName} (normalized=${normalizedModel}, original=${actualModelName}), URL=${geminiUrl.replace(
          /key=[^&]+/,
          'key=***'
        )}`
      );

      // Convert to Gemini API format
      const convertToGeminiFormat = (messages) => {
        const contents = [];
        for (const msg of messages) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const parts = [];

          if (typeof msg.content === 'string') {
            if (msg.content) {
              parts.push({ text: msg.content });
            }
          } else if (Array.isArray(msg.content)) {
            msg.content.forEach((item) => {
              if (typeof item === 'string' && item) {
                parts.push({ text: item });
                return;
              }
              if (item?.type === 'text' && item.text) {
                parts.push({ text: item.text });
                return;
              }
              if (item?.type === 'image_url' && item.image_url?.url) {
                const { data, mimeType } = parseDataUrl(item.image_url.url);
                if (data) {
                  parts.push({
                    inline_data: {
                      mime_type: mimeType,
                      data,
                    },
                  });
                }
              }
            });
          } else {
            const fallbackText = String(msg.content || '');
            if (fallbackText) {
              parts.push({ text: fallbackText });
            }
          }

          if (parts.length > 0) {
            contents.push({ role, parts });
          }
        }
        return { contents };
      };

      // Build message array for Gemini API
      // Include systemPrompt and file content in the first user message
      const openaiMessages = [
        ...filteredMultiturnHistory.map((msg) => ({
          role: msg.role,
          content: typeof msg.text === 'string' ? msg.text : msg.text || '',
        })),
        {
          role: 'user',
          content: buildUserContent(
            [systemPrompt || '', fileContent || '', question]
              .filter(Boolean)
              .join('\n\n'),
            normalizedImages
          ),
        },
      ];

      const body = convertToGeminiFormat(openaiMessages);

      const startAt = Date.now();
      const openaiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      let instanceId = 'gemini-unknown';
      try {
        const u = new URL(base);
        instanceId = `gemini-${u.hostname}-${u.port || ''}`;
      } catch (error) {
        console.warn('[Gemini] URL parsing failed, using default instance ID:', error.message);
      }

      // Check HTTP status code
      if (!openaiRes.ok) {
        let errorMessage = `HTTP ${openaiRes.status} ${openaiRes.statusText}`;
        let errorDetails = null;

        try {
          // Try reading error response body
          const errorText = await openaiRes.text();
          if (errorText) {
            try {
              const errorJson = JSON.parse(errorText);
              // Extract error message (supports multiple formats)
              let rawErrorMessage = null;
              if (errorJson.error) {
                if (typeof errorJson.error === 'string') {
                  rawErrorMessage = errorJson.error;
                } else if (errorJson.error.message) {
                  rawErrorMessage = errorJson.error.message;
                } else if (typeof errorJson.error === 'object') {
                  rawErrorMessage = JSON.stringify(errorJson.error);
                }
              }
              errorMessage = rawErrorMessage || errorMessage;
              errorDetails = errorJson;

              // Try multiple patterns: original model name, with "models/" prefix, etc.
              if (errorMessage && actualModelName && cleanModelName) {
                // 1. Directly replace original model name
                if (errorMessage.includes(actualModelName)) {
                  errorMessage = errorMessage.replace(
                    new RegExp(
                      actualModelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                      'g'
                    ),
                    cleanModelName
                  );
                }
                // 2. Replace cases with "models/" prefix
                const modelWithPrefix = `models/${cleanModelName}`;
                if (errorMessage.includes(modelWithPrefix)) {
                  errorMessage = errorMessage.replace(
                    new RegExp(
                      modelWithPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                      'g'
                    ),
                    cleanModelName
                  );
                }
                // 3. Replace quoted model name patterns (e.g., 'models/gemini-2.0-flash')
                const quotedModelPattern = new RegExp(
                  `(['"])([^'"]*${model.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                  )}[^'"]*)\\1`,
                  'gi'
                );
                errorMessage = errorMessage.replace(
                  quotedModelPattern,
                  (match, quote, content) => {
                    const normalizedContent = content.replace(
                      new RegExp(
                        model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                        'g'
                      ),
                      cleanModelName
                    );
                    return `${quote}${normalizedContent}${quote}`;
                  }
                );
              }
            } catch (error) {
              console.warn('[Catch] Error occurred:', error.message);
              errorMessage = errorText.substring(0, 500);
              errorDetails = { raw: errorText.substring(0, 200) };

              // Also replace original model name with normalized name in text error messages
              if (errorMessage && actualModelName && cleanModelName) {
                // 1. Directly replace original model name
                if (errorMessage.includes(actualModelName)) {
                  errorMessage = errorMessage.replace(
                    new RegExp(
                      actualModelName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                      'g'
                    ),
                    cleanModelName
                  );
                }
                // 2. Replace cases with "models/" prefix
                const modelWithPrefix = `models/${cleanModelName}`;
                if (errorMessage.includes(modelWithPrefix)) {
                  errorMessage = errorMessage.replace(
                    new RegExp(
                      modelWithPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                      'g'
                    ),
                    cleanModelName
                  );
                }
                // 3. Replace quoted model name patterns
                const quotedModelPattern = new RegExp(
                  `(['"])([^'"]*${model.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                  )}[^'"]*)\\1`,
                  'gi'
                );
                errorMessage = errorMessage.replace(
                  quotedModelPattern,
                  (match, quote, content) => {
                    const normalizedContent = content.replace(
                      new RegExp(
                        model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                        'g'
                      ),
                      cleanModelName
                    );
                    return `${quote}${normalizedContent}${quote}`;
                  }
                );
              }
            }
          }
        } catch (e) {
          console.warn('[generate] Failed to read Gemini error response:', e);
        }

        // Detailed logging (for 404 errors, verify model name and URL)
        const timestamp = new Date().toLocaleString('ko-KR', {
          timeZone: 'Asia/Seoul',
        });
        const responseTime = Date.now() - startAt;
        console.error(
          `ERROR ${timestamp} ${responseTime}ms POST ${geminiUrl.replace(
            /key=[^&]+/,
            'key=***'
          )}`,
          {
            status: openaiRes.status,
            statusText: openaiRes.statusText,
            errorMessage,
            errorDetails,
            cleanModelName,
            originalModel: actualModelName,
            url: geminiUrl.replace(/key=[^&]+/, 'key=***'),
            response: errorDetails || errorMessage,
            request: {
              model: cleanModelName,
              originalModel: actualModelName,
              method: 'POST',
            },
            headers: Object.fromEntries(openaiRes.headers.entries()),
          }
        );

        try {
          const { logOpenAIRequest } = await import('@/lib/modelServerMonitor');
          await logOpenAIRequest(instanceId, {
            method: 'POST',
            endpoint: geminiUrl,
            model: cleanModelName,
            originalModel: actualModelName,
            messages: openaiMessages,
            userAgent,
            clientIP,
            responseTime: Date.now() - startAt,
            responseStatus: openaiRes.status,
            errorMessage: `${errorMessage} (normalized model: ${cleanModelName}, original: ${actualModelName})`,
            isStream: true,
            roomId,
            userId: payload?.email || 'unknown',
            level: 'error',
            hasFiles,
            fileCount: 0,
            provider: 'gemini', // Explicitly mark as Gemini API
          });
        } catch (logErr) {
          console.error('[generate] Failed to write log:', logErr);
        }

        // Also record failed calls in external API logs
        try {
          await maybeLogExternalApi({
            sourceType: 'internal',
            provider: 'gemini',
            apiType: apiTypeForLog,
            endpoint: geminiUrl,
            model: cleanModelName, // Normalized model name
            messages: fullMessagesForLogging, // Include full message history
            promptTokenCount: finalPrompt.length,
            responseTokenCount: 0,
            responseTime: Date.now() - startAt,
            statusCode: openaiRes.status,
            isStream: true,
            error: errorMessage,
            clientIP,
            userAgent,
            roomId: roomId || null,
            jwtUserId: payload?.sub || null,
            jwtEmail: payload?.email || null,
            jwtName: payload?.name || null,
            jwtRole: payload?.role || null,
            xForwardedFor: request.headers.get('x-forwarded-for'),
            xRealIP: request.headers.get('x-real-ip'),
            acceptLanguage: request.headers.get('accept-language'),
            referer: request.headers.get('referer'),
            origin: request.headers.get('origin'),
          });
        } catch (logErr) {
          console.warn(
            '[generate] External API logging failed (ignored):',
            logErr?.message || logErr
          );
        }

        // Provide more detailed message for 404 errors
        if (openaiRes.status === 404) {
          // Extract model-name-related info from error message (already normalized)
          const modelNotFoundPattern = /model\s+['"]([^'"]+)['"]/i;
          const match = errorMessage.match(modelNotFoundPattern);
          const mentionedModel = match ? match[1] : null;

          // Check whether error message is already normalized
          const isAlreadyNormalized =
            mentionedModel === normalizedModel ||
            (mentionedModel && !mentionedModel.includes('models/'));

          let finalErrorMessage = `Gemini model not found.`;

          if (isAlreadyNormalized) {
            // Already normalized
            finalErrorMessage += `\nModel name: "${normalizedModel}"`;
            if (actualModelName !== normalizedModel) {
              finalErrorMessage += ` (original: "${actualModelName}")`;
            }
          } else if (mentionedModel && mentionedModel !== normalizedModel) {
            // Error message mentions a different model name
            finalErrorMessage += `\nRequested model: "${actualModelName}"`;
            finalErrorMessage += `\nNormalized model: "${normalizedModel}"`;
            if (
              mentionedModel !== actualModelName &&
              mentionedModel !== normalizedModel
            ) {
              finalErrorMessage += `\nModel mentioned by API: "${mentionedModel}"`;
            }
          } else {
            // Default case
            finalErrorMessage += `\nModel name: "${normalizedModel}"`;
            if (actualModelName !== normalizedModel) {
              finalErrorMessage += ` (original: "${actualModelName}")`;
            }
          }

          finalErrorMessage += `\n\nPlease verify the model name. Check the list of available models in Gemini API.`;

          return NextResponse.json(
            {
              error: finalErrorMessage,
              details: errorMessage, // Keep original error message in details only
              normalizedModel,
              originalModel: model,
            },
            { status: 404 }
          );
        }

        // Include model info for other errors too (error message is already normalized)
        let finalErrorMessage = `Gemini API error: ${errorMessage}`;
        if (errorMessage.includes('model')) {
          // Since normalized model name is already in the error message, append only extra info
          if (model !== normalizedModel) {
            finalErrorMessage += `\nUsed model: "${normalizedModel}" (original: "${model}")`;
          } else {
            finalErrorMessage += `\nUsed model: "${normalizedModel}"`;
          }
        }

        return NextResponse.json(
          {
            error: finalErrorMessage,
            details: errorMessage, // Keep original error message in details only
            normalizedModel,
            originalModel: model,
          },
          { status: openaiRes.status || 500 }
        );
      }

      if (!openaiRes.body) {
        try {
          const { logOpenAIRequest } = await import('@/lib/modelServerMonitor');
          await logOpenAIRequest(instanceId, {
            method: 'POST',
            endpoint: geminiUrl,
            model: cleanModelName,
            messages: openaiMessages,
            userAgent,
            clientIP,
            responseTime: Date.now() - startAt,
            responseStatus: openaiRes.status,
            errorMessage: `Empty response body (HTTP ${openaiRes.status})`,
            isStream: true,
            roomId,
            userId: payload?.email || 'unknown',
            level: 'error',
            hasFiles,
            fileCount: 0,
            provider: 'gemini', // Explicitly mark as Gemini API
          });
        } catch (logErr) {
          console.error('[generate] Failed to write log:', logErr);
        }
        return NextResponse.json(
          { error: `Gemini API response error: HTTP ${openaiRes.status}` },
          { status: openaiRes.status }
        );
      }

      // Convert Gemini streaming response to OpenAI format
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = openaiRes.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let accumulatedText = '';
          let buffer = ''; // Buffer for collecting complete JSON objects
          let streamClosed = false;
          let streamError = null;

          // Gemini response handler
          const processGeminiResponse = (geminiData) => {
            if (streamClosed) return; // Do not process already closed stream

            try {
              // Check for error response
              if (geminiData.error) {
                const errorMsg =
                  geminiData.error.message || JSON.stringify(geminiData.error);
                console.error('[generate] Gemini API error:', errorMsg);
                streamError = errorMsg;
                streamClosed = true;
                controller.error(new Error(`Gemini API error: ${errorMsg}`));
                return;
              }

              if (geminiData.candidates && geminiData.candidates[0]) {
                const candidate = geminiData.candidates[0];

                // Check blocked responses (SAFETY, RECITATION, etc.)
                if (
                  candidate.finishReason &&
                  (candidate.finishReason === 'SAFETY' ||
                    candidate.finishReason === 'RECITATION' ||
                    candidate.finishReason === 'OTHER')
                ) {
                  const safetyRatings = candidate.safetyRatings || [];
                  const blockedReasons = safetyRatings
                    .filter((r) => r.blocked)
                    .map((r) => `${r.category}: ${r.probability}`)
                    .join(', ');

                  const errorMsg = `Response was blocked. Reason: ${
                    candidate.finishReason
                  }${blockedReasons ? ` (${blockedReasons})` : ''}`;
                  console.warn('[generate] Gemini response blocked:', errorMsg);
                  streamError = errorMsg;

                  // Send error through stream
                  const errorChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: actualModelName,
                    choices: [
                      {
                        index: 0,
                        delta: { content: `\n\n[Error] ${errorMsg}` },
                        finish_reason: candidate.finishReason,
                      },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`)
                  );
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  streamClosed = true;
                  controller.close();
                  return;
                }

                const content = candidate.content;

                if (content && content.parts && content.parts[0]) {
                  const text = content.parts[0].text || '';
                  if (text) {
                    accumulatedText += text;

                    const openaiChunk = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: cleanModelName,
                      choices: [
                        {
                          index: 0,
                          delta: { content: text },
                          finish_reason: null,
                        },
                      ],
                    };

                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`)
                    );
                  }
                }

                if (candidate.finishReason) {
                  const finalChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: cleanModelName,
                    choices: [
                      {
                        index: 0,
                        delta: {},
                        finish_reason: candidate.finishReason,
                      },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`)
                  );
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                  streamClosed = true;
                  controller.close();
                  return;
                }
              } else if (
                geminiData.candidates &&
                geminiData.candidates.length === 0
              ) {
                // No candidates returned (all may be blocked)
                console.warn(
                  '[generate] No Gemini response candidates - all responses may have been blocked.'
                );
                streamError =
                  'Unable to generate a response. It may have been blocked by the safety filter.';
                const errorChunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: cleanModelName,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content:
                          '\n\n[Error] Unable to generate a response. It may have been blocked by the safety filter.',
                      },
                      finish_reason: 'content_filter',
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`)
                );
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                streamClosed = true;
                controller.close();
                return;
              }
            } catch (e) {
              // If an error occurs while processing, log and continue
              console.warn('[generate] Error while processing Gemini response:', e.message);
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Process remaining buffer when stream ends
                if (buffer.trim() && !streamClosed) {
                  try {
                    const geminiData = JSON.parse(buffer.trim());
                    processGeminiResponse(geminiData);
                  } catch (e) {
                    console.warn(
                      '[generate] Failed to parse Gemini buffer JSON:',
                      e?.message || e
                    );
                  }
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // Find and process complete JSON objects
              // Use brace matching to identify complete JSON objects
              let braceCount = 0;
              let startIndex = -1;

              for (let i = 0; i < buffer.length; i++) {
                const char = buffer[i];

                if (char === '{') {
                  if (startIndex === -1) {
                      startIndex = i; // JSON object start position
                  }
                  braceCount++;
                } else if (char === '}') {
                  braceCount--;

                  // If all braces are closed, this is a complete JSON object
                  if (braceCount === 0 && startIndex !== -1) {
                    const jsonStr = buffer.substring(startIndex, i + 1);
                    buffer = buffer.substring(i + 1);

                    try {
                      const geminiData = JSON.parse(jsonStr);
                      if (!streamClosed) {
                        processGeminiResponse(geminiData);
                      }
                    } catch (e) {
                      // Ignore JSON parse failures (could be incomplete object)
                      console.warn(
                        '[generate] Gemini JSON parse failed:',
                        e.message
                      );
                    }

                    // Reset to find next JSON object
                    startIndex = -1;
                    braceCount = 0;
                  }
                }
              }

              // Keep only unprocessed content in buffer
              if (startIndex !== -1) {
                buffer = buffer.substring(startIndex);
              } else {
                buffer = '';
              }
            }

            // Normal stream termination
            if (!streamClosed) {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          } catch (error) {
            console.error('[generate] Gemini streaming error:', error);
            streamError = error?.message || String(error);
            if (!streamClosed) {
              try {
                controller.error(error);
              } catch (e) {
                console.warn(
                  '[generate] Failed while handling stream termination:',
                  e?.message || e
                );
              }
            }
          } finally {
            try {
              await maybeLogExternalApi({
                sourceType: 'internal',
                provider: 'gemini',
                apiType: apiTypeForLog,
                endpoint: geminiUrl,
                model: cleanModelName,
                messages: buildMessagesWithResponse(
                  fullMessagesForLogging,
                  accumulatedText
                ),
                promptTokenCount: finalPrompt.length,
                responseTokenCount: accumulatedText.length,
                responseTime: Date.now() - startAt,
                statusCode: streamError ? 429 : openaiRes.status,
                isStream: true,
                error: streamError || undefined,
                clientIP,
                userAgent,
                roomId: roomId || null,
                jwtUserId: payload?.sub || null,
                jwtEmail: payload?.email || null,
                jwtName: payload?.name || null,
                jwtRole: payload?.role || null,
                xForwardedFor: request.headers.get('x-forwarded-for'),
                xRealIP: request.headers.get('x-real-ip'),
                acceptLanguage: request.headers.get('accept-language'),
                referer: request.headers.get('referer'),
                origin: request.headers.get('origin'),
              });
            } catch (logErr) {
              console.warn(
                '[generate] Gemini external API logging failed (ignored):',
                logErr?.message || logErr
              );
            }
            await logImageAnalysisToMessages({
              requestPurpose,
              roomId: roomId || null,
              userId: payload?.sub || null,
              userRole: payload?.role || null,
              model: cleanModelName,
              text: accumulatedText,
              clientIP,
            });
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    } else if (endpointType === 'openai-compatible') {
      // OpenAI-compatible call
      const base = (openaiCompatBase || '').replace(/\/+$/, '');
      if (!base) {
        return NextResponse.json(
          { error: 'OpenAI-compatible model server is not configured.' },
          { status: 400 }
        );
      }
      // Build /v1/chat/completions path (works even if base already includes /v1)
      const openaiUrl = `${base}${
        /\/v1(\/|$)/.test(base) ? '/chat/completions' : '/v1/chat/completions'
      }`;
      const headers = { 'Content-Type': 'application/json' };
      if (openaiCompatApiKey)
        headers['Authorization'] = `Bearer ${openaiCompatApiKey}`;

      // Build message array for OpenAI-compatible API
      const hasSystemInHistory = filteredMultiturnHistory.some((m) => m.role === 'system');
      const openaiMessages = [
        ...(systemPrompt && !hasSystemInHistory ? [{ role: 'system', content: systemPrompt }] : []),
        ...filteredMultiturnHistory.map((msg) => ({
          role: msg.role,
          content: typeof msg.text === 'string' ? msg.text : msg.text || '',
        })),
        {
          role: 'user',
          content: buildUserContent(
            fileContent ? `${fileContent}\n\n${question}` : question,
            normalizedImages
          ),
        },
      ];

      // actualModelName is already DB-mapped via resolveModelId() — use as-is
      const body = {
        model: actualModelName,
        stream: llmPayload?.stream !== false,
        messages: openaiMessages,
      };

      // Extract temperature, max_tokens from options if provided
      if (llmPayload?.options?.temperature != null) {
        body.temperature = llmPayload.options.temperature;
      }
      if (llmPayload?.options?.max_tokens != null) {
        body.max_tokens = llmPayload.options.max_tokens;
      }

      const startAt = Date.now();
      const openaiRes = await fetch(openaiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      // Build instance identifier (OpenAI-compatible instance)
      let instanceId = 'openai-compatible-unknown';
      try {
        const u = new URL(base);
        instanceId = `openai-compatible-${u.hostname}-${u.port || ''}`;
      } catch (error) {
        console.warn('[OpenAI Compatible] URL parsing failed, using default instance ID:', error.message);
      }

      if (!openaiRes.body) {
        // Also record error in modellogs
        try {
          const { logOpenAIRequest } = await import('@/lib/modelServerMonitor');
          await logOpenAIRequest(instanceId, {
            method: 'POST',
            endpoint: openaiUrl,
            model,
            messages: openaiMessages,
            userAgent,
            clientIP,
            responseTime: Date.now() - startAt,
            responseStatus: openaiRes.status,
            errorMessage: `Empty response body (HTTP ${openaiRes.status})`,
            isStream: true,
            roomId,
            userId: payload?.email || 'unknown',
            level: 'error',
            hasFiles,
            fileCount: 0,
            promptTokens: finalPrompt.length,
          });
        } catch (e) {
          console.warn(
            '[openai-compatible] Failed to write modellogs error (ignored):',
            e?.message || e
          );
        }

        // Also record failed calls in external API logs
        try {
          await maybeLogExternalApi({
            sourceType: 'internal',
            provider: 'openai-compatible',
            apiType: apiTypeForLog,
            endpoint: openaiUrl,
            model: actualModelName, // Actual model name
            messages: fullMessagesForLogging, // Include full message history
            promptTokenCount: finalPrompt.length,
            responseTokenCount: 0,
            responseTime: Date.now() - startAt,
            statusCode: openaiRes.status,
            isStream: true,
            error: `Empty response body (HTTP ${openaiRes.status})`,
            clientIP,
            userAgent,
            roomId: roomId || null,
            jwtUserId: payload?.sub || null,
            jwtEmail: payload?.email || null,
            jwtName: payload?.name || null,
            jwtRole: payload?.role || null,
            xForwardedFor: request.headers.get('x-forwarded-for'),
            xRealIP: request.headers.get('x-real-ip'),
            acceptLanguage: request.headers.get('accept-language'),
            referer: request.headers.get('referer'),
            origin: request.headers.get('origin'),
          });
        } catch (logErr) {
          console.warn(
              '[openai-compatible] External API logging failed (ignored):',
            logErr?.message || logErr
          );
        }

        return NextResponse.json(
          {
              error: `OpenAI-compatible response stream is empty. (HTTP ${openaiRes.status})`,
          },
          { status: 500 }
        );
      }

      // Log when OpenAI-compatible API fails (body exists but status is failure)
      if (!openaiRes.ok) {
        try {
          let errorText = '';
          try {
            // Clone before reading response body
            const clonedRes = openaiRes.clone();
            errorText = await clonedRes.text();
          } catch (e) {
            errorText = `HTTP ${openaiRes.status}: ${openaiRes.statusText}`;
          }

          await maybeLogExternalApi({
            sourceType: 'internal',
            provider: 'openai-compatible',
            apiType: apiTypeForLog,
            endpoint: openaiUrl,
            model: actualModelName, // Actual model name
            messages: fullMessagesForLogging, // Include full message history
            promptTokenCount: finalPrompt.length,
            responseTokenCount: 0,
            responseTime: Date.now() - startAt,
            statusCode: openaiRes.status,
            isStream: true,
            error: errorText.substring(0, 500),
            clientIP,
            userAgent,
            roomId: roomId || null,
            jwtUserId: payload?.sub || null,
            jwtEmail: payload?.email || null,
            jwtName: payload?.name || null,
            jwtRole: payload?.role || null,
            xForwardedFor: request.headers.get('x-forwarded-for'),
            xRealIP: request.headers.get('x-real-ip'),
            acceptLanguage: request.headers.get('accept-language'),
            referer: request.headers.get('referer'),
            origin: request.headers.get('origin'),
          });
        } catch (logErr) {
          console.warn(
            '[openai-compatible] External API logging failed (ignored):',
            logErr?.message || logErr
          );
        }
      }

      // Convert OpenAI SSE -> existing JSONL {response: "..."} stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const reader = openaiRes.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          let accumulatedResponse = '';
          let firstResponseAt = null;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                // SSE format: data: {...} or [DONE]
                const m = line.startsWith('data:')
                  ? line.slice(5).trim()
                  : null;
                if (m === null) continue;
                if (m === '[DONE]') {
                  controller.close();
                  // External API logging when stream completes (openai-compatible)
                  try {
                    const responseTime = Date.now() - startAt;
                    await maybeLogExternalApi({
                      sourceType: 'internal',
                      provider: 'openai-compatible',
                      apiType: apiTypeForLog,
                      endpoint: openaiUrl,
                      model: actualModelName, // Actual model name
                      messages: fullMessagesForLogging, // Include full message history
                      promptTokenCount: finalPrompt.length,
                      responseTokenCount: accumulatedResponse.length,
                      responseTime,
                      firstResponseTime: firstResponseAt
                        ? firstResponseAt - startAt
                        : responseTime,
                      finalResponseTime: responseTime,
                      statusCode: openaiRes.status,
                      isStream: true,
                      clientIP,
                      userAgent,
                      roomId: roomId || null,
                    });
                  } catch (e) {
                    console.warn(
                      '[openai-compatible] External API logging failed (ignored):',
                      e?.message || e
                    );
                  }
                  await logImageAnalysisToMessages({
                    requestPurpose,
                    roomId: roomId || null,
                    userId: payload?.sub || null,
                    userRole: payload?.role || null,
                    model: actualModelName,
                    text: accumulatedResponse,
                    clientIP,
                  });
                  // Also write OPENAI proxy log to modellogs
                  try {
                    const { logOpenAIRequest } = await import(
                      '@/lib/modelServerMonitor'
                    );
                    await logOpenAIRequest(instanceId, {
                      method: 'POST',
                      endpoint: openaiUrl,
                      model,
                      messages: openaiMessages,
                      userAgent,
                      clientIP,
                      requestSize: JSON.stringify(body).length,
                      responseTime: Date.now() - startAt,
                      responseStatus: openaiRes.status,
                      responseSize: accumulatedResponse.length,
                      isStream: true,
                      roomId,
                      userId: payload?.email || 'unknown',
                      level: openaiRes.ok ? 'info' : 'error',
                      hasFiles,
                      fileCount: 0,
                      promptTokens: finalPrompt.length,
                      completionTokens: accumulatedResponse.length,
                      totalTokens:
                        finalPrompt.length + accumulatedResponse.length,
                    });
                  } catch (e) {
                    console.warn(
                      '[openai-compatible] Failed to write modellogs (ignored):',
                      e?.message || e
                    );
                  }
                  return;
                }
                try {
                  const json = JSON.parse(m);
                  const delta =
                    json.choices?.[0]?.delta?.content ??
                    json.choices?.[0]?.text ??
                    '';
                  if (delta) {
                    accumulatedResponse += delta;
                    if (!firstResponseAt) {
                      firstResponseAt = Date.now();
                    }
                    controller.enqueue(
                      encoder.encode(JSON.stringify({ response: delta }) + '\n')
                    );
                  }
                } catch (error) {
                  console.warn('[Catch] Error occurred:', error.message);
                  // Ignore
                }
              }
            }
            // Process remaining buffer
            const rest = buffer.trim();
            if (rest.startsWith('data:')) {
              const payload = rest.slice(5).trim();
              if (payload && payload !== '[DONE]') {
                try {
                  const json = JSON.parse(payload);
                  const delta =
                    json.choices?.[0]?.delta?.content ??
                    json.choices?.[0]?.text ??
                    '';
                  if (delta) {
                    accumulatedResponse += delta;
                    if (!firstResponseAt) {
                      firstResponseAt = Date.now();
                    }
                    controller.enqueue(
                      encoder.encode(JSON.stringify({ response: delta }) + '\n')
                    );
                  }
                } catch (error) {
                  console.warn('[Catch] Error occurred:', error.message);
                  // Ignore
                }
              }
            }
            controller.close();
            // External API logging on natural stream end (openai-compatible)
            try {
              const responseTime = Date.now() - startAt;
              await maybeLogExternalApi({
                sourceType: 'internal',
                provider: 'openai-compatible',
                apiType: apiTypeForLog,
                endpoint: openaiUrl,
                model: actualModelName, // Actual model name
                messages: fullMessagesForLogging, // Include full message history
                promptTokenCount: finalPrompt.length,
                responseTokenCount: accumulatedResponse.length,
                responseTime,
                statusCode: openaiRes.status,
                isStream: true,
                clientIP,
                userAgent,
                roomId: roomId || null,
              });
            } catch (e) {
              console.warn(
                  '[openai-compatible] External API logging failed (ignored):',
                e?.message || e
              );
            }
            await logImageAnalysisToMessages({
              requestPurpose,
              roomId: roomId || null,
              userId: payload?.sub || null,
              userRole: payload?.role || null,
              model: actualModelName,
              text: accumulatedResponse,
              clientIP,
            });
            // Also write OPENAI proxy log to modellogs
            try {
              const { logOpenAIRequest } = await import(
                '@/lib/modelServerMonitor'
              );
              await logOpenAIRequest(instanceId, {
                method: 'POST',
                endpoint: openaiUrl,
                model,
                messages: openaiMessages,
                userAgent,
                clientIP,
                requestSize: JSON.stringify(body).length,
                responseTime: Date.now() - startAt,
                responseStatus: openaiRes.status,
                responseSize: accumulatedResponse.length,
                isStream: true,
                roomId,
                userId: payload?.email || 'unknown',
                level: openaiRes.ok ? 'info' : 'error',
                hasFiles,
                fileCount: 0,
                promptTokens: finalPrompt.length,
                completionTokens: accumulatedResponse.length,
                totalTokens: finalPrompt.length + accumulatedResponse.length,
              });
            } catch (e) {
              console.warn(
                  '[openai-compatible] Failed to write modellogs (ignored):',
                e?.message || e
              );
            }
          } catch (e) {
            console.error('[generate] OpenAI-compatible stream processing error:', e);
            controller.error(e);
          }
        },
      });

      return new Response(stream, {
        status: openaiRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // LLM request (round-robin tracking)
      let llmEndpoint = forcedLlmEndpoint;
      let roundRobinIndex = null;
      if (!llmEndpoint) {
          // Parse server name from model name
        let { serverName } = parseModelName(model);

          // If server name cannot be parsed from model ID, check DB settings
        if (!serverName) {
          const { getServerNameForModel } = await import('@/lib/modelServers');
          const dbServerName = await getServerNameForModel(model);
          if (dbServerName) {
            serverName = dbServerName;
            console.log(
              `[Model Server Selection] Found server group in DB settings: "${model}" -> "${serverName}"`
            );
          }
        }

        if (serverName) {
          // If server name exists, round-robin only within that server group
          const serverEndpoint = await getModelServerEndpointByName(serverName);
          if (serverEndpoint) {
            llmEndpoint = serverEndpoint.endpoint;
            roundRobinIndex = serverEndpoint.index;
            console.log(
              `[Model Server Selection] Model "${model}" -> server group "${serverName}" -> endpoint: ${llmEndpoint} (RR: ${roundRobinIndex})`
            );
          } else {
            // If not found by server name, use global round-robin
            console.warn(
              `[Model Server Selection] Could not find server group "${serverName}", using global round-robin`
            );
            const next = await getNextModelServerEndpointWithIndex();
            llmEndpoint = next.endpoint;
            roundRobinIndex = next.index;
          }
        } else {
          // If no server name, use global round-robin
          const next = await getNextModelServerEndpointWithIndex();
          llmEndpoint = next.endpoint;
          roundRobinIndex = next.index;
        }
      }
      const llmUrl = `${llmEndpoint}/api/chat`;
      const startTime = Date.now();
      const streamStartTime = Date.now(); // Stream start time (for logging)
      const instanceId = `llm-${new URL(llmEndpoint).hostname}-${
        new URL(llmEndpoint).port
      }`;

      // Build message array for Ollama /api/chat
      const ollamaMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...filteredMultiturnHistory.map((msg) => ({
          role: msg.role,
          content: typeof msg.text === 'string' ? msg.text : msg.text || '',
        })),
        {
          role: 'user',
          content: userText,
          ...(normalizedImages.length > 0
            ? { images: normalizedImages.map((image) => image.data).filter(Boolean) }
            : {}),
        },
      ];

      console.log(
        `[generate] Ollama /api/chat call: ${filteredMultiturnHistory.length} history message(s) + current question`
      );

      const llmRes = await fetch(llmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: actualModelName, // Use value converted from UUID -> actual model name
          messages: ollamaMessages,
          stream: true,
          options: llmPayload.options || {},
        }),
      });

      const responseTime = Date.now() - startTime;

      // Record detailed LLM request log
      const requestLogData = {
        method: 'POST',
        endpoint: '/api/chat',
        requestType,
        model,
        hasFiles,
        fileCount: 0,
        userAgent,
        clientIP,
        requestSize: JSON.stringify({ model, messages: ollamaMessages }).length,
        responseTime,
        responseStatus: llmRes.status,
        responseSize: 0, // Streaming response, difficult to calculate later
        errorMessage: llmRes.ok
          ? null
          : `HTTP ${llmRes.status}: ${llmRes.statusText}`,
        roundRobinIndex,
        roomId,
        userId: payload?.email || 'unknown',
      };

      await logModelServerRequest(instanceId, requestLogData);

      // Keep existing log as well
      if (llmRes.ok) {
        await logModelServerAPICall(llmEndpoint, true, responseTime);
      } else {
        await logModelServerAPICall(
          llmEndpoint,
          false,
          responseTime,
          new Error(`HTTP ${llmRes.status}: ${llmRes.statusText}`)
        );

        // Also record failed calls in external API logs
        try {
          let errorText = '';
          try {
            // Clone before reading response body (prevent stream consumption)
            const clonedRes = llmRes.clone();
            errorText = await clonedRes.text();
          } catch (e) {
            errorText = `HTTP ${llmRes.status}: ${llmRes.statusText}`;
          }

          await maybeLogExternalApi({
            sourceType: 'internal',
            provider: 'model-server',
            apiType: apiTypeForLog,
            endpoint: llmUrl,
            model: actualModelName, // Actual model name
            messages: fullMessagesForLogging, // Include full message history
            promptTokenCount: ollamaMessages.reduce(
              (sum, m) => sum + (m.content?.length || 0),
              0
            ),
            responseTokenCount: 0,
            responseTime,
            statusCode: llmRes.status,
            isStream: true,
            error: errorText.substring(0, 500),
            clientIP,
            userAgent,
            roomId: roomId || null,
            jwtUserId: payload?.sub || null,
            jwtEmail: payload?.email || null,
            jwtName: payload?.name || null,
            jwtRole: payload?.role || null,
            xForwardedFor: request.headers.get('x-forwarded-for'),
            xRealIP: request.headers.get('x-real-ip'),
            acceptLanguage: request.headers.get('accept-language'),
            referer: request.headers.get('referer'),
            origin: request.headers.get('origin'),
          });
        } catch (logErr) {
          console.warn(
            '[webapp-generate] External API logging failed (ignored):',
            logErr?.message || logErr
          );
        }
      }

      const piiFilterResponse = matchedModel?.piiFilterResponse === true;

      // Stream response (accumulate response content for logging)
      const stream = new ReadableStream({
        async start(controller) {
          const reader = llmRes.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let accumulatedResponse = '';
          const streamStartTime = Date.now();

          try {
            const parseOllamaLine = (rawLine) => {
              if (!rawLine) return null;
              let line = rawLine.trim();
              if (!line) return null;
              if (line.startsWith('data:')) {
                line = line.replace(/^data:\s*/, '');
                if (line === '[DONE]') {
                  return { done: true };
                }
              }
              if (!line.startsWith('{')) return null;
              try {
                return JSON.parse(line);
              } catch (parseError) {
                const start = line.indexOf('{');
                const end = line.lastIndexOf('}');
                if (start !== -1 && end > start) {
                  try {
                    return JSON.parse(line.slice(start, end + 1));
                  } catch (innerError) {
                    return null;
                  }
                }
                return null;
              }
            };
            let buffer = '';
            let parseFailureCount = 0;
            let streamClosed = false;
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  const json = parseOllamaLine(line);
                  if (!json) {
                    parseFailureCount += 1;
                    continue;
                  }

                  if (json.message?.content) {
                    accumulatedResponse += json.message.content;

                    if (!piiFilterResponse) {
                      const responseChunk =
                        JSON.stringify({
                          response: json.message.content,
                        }) + '\n';
                      if (!streamClosed) {
                        try {
                          controller.enqueue(
                            new TextEncoder().encode(responseChunk)
                          );
                        } catch (enqueueError) {
                          streamClosed = true;
                        }
                      }
                    }
                  }

                  if (json.done) {
                    break;
                  }
                } catch (parseError) {
                  parseFailureCount += 1;
                }
              }
            }

            if (piiFilterResponse && accumulatedResponse) {
              const piiResult = await detectAndMaskPII(accumulatedResponse, {
                mxtVrf: matchedModel?.piiResponseMxtVrf !== false,
                maskOpt: matchedModel?.piiResponseMaskOpt !== false,
              }, {
                model: actualModelName,
                roomId: roomId || null,
                clientIP,
                userAgent,
                xForwardedFor: request.headers.get('x-forwarded-for'),
                xRealIP: request.headers.get('x-real-ip'),
                acceptLanguage: request.headers.get('accept-language'),
                referer: request.headers.get('referer'),
                origin: request.headers.get('origin'),
                jwtUserId: payload?.sub || null,
                jwtEmail: payload?.email || null,
                jwtName: payload?.name || null,
                jwtRole: payload?.role || null,
              });
              const finalResponse = piiResult.detected ? piiResult.maskedText : accumulatedResponse;
              if (piiResult.detected) {
                console.log(`[PII] Detected ${piiResult.detectedCnt} PII item(s) in response -> mask applied`);
              }
              if (!streamClosed) {
                try {
                  controller.enqueue(
                    new TextEncoder().encode(JSON.stringify({ response: finalResponse }) + '\n')
                  );
                } catch (enqueueError) {
                  streamClosed = true;
                }
              }
              accumulatedResponse = finalResponse;
            }

            if (!streamClosed) {
              try {
                controller.close();
              } catch (closeError) {
                streamClosed = true;
              }
            }

            if (parseFailureCount > 0) {
              console.info(
                `[generate] Ollama response parse failed ${parseFailureCount} time(s) (some lines skipped due to partial chunks)`
              );
            }

            // External API logging after stream completion
            if (llmRes.ok) {
              try {
                const streamResponseTime = Date.now() - streamStartTime;
                const promptTokens = ollamaMessages.reduce(
                  (sum, m) => sum + (m.content?.length || 0),
                  0
                );
                const responseTokens = accumulatedResponse.length;

                // Extract user information
                const jwtUserId = payload?.sub || null;
                const jwtEmail = payload?.email || null;
                const jwtName = payload?.name || null;
                const jwtRole = payload?.role || null;

                await maybeLogExternalApi({
                  sourceType: 'internal',
                  provider: 'model-server',
                  apiType: apiTypeForLog,
                  endpoint: llmUrl,
                  model: actualModelName, // Actual model name
                  messages: fullMessagesForLogging, // Include full message history
                  promptTokenCount: promptTokens,
                  responseTokenCount: responseTokens,
                  responseTime: streamResponseTime,
                  statusCode: llmRes.status,
                  isStream: true,
                  clientIP,
                  userAgent,
                  roomId: roomId || null,
                  jwtUserId,
                  jwtEmail,
                  jwtName,
                  jwtRole,
                  xForwardedFor: request.headers.get('x-forwarded-for'),
                  xRealIP: request.headers.get('x-real-ip'),
                  acceptLanguage: request.headers.get('accept-language'),
                  referer: request.headers.get('referer'),
                  origin: request.headers.get('origin'),
                });
              } catch (logError) {
                console.warn(
                  '[webapp-generate] External API logging failed (ignored):',
                  logError?.message || logError
                );
              }
              await logImageAnalysisToMessages({
                requestPurpose,
                roomId: roomId || null,
                userId: payload?.sub || null,
                userRole: payload?.role || null,
                model: actualModelName,
                text: accumulatedResponse,
                clientIP,
              });
            }
          } catch (streamError) {
            console.error('[webapp-generate] Stream processing error:', streamError);
            controller.error(streamError);
          }
        },
      });

      return new Response(stream, {
        status: llmRes.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('[/api/generate] Server error:', err);

    // Write logs even on error conditions
    try {
      if (typeof instanceId !== 'undefined' && instanceId) {
        await logModelServerRequest(instanceId, {
          method: 'POST',
          endpoint: '/api/generate',
          requestType:
            typeof requestType !== 'undefined' ? requestType : 'unknown',
          model: actualModelName || 'unknown',
          responseTime: 0,
          responseStatus: 500,
          errorMessage: err.message,
          roundRobinIndex:
            typeof roundRobinIndex !== 'undefined' ? roundRobinIndex : null,
          roomId: roomId || null,
          userId: typeof payload !== 'undefined' ? payload?.email : 'unknown',
        });
      }
    } catch (logErr) {
      console.error('Failed to write LLM error log:', logErr);
    }

    return NextResponse.json(
      { error: 'Proxy request failed', details: err.message },
      { status: 500 }
    );
  }
}
