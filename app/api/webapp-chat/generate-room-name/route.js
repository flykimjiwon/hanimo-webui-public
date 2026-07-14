import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { isValidUUID } from '@/lib/utils';
import {
  getNextModelServerEndpointWithIndex,
  resolveModelId,
} from '@/lib/modelServers';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { getClientIP } from '@/lib/ip';
import { saveMessageDual } from '@/lib/messageLogger';
import { getModelsFromTables } from '@/lib/modelTables';
import { fetchWithProviderPolicy } from '@/lib/security/provider-outbound.mjs';
import { createProviderFailure } from '@/lib/security/provider-errors.mjs';

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

function convertToResponsesInput(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages
    .map((msg) => {
      if (!msg || typeof msg !== 'object') return null;
      const role = msg.role === 'assistant' ? 'assistant' : msg.role || 'user';
      const text = msg.content ? String(msg.content) : '';
      if (!text) return null;
      return {
        role,
        content: [
          {
            type: role === 'assistant' ? 'output_text' : 'input_text',
            text,
          },
        ],
      };
    })
    .filter(Boolean);
}

// Room name generation API
export async function POST(request) {
  const startTime = Date.now();
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';

  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { roomId, userMessage, assistantMessage } = await request.json();

    if (!roomId) {
      return NextResponse.json(
        { error: 'Room ID is required.' },
        { status: 400 }
      );
    }

    if (!userMessage) {
      return NextResponse.json(
        { error: 'User message is required.' },
        { status: 400 }
      );
    }

    // UUID validation
    if (!isValidUUID(roomId)) {
      return NextResponse.json(
        { error: 'Invalid room ID format.' },
        { status: 400 }
      );
    }

    // Fetch chat room and verify ownership
    const roomResult = await query(
      `SELECT cr.id, cr.user_id, cr.name, u.email, u.name as user_name, 
              u.department, u.cell, u.role as user_role
       FROM chat_rooms cr
       JOIN users u ON cr.user_id = u.id
       WHERE cr.id = $1`,
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Chat room not found.' },
        { status: 404 }
      );
    }

    const roomRow = roomResult.rows[0];
    const room = {
      _id: roomRow.id,
      id: roomRow.id,
      userId: roomRow.user_id,
      name: roomRow.name,
    };

    const roomOwner = {
      _id: roomRow.user_id,
      id: roomRow.user_id,
      email: roomRow.email,
      name: roomRow.user_name,
      department: roomRow.department,
      cell: roomRow.cell,
      role: roomRow.user_role,
    };

    // Verify chat room owner
    if (roomOwner.email !== payload.email) {
      return NextResponse.json(
        {
          error: 'Unauthorized access to this chat room.',
          shouldLogout: true,
          message: 'Authentication expired. Please log in again.',
        },
        { status: 403 }
      );
    }

    // Check whether room name has already been changed (if not New Chat, already generated)
    if (room.name !== 'New Chat') {
      return NextResponse.json({
        success: true,
        roomName: room.name,
        message: 'Room name is already set.',
      });
    }

    // Check whether this is the first conversation: count actual chat messages in chat_history
    // Exclude log messages ([Room Title Generation], [File Parsing], etc.)
    const messageCountResult = await query(
      `SELECT COUNT(*) as count FROM chat_history 
       WHERE room_id = $1 
       AND text NOT LIKE '[%'`,
      [roomId]
    );
    const messageCount = parseInt(messageCountResult.rows[0]?.count || 0);

    // Load room-name generation model config from admin settings (query first for consistency)
    const settingsResult = await query(
      `SELECT room_name_generation_model, file_parsing_model FROM settings WHERE config_type = 'general' LIMIT 1`
    );
    const model =
      settingsResult.rows.length > 0 &&
      settingsResult.rows[0].room_name_generation_model
        ? settingsResult.rows[0].room_name_generation_model
        : settingsResult.rows.length > 0 &&
          settingsResult.rows[0].file_parsing_model
        ? settingsResult.rows[0].file_parsing_model
        : 'gemma3:4b';
    let modelRecord = null;
    try {
      const categories = await getModelsFromTables();
      const allModels = [];
      if (categories) {
        Object.values(categories).forEach((category) => {
          if (category.models && Array.isArray(category.models)) {
            allModels.push(...category.models);
          }
        });
      }
      modelRecord =
        allModels.find((m) => m.id === model) ||
        allModels.find((m) => m.modelName === model) ||
        allModels.find(
          (m) => m.label && m.label.toLowerCase() === String(model).toLowerCase()
        ) ||
        null;
    } catch (error) {
      logger.warn('[generate-room-name] Failed to fetch model record:', error.message);
    }

    const resolvedModel = await resolveModelId(model);
    const modelForRequest = resolvedModel || model;
    try {
      if (!modelRecord) {
        const categories = await getModelsFromTables();
        const allModels = [];
        if (categories) {
          Object.values(categories).forEach((category) => {
            if (category.models && Array.isArray(category.models)) {
              allModels.push(...category.models);
            }
          });
        }
        modelRecord =
          allModels.find((m) => m.id === modelForRequest) ||
          allModels.find((m) => m.modelName === modelForRequest) ||
          allModels.find(
            (m) =>
              m.label &&
              m.label.toLowerCase() ===
                String(modelForRequest).toLowerCase()
          ) ||
          null;
      }
    } catch (error) {
      logger.warn('[generate-room-name] Failed to fetch model record:', error.message);
    }
    logger.info('[generate-room-name] Selected model:', {
      model: modelForRequest,
      endpoint: modelRecord?.endpoint || null,
      hasApiConfig: !!modelRecord?.apiConfig,
      hasApiKey: !!modelRecord?.apiKey,
    });

    // Check message count (if over 2, multiple turns already happened)
    if (messageCount > 2) {
      // Record request log (user request) - includes model info
      try {
        const requestText =
          userMessage.length > 100
            ? `${userMessage.substring(0, 100)}...`
            : userMessage;
        await saveMessageDual({
          roomId: roomId,
          userId: room.userId,
          role: 'user',
          text: `[Room Title Generation Request] ${requestText}`,
          model: modelForRequest,
          email: roomOwner.email || payload.email,
          name: roomOwner.name || payload.name || '',
          department: roomOwner.department || '',
          cell: roomOwner.cell || '',
          userRole: roomOwner.role || 'user',
          clientIP: clientIP,
        });
      } catch (msgLogError) {
        logger.warn(
          '[generate-room-name] Failed to save request log (ignored):',
          msgLogError.message
        );
      }

      // Record API call log (when messages already exist)
      try {
        await saveMessageDual({
          roomId: roomId,
          userId: room.userId,
          role: 'assistant',
          text: `[Room Title Generation Response] Skipped because this is not the first conversation (${messageCount} messages exist)`,
          model: modelForRequest,
          email: roomOwner.email || payload.email,
          name: roomOwner.name || payload.name || '',
          department: roomOwner.department || '',
          cell: roomOwner.cell || '',
          userRole: roomOwner.role || 'user',
          clientIP: clientIP,
        });
      } catch (msgLogError) {
        logger.warn(
          '[generate-room-name] Failed to save message (ignored):',
          msgLogError.message
        );
      }

      return NextResponse.json({
        success: true,
        roomName: room.name,
        message: 'Room name generation is skipped because this is not the first conversation.',
      });
    }

    // Generate room name with LLM
    // If user message is too long, only use first 100 and last 100 characters
    let processedUserMessage = userMessage;
    if (userMessage && userMessage.length > 200) {
      const frontPart = userMessage.substring(0, 100);
      const backPart = userMessage.substring(userMessage.length - 100);
      processedUserMessage = `${frontPart}...${backPart}`;
    }

    let prompt;
    if (assistantMessage) {
      // When assistant response exists (existing flow)
      prompt = `Generate an appropriate chat room name based on the conversation below.
If the user request is long, use only the first 100 and last 100 characters to set the title.
Keep the room name concise and clear within 30 characters.
Output only the room name, without any additional explanation.

User: ${processedUserMessage}
Assistant: ${assistantMessage}

Room name:`;
    } else {
      // When only user request exists (save context)
      prompt = `Generate an appropriate chat room name based on the user request below.
If the user request is long, use only the first 100 and last 100 characters to set the title.
Keep the room name concise and clear within 30 characters.
Output only the room name, without any additional explanation.

User request: ${processedUserMessage}

Room name:`;
    }


    // Record room-title generation request log (user request) - includes model info
    try {
      const requestText =
        userMessage.length > 100
          ? `${userMessage.substring(0, 100)}...`
          : userMessage;
      await saveMessageDual({
        roomId: roomId,
        userId: room.userId,
        role: 'user',
        text: `[Room Title Generation Request] ${requestText}`,
        model: modelForRequest,
        email: roomOwner.email || payload.email,
        name: roomOwner.name || payload.name || '',
        department: roomOwner.department || '',
        cell: roomOwner.cell || '',
        userRole: roomOwner.role || 'user',
        clientIP: clientIP,
      });
    } catch (msgLogError) {
      logger.warn(
        '[generate-room-name] Failed to save request log (ignored):',
        msgLogError.message
      );
    }

    try {
      if (modelRecord?.endpoint === 'manual' || modelRecord?.apiConfig) {
        const manualConfig =
          typeof modelRecord.apiConfig === 'string'
            ? JSON.parse(modelRecord.apiConfig)
            : modelRecord.apiConfig;
        if (!manualConfig?.url) {
          throw new Error('Manual API URL is not configured.');
        }
        const responsePath = manualConfig?.responseMapping?.path || null;

        const baseMessages = [
          ...(modelRecord.systemPrompt && modelRecord.systemPrompt.length > 0
            ? [
                {
                  role: 'system',
                  content: modelRecord.systemPrompt
                    .filter((line) => line.trim() !== '')
                    .join('\n'),
                },
              ]
            : []),
          { role: 'user', content: prompt },
        ];
        const context = {
          apiKey: (modelRecord.apiKey || process.env.OPENAI_API_KEY || '').trim(),
          messages: baseMessages,
          message: prompt,
        };
        const manualUrl = applyTemplate(manualConfig.url, context);
        const method = (manualConfig.method || 'POST').toUpperCase();
        const headers = applyTemplate(manualConfig.headers || {}, context);
        let body = applyTemplate(manualConfig.body || {}, context);
        const logLink = `/admin/external-api-logs?apiType=generate-room-name&model=${encodeURIComponent(
          modelForRequest
        )}&provider=manual`;
        if (body && typeof body === 'object' && body.stream !== false) {
          body = { ...body, stream: false };
        }
        if (manualUrl.includes('/v1/responses') && body && typeof body === 'object') {
          if (body.input === context.message) {
            body = { ...body, input: context.message };
          }
          if (Array.isArray(body.input)) {
            body = { ...body, input: convertToResponsesInput(body.input) };
          } else if (Array.isArray(context.messages) && context.messages.length > 0) {
            body = { ...body, input: convertToResponsesInput(context.messages) };
          }
        }
        logger.info('[generate-room-name] Manual API request:', {
          url: manualUrl,
          method,
          hasBody: body !== undefined,
          responsePath: manualConfig?.responseMapping?.path || null,
        });

        const requestOptions = { method, headers };
        if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
          requestOptions.body =
            typeof body === 'string' ? body : JSON.stringify(body);
        }

        const manualStartTime = Date.now();
        const manualRes = await fetchWithProviderPolicy(manualUrl, requestOptions, {
          provider: 'manual',
        });
        const responseTime = Date.now() - manualStartTime;
        if (!manualRes.ok) {
          const errorText = await manualRes.text().catch(() => '');
          await logExternalApiRequest({
            sourceType: 'internal',
            provider: 'manual',
            apiType: 'generate-room-name',
            endpoint: manualUrl,
            model: modelForRequest,
            prompt: prompt,
            promptTokenCount: prompt.length,
            responseTokenCount: 0,
            responseTime,
            statusCode: manualRes.status,
            isStream: false,
            error: `Manual API request failed: HTTP ${manualRes.status} (responseMapping: ${
              responsePath || 'none'
            })`,
            clientIP: clientIP,
            userAgent: userAgent,
            jwtEmail: payload.email,
            jwtUserId: payload.userId || null,
            jwtName: payload.name || null,
          });
          throw new Error(
            `Manual API request failed: HTTP ${manualRes.status} ${errorText}`
          );
        }

        let responseText = '';
        let responseData = null;
        const manualContentType = manualRes.headers.get('content-type') || '';
        if (manualContentType.includes('application/json')) {
          responseData = await manualRes.json();
        } else {
          responseText = await manualRes.text().catch(() => '');
        }

        let generatedName = responseText;
        if (responsePath && responseData) {
          const extracted = getValueByPath(responseData, responsePath);
          if (extracted !== undefined) {
            generatedName = Array.isArray(extracted)
              ? extracted.join('')
              : String(extracted);
          }
        } else if (!generatedName && responseData) {
          generatedName =
            responseData?.response ||
            responseData?.choices?.[0]?.message?.content ||
            '';
        }

        generatedName = (generatedName || '').trim();
        const responseIssue =
          !generatedName || generatedName.length < 2
            ? `Response parsing failed or returned empty result (responseMapping: ${
                responsePath || 'none'
              })`
            : null;
        if (responseIssue) {
          generatedName = 'New Chat';
        }
        generatedName = generatedName
          .replace(/^Room name:\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .trim()
          .substring(0, 30);

        try {
          await logExternalApiRequest({
            sourceType: 'internal',
            provider: 'manual',
            apiType: 'generate-room-name',
            endpoint: manualUrl,
            model: modelForRequest,
            prompt: prompt,
            promptTokenCount: prompt.length,
            responseTokenCount: generatedName.length,
            responseTime,
            statusCode: manualRes.status,
            isStream: false,
            error: responseIssue || null,
            clientIP: clientIP,
            userAgent: userAgent,
            jwtEmail: payload.email,
            jwtUserId: payload.userId || null,
            jwtName: payload.name || null,
          });
        } catch (logError) {
          logger.warn('[generate-room-name] Logging failed (ignored):', logError.message);
        }

        await query(
          `UPDATE chat_rooms 
           SET name = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [generatedName, roomId]
        );

        await saveMessageDual({
          roomId: roomId,
          userId: room.userId,
          role: 'assistant',
          text: `[Room Title Generation Success] ${generatedName}${
            responseIssue ? ` (Warning: ${responseIssue}, log: ${logLink})` : ''
          }`,
          model: modelForRequest,
          email: roomOwner.email || payload.email,
          name: roomOwner.name || payload.name || '',
          department: roomOwner.department || '',
          cell: roomOwner.cell || '',
          userRole: roomOwner.role || 'user',
          clientIP: clientIP,
        });

        return NextResponse.json({
          success: true,
          roomName: generatedName,
        });
      }

      const endpointInfo = await getNextModelServerEndpointWithIndex();
      const llmEndpoint = endpointInfo.endpoint;
      const provider = endpointInfo.provider || 'model-server';
      const llmUrl = `${llmEndpoint}/api/generate`;

      const requestBody = {
        model: modelForRequest,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          max_length: 100,
        },
      };

      const llmStartTime = Date.now();
      const response = await fetchWithProviderPolicy(llmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }, { provider });

      const responseTime = Date.now() - llmStartTime;

      if (!response.ok) {
        const errorText = await response.text();

        // Log even on error
        try {
          await logExternalApiRequest({
            sourceType: 'internal',
            provider: provider,
            apiType: 'generate-room-name',
            endpoint: llmUrl,
            model: modelForRequest,
            prompt: prompt,
            promptTokenCount: prompt.length,
            responseTokenCount: 0,
            responseTime: responseTime,
            statusCode: response.status,
            isStream: false,
            error: `LLM API failure: ${response.status} - ${errorText}`,
            clientIP: clientIP,
            userAgent: userAgent,
            jwtEmail: payload.email,
            jwtUserId: payload.userId || null,
            jwtName: payload.name || null,
          });
        } catch (logError) {
          logger.warn(
            '[generate-room-name] Logging failed (ignored):',
            logError.message
          );
        }

        // Save to messages table for aggregation in message admin view (HTTP error)
        try {
          await saveMessageDual({
            roomId: roomId,
            userId: room.userId,
            role: 'assistant',
            text: `[Room Title Generation Failed] HTTP ${
              response.status
            }: ${errorText.substring(0, 100)}`,
            model: modelForRequest,
            email: roomOwner.email || payload.email,
            name: roomOwner.name || payload.name || '',
            department: roomOwner.department || '',
            cell: roomOwner.cell || '',
            userRole: roomOwner.role || 'user',
            clientIP: clientIP,
          });
        } catch (msgLogError) {
          logger.warn(
            '[generate-room-name] Failed to save message (ignored):',
            msgLogError.message
          );
        }

        throw new Error(`LLM API failure: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      let generatedName = (result.response || '').trim();

      // Log on success
      try {
        const responseText = generatedName || '';
        await logExternalApiRequest({
          sourceType: 'internal',
          provider: provider,
          apiType: 'generate-room-name',
          endpoint: llmUrl,
          model: modelForRequest,
          prompt: prompt,
          promptTokenCount: prompt.length,
          responseTokenCount: responseText.length,
          responseTime: responseTime,
          statusCode: response.status,
          isStream: false,
          clientIP: clientIP,
          userAgent: userAgent,
          jwtEmail: payload.email,
          jwtUserId: payload.userId || null,
          jwtName: payload.name || null,
        });
      } catch (logError) {
        logger.warn('[generate-room-name] Logging failed (ignored):', logError.message);
      }

      // Clean room name (limit to 30 characters)
      generatedName = generatedName
        .replace(/^Room name:\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .trim()
        .substring(0, 30);

      // Use default if name is empty or too short
      if (!generatedName || generatedName.length < 2) {
        generatedName = 'New Chat';
      }

      // Update room name
      await query(
        `UPDATE chat_rooms 
         SET name = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [generatedName, roomId]
      );

      // Save to messages table for aggregation in message admin view (success)
      try {
        await saveMessageDual({
          roomId: roomId,
          userId: room.userId,
          role: 'assistant',
          text: `[Room Title Generation Success] ${generatedName}`,
          model: modelForRequest,
          email: roomOwner.email || payload.email,
          name: roomOwner.name || payload.name || '',
          department: roomOwner.department || '',
          cell: roomOwner.cell || '',
          userRole: roomOwner.role || 'user',
          clientIP: clientIP,
        });
      } catch (msgLogError) {
        logger.warn(
          '[generate-room-name] Failed to save message (ignored):',
          msgLogError.message
        );
      }

      return NextResponse.json({
        success: true,
        roomName: generatedName,
      });
    } catch (llmError) {
      logger.error('Room name generation failed:', llmError);

      // Log on error
      let modelForLog = null;
      try {
        const endpointInfo = await getNextModelServerEndpointWithIndex();
        const llmEndpoint = endpointInfo.endpoint;
        const provider = endpointInfo.provider || 'model-server';
        const llmUrl = `${llmEndpoint}/api/generate`;
        const settingsResult = await query(
          `SELECT file_parsing_model FROM settings WHERE config_type = 'general' LIMIT 1`
        );
        const model =
          settingsResult.rows.length > 0 &&
          settingsResult.rows[0].file_parsing_model
            ? settingsResult.rows[0].file_parsing_model
            : 'gemma3:4b';
        const resolvedFallbackModel = await resolveModelId(model);
        modelForLog = resolvedFallbackModel || model;

        await logExternalApiRequest({
          sourceType: 'internal',
          provider: provider,
          apiType: 'generate-room-name',
          endpoint: llmUrl,
          model: modelForLog,
          prompt: prompt,
          promptTokenCount: prompt.length,
          responseTokenCount: 0,
          responseTime: Date.now() - startTime,
          statusCode: 500,
          isStream: false,
          error: llmError.message || String(llmError),
          clientIP: clientIP,
          userAgent: userAgent,
          jwtEmail: payload.email,
          jwtUserId: payload.userId || null,
          jwtName: payload.name || null,
        });
      } catch (logError) {
        logger.warn(
          '[generate-room-name] Error logging failed (ignored):',
          logError.message
        );
      }

      // Use default name when LLM fails
      const defaultName = 'New Chat';
      await query(
        `UPDATE chat_rooms 
         SET name = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2`,
        [defaultName, roomId]
      );

      // Save to messages table for aggregation in message admin view (failure - default used)
      try {
        await saveMessageDual({
          roomId: roomId,
          userId: room.userId,
          role: 'assistant',
          text: `[Room Title Generation Failed] Set to default: ${defaultName} (error: ${
            llmError.message || 'Unknown error'
          }) (log: /admin/external-api-logs?apiType=generate-room-name&model=${encodeURIComponent(
            modelForLog || modelForRequest
          )})`,
          model: modelForLog || null,
          email: roomOwner.email || payload.email,
          name: roomOwner.name || payload.name || '',
          department: roomOwner.department || '',
          cell: roomOwner.cell || '',
          userRole: roomOwner.role || 'user',
          clientIP: clientIP,
        });
      } catch (msgLogError) {
        logger.warn(
          '[generate-room-name] Failed to save message (ignored):',
          msgLogError.message
        );
      }

      return NextResponse.json({
        success: true,
        roomName: defaultName,
        message: 'Set to default name.',
      });
    }
  } catch (error) {
    const failure = createProviderFailure(error, 'Room name generation failed');
    logger.error('Room name generation API error:', {
      correlationId: failure.correlationId,
      ...failure.log,
    });
    return NextResponse.json(
      failure.web,
      { status: 500, headers: failure.headers }
    );
  }
}
