import { query } from './postgres';
import { logger } from './logger';

/**
 * Logs external API (/api/generate, /api/chat) requests to a separate table.
 * Tracks usage of external tools (VSCode Continue, etc.) separately from existing qaLogs.
 * @param {object} logData - Data object to record
 */
export async function logExternalApiRequest(logData) {
  // Handle all errors internally so logging failures never affect the main API
  try {
    // Collect requester identification info (enhanced version)
    const identificationData = {
      // === Basic network info ===
      clientIP: logData.clientIP || 'unknown',
      userAgent: logData.userAgent || 'unknown',

      // === Proxy/load balancer info ===
      xForwardedFor: logData.xForwardedFor || null,
      xRealIP: logData.xRealIP || null,
      xForwardedProto: logData.xForwardedProto || null,
      xForwardedHost: logData.xForwardedHost || null,

      // === Client environment info ===
      clientTool: parseClientTool(logData.userAgent || '', logData.xClientName),
      clientToolVersion: extractToolVersion(logData.userAgent || ''),
      operatingSystem: extractOperatingSystem(logData.userAgent || ''),
      architecture: extractArchitecture(logData.userAgent || ''),

      // === Browser/IDE detailed info ===
      acceptLanguage: logData.acceptLanguage || null,
      acceptEncoding: logData.acceptEncoding || null,
      acceptCharset: logData.acceptCharset || null,
      referer: logData.referer || null,
      origin: logData.origin || null,

      // === Security headers ===
      authorization: logData.authorization || null,
      contentType: logData.contentType || null,

      // === Custom headers (for dev tool identification) ===
      xRequestedWith: logData.xRequestedWith || null,
      xClientName: logData.xClientName || null,
      xClientVersion: logData.xClientVersion || null,
      xUserName: logData.xUserName || null,
      xWorkspace: logData.xWorkspace || null,

      // === User info (extracted from API token) ===
      // Normalization: removed userEmail, userName, userRole, userDepartment, userCell (queried via JOIN from users table)
      userId: logData.jwtUserId || logData.userId || logData.xUserId || null,
      tokenHash: logData.tokenHash || null,
      tokenName: logData.tokenName || null,

      // === Timing info ===
      requestTime: new Date().toISOString(),
      timezone: logData.timezone || null,

      // === Identifiers ===
      sessionHash: generateSessionHash(logData.clientIP, logData.userAgent),
      fingerprintHash: generateFingerprintHash(logData),
      userIdentifier: generateUserIdentifier(logData),
    };

    // Generate conversationId (sessionHash, userIdentifier, tokenHash pre-computed)
    // Normalization: removed userEmail, using userId
    identificationData.conversationId = generateConversationId(
      logData.roomId,
      logData.messages,
      identificationData.sessionHash,
      identificationData.userIdentifier,
      identificationData.tokenHash,
      identificationData.userId // Use userId to group same user sessions in webapp chat
    );
    identificationData.roomId = logData.roomId || null; // Store roomId

    // Store full prompt/message data in a separate table
    let promptId = null;
    if (logData.prompt || logData.messages) {
      try {
        // Store full prompt/message data (no length limit)
        const promptResult = await query(
          `INSERT INTO external_api_prompts (prompt, messages)
           VALUES ($1, $2)
           RETURNING id`,
          [
            logData.prompt || null,
            logData.messages ? JSON.stringify(logData.messages) : null,
          ]
        );
        promptId = promptResult.rows[0]?.id || null;
      } catch (promptError) {
        logger.error('[External API Logger] Prompt save failed (ignored)', {
          error: promptError.message,
        });
        // Continue logging even if prompt save fails
      }
    }

    // Process request content (abbreviated version for preview)
    const resolvedSource =
      logData.sourceType === 'internal'
        ? 'internal'
        : logData.sourceType === 'external'
        ? 'external'
        : logData.tokenHash
        ? 'external'
        : 'internal';

    const processedData = {
      // API info
      apiType: logData.apiType, // 'generate' | 'chat'
      endpoint: logData.endpoint,
      model: logData.model, // Actual model name
      provider: logData.provider || null,

      // Request content (abbreviated for preview)
      prompt: truncateText(logData.prompt, 2000), // Max 2000 chars
      messages: logData.messages
        ? logData.messages.map((msg) => ({
            role: msg.role,
            content: truncateText(
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content),
              1000
            ), // Max 1000 chars per message
          }))
        : null,

      // Response info (token count only)
      responseTokenCount: logData.responseTokenCount || 0,
      promptTokenCount: logData.promptTokenCount || 0,
      totalTokenCount:
        (logData.promptTokenCount || 0) + (logData.responseTokenCount || 0),

      // Performance info
      responseTime: logData.responseTime || logData.finalResponseTime || 0,
      firstResponseTime:
        logData.firstResponseTime ??
        logData.responseTime ??
        logData.finalResponseTime ??
        0,
      finalResponseTime:
        logData.finalResponseTime ??
        logData.responseTime ??
        logData.firstResponseTime ??
        0,
      statusCode: logData.statusCode || 0,
      isStream: logData.isStream || false,

      // Error info
      error: logData.error || null,

      // Retry info
      retryCount: logData.retryCount !== undefined ? logData.retryCount : 1, // Default: succeeded on first attempt

      // Full HTTP info
      requestHeaders: logData.requestHeaders || null,
      requestBody: logData.requestBody || null,
      responseHeaders: logData.responseHeaders || null,
      responseBody: logData.responseBody || null,

      // Identification info
      ...identificationData,

      // Metadata
      timestamp: new Date(),
      source: resolvedSource,
    };

    // Check if conversation_id and room_id columns exist
    let hasConversationIdColumn = false;
    let hasRoomIdColumn = false;
    let hasFirstResponseTimeColumn = false;
    let hasFinalResponseTimeColumn = false;
    try {
      const columnCheck = await query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'external_api_logs' 
         AND column_name IN ('conversation_id', 'room_id', 'first_response_time', 'final_response_time')`
      );
      hasConversationIdColumn = columnCheck.rows.some(row => row.column_name === 'conversation_id');
      hasRoomIdColumn = columnCheck.rows.some(row => row.column_name === 'room_id');
      hasFirstResponseTimeColumn = columnCheck.rows.some(
        (row) => row.column_name === 'first_response_time'
      );
      hasFinalResponseTimeColumn = columnCheck.rows.some(
        (row) => row.column_name === 'final_response_time'
      );
    } catch (error) {
      // Proceed without conversation_id if column check fails
      logger.warn('[External API Logger] Column check failed', {
        error: error.message,
      });
    }

    // Record log to PostgreSQL
    const columns = [
      'api_type',
      'endpoint',
      'model',
      'provider',
      'prompt_id',
      'prompt',
      'messages',
      'response_token_count',
      'prompt_token_count',
      'total_token_count',
      'response_time',
      'status_code',
      'is_stream',
      'error',
      'retry_count',
      'client_ip',
      'user_agent',
      'x_forwarded_for',
      'x_real_ip',
      'x_forwarded_proto',
      'x_forwarded_host',
      'client_tool',
      'client_tool_version',
      'operating_system',
      'architecture',
      'accept_language',
      'accept_encoding',
      'accept_charset',
      'referer',
      'origin',
      '"authorization"',
      'content_type',
      'x_requested_with',
      'x_client_name',
      'x_client_version',
      'x_user_name',
      'x_workspace',
      'user_id',
      'token_hash',
      'token_name',
      'request_time',
      'timezone',
      'session_hash',
      'fingerprint_hash',
      'user_identifier',
    ];

    const values = [
      processedData.apiType,
      processedData.endpoint,
      processedData.model,
      processedData.provider,
      promptId,
      processedData.prompt,
      processedData.messages ? JSON.stringify(processedData.messages) : null,
      processedData.responseTokenCount,
      processedData.promptTokenCount,
      processedData.totalTokenCount,
      processedData.responseTime,
      processedData.statusCode,
      processedData.isStream,
      processedData.error,
      processedData.retryCount,
      identificationData.clientIP,
      identificationData.userAgent,
      identificationData.xForwardedFor,
      identificationData.xRealIP,
      identificationData.xForwardedProto,
      identificationData.xForwardedHost,
      identificationData.clientTool,
      identificationData.clientToolVersion,
      identificationData.operatingSystem,
      identificationData.architecture,
      identificationData.acceptLanguage,
      identificationData.acceptEncoding,
      identificationData.acceptCharset,
      identificationData.referer,
      identificationData.origin,
      identificationData.authorization,
      identificationData.contentType,
      identificationData.xRequestedWith,
      identificationData.xClientName,
      identificationData.xClientVersion,
      identificationData.xUserName,
      identificationData.xWorkspace,
      identificationData.userId,
      identificationData.tokenHash,
      identificationData.tokenName,
      identificationData.requestTime,
      identificationData.timezone,
      identificationData.sessionHash,
      identificationData.fingerprintHash,
      identificationData.userIdentifier,
    ];

    if (hasFirstResponseTimeColumn) {
      columns.push('first_response_time');
      values.push(processedData.firstResponseTime);
    }

    if (hasFinalResponseTimeColumn) {
      columns.push('final_response_time');
      values.push(processedData.finalResponseTime);
    }

    if (hasConversationIdColumn) {
      columns.push('conversation_id');
      values.push(identificationData.conversationId);
    }

    if (hasRoomIdColumn) {
      columns.push('room_id');
      values.push(identificationData.roomId);
    }

    columns.push('timestamp', 'source', 'request_headers', 'request_body', 'response_headers', 'response_body');
    values.push(
      processedData.timestamp,
      processedData.source,
      processedData.requestHeaders
        ? JSON.stringify(processedData.requestHeaders)
        : null,
      processedData.requestBody ? JSON.stringify(processedData.requestBody) : null,
      processedData.responseHeaders
        ? JSON.stringify(processedData.responseHeaders)
        : null,
      processedData.responseBody ? JSON.stringify(processedData.responseBody) : null
    );

    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
    await query(
      `INSERT INTO external_api_logs (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    // Success log (brief)
    logger.info('[External API Logger] Logging complete', {
      apiType: logData.apiType,
      model: logData.model,
      statusCode: logData.statusCode,
    });
  } catch (error) {
    // Handle logging failures silently - never affect the main API
    logger.error('[External API Logger] Logging failed (ignored)', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Extract tool version
 */
function extractToolVersion(userAgent) {
  const ua = userAgent.toLowerCase();

  // Continue version
  const continueMatch = ua.match(/continue[\/\s](\d+\.\d+\.\d+)/);
  if (continueMatch) return `Continue ${continueMatch[1]}`;

  // VSCode version
  const vscodeMatch = ua.match(/vscode[\/\s](\d+\.\d+\.\d+)/);
  if (vscodeMatch) return `VSCode ${vscodeMatch[1]}`;

  // Cursor version
  const cursorMatch = ua.match(/cursor[\/\s](\d+\.\d+\.\d+)/);
  if (cursorMatch) return `Cursor ${cursorMatch[1]}`;

  return 'Unknown Version';
}

/**
 * Extract operating system
 */
function extractOperatingSystem(userAgent) {
  const ua = userAgent.toLowerCase();

  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('ubuntu')) return 'Ubuntu';
  if (ua.includes('centos')) return 'CentOS';
  if (ua.includes('fedora')) return 'Fedora';
  if (ua.includes('darwin')) return 'macOS';

  return 'Unknown OS';
}

/**
 * Extract architecture
 */
function extractArchitecture(userAgent) {
  const ua = userAgent.toLowerCase();

  if (ua.includes('x64') || ua.includes('x86_64') || ua.includes('amd64'))
    return 'x64';
  if (ua.includes('arm64') || ua.includes('aarch64')) return 'ARM64';
  if (ua.includes('x86') || ua.includes('i386') || ua.includes('i686'))
    return 'x86';
  if (ua.includes('arm')) return 'ARM';

  return 'Unknown Arch';
}

/**
 * Generate advanced fingerprint hash (more precise user identification)
 */
function generateFingerprintHash(logData) {
  const crypto = require('crypto');

  const fingerprintData = [
    logData.clientIP || '',
    logData.userAgent || '',
    logData.acceptLanguage || '',
    logData.acceptEncoding || '',
    logData.xForwardedFor || '',
    logData.xClientName || '',
    logData.xUserName || '',
    logData.xWorkspace || '',
  ].join('|');

  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Generate user identifier (more stable tracking)
 */
function generateUserIdentifier(logData) {
  const crypto = require('crypto');

  // Combine the most stable identification factors
  const stableData = [
    logData.clientIP?.split('.').slice(0, 3).join('.') || '', // Exclude last IP octet
    extractOperatingSystem(logData.userAgent || ''),
    extractToolVersion(logData.userAgent || ''),
    logData.acceptLanguage?.split(',')[0] || '', // Primary language only
    logData.xUserName || '',
    logData.xWorkspace || '',
  ]
    .filter(Boolean)
    .join('_');

  if (!stableData) return 'anonymous';

  return crypto
    .createHash('sha256')
    .update(stableData)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Identify client tool from User-Agent
 */
function parseClientTool(userAgent, clientName) {
  const ua = (userAgent || '').toLowerCase();
  const name = (clientName || '').toLowerCase();

  if (name) {
    if (name.includes('continue') || name.includes('vscode')) {
      return 'VSCode Continue';
    } else if (name.includes('cursor')) {
      return 'Cursor';
    } else if (name.includes('copilot')) {
      return 'GitHub Copilot';
    } else if (name.includes('jetbrains')) {
      return 'JetBrains IDE';
    }
  }

  if (ua.includes('vscode') || ua.includes('continue')) {
    return 'VSCode Continue';
  } else if (ua.includes('cursor')) {
    return 'Cursor';
  } else if (ua.includes('copilot')) {
    return 'GitHub Copilot';
  } else if (ua.includes('jetbrains')) {
    return 'JetBrains IDE';
  } else if (ua.includes('sublime')) {
    return 'Sublime Text';
  } else if (ua.includes('atom')) {
    return 'Atom';
  } else if (ua.includes('vim') || ua.includes('neovim')) {
    return 'Vim/Neovim';
  } else if (ua.includes('emacs')) {
    return 'Emacs';
  } else if (ua.includes('postman')) {
    return 'Postman';
  } else if (ua.includes('insomnia')) {
    return 'Insomnia';
  } else if (ua.includes('curl')) {
    return 'cURL';
  } else if (ua.includes('wget')) {
    return 'wget';
  } else if (ua.includes('python')) {
    return 'Python Script';
  } else if (ua.includes('node')) {
    return 'Node.js Script';
  } else if (ua.includes('chrome')) {
    return 'Chrome Browser';
  } else if (ua.includes('firefox')) {
    return 'Firefox Browser';
  } else if (ua.includes('safari')) {
    return 'Safari Browser';
  }

  return 'Unknown';
}

/**
 * Generate hash for session identification
 */
function generateSessionHash(ip, userAgent) {
  const crypto = require('crypto');
  const data = `${ip || 'unknown'}_${userAgent || 'unknown'}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 12);
}

/**
 * Generate conversationId for conversation session identification
 * If roomId exists, generate based on roomId so all requests in the same chat room share the same ID
 * If roomId is absent, combine sessionHash, userIdentifier, tokenHash, and userEmail
 * Requests from the same user, same session, and same API token share the same conversationId
 * For webapp chat, include userEmail for more stable grouping
 */
function generateConversationId(roomId, messages, sessionHash, userIdentifier, tokenHash, userEmail) {
  const crypto = require('crypto');

  // If roomId exists, generate conversationId based on roomId (all conversations in the same chat room share the same ID)
  if (roomId) {
    return crypto
      .createHash('sha256')
      .update(String(roomId))
      .digest('hex')
      .substring(0, 16);
  }

  // If roomId is absent, combine userEmail + sessionHash + tokenHash
  // Requests from the same user, same session, and same API token share the same conversationId
  // Does not depend on first message content, so continued conversations also share the same ID
  const parts = [];
  
  // Add userEmail (groups conversations by the same user in webapp chat, most stable)
  if (userEmail) {
    parts.push(userEmail);
  }
  
  // Add sessionHash (group by same session)
  if (sessionHash) {
    parts.push(sessionHash);
  }
  
  // Add tokenHash (group by same API token user)
  if (tokenHash) {
    parts.push(tokenHash);
  }

  if (parts.length > 0) {
    const sessionData = parts.join('_');
    return crypto
      .createHash('sha256')
      .update(sessionData)
      .digest('hex')
      .substring(0, 16);
  }

  // If userEmail, sessionHash, and tokenHash are all absent, use userIdentifier (fallback)
  if (userIdentifier) {
    return crypto
      .createHash('sha256')
      .update(String(userIdentifier))
      .digest('hex')
      .substring(0, 16);
  }

  // If all are absent, fall back to first user message (final fallback)
  // This case rarely occurs, but kept as a safety net
  if (messages && Array.isArray(messages)) {
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        const content = messages[i].content;
        if (content) {
          const contentStr = typeof content === 'string'
            ? content
            : JSON.stringify(content);
          return crypto
            .createHash('sha256')
            .update(contentStr)
            .digest('hex')
            .substring(0, 16);
        }
      }
    }
  }

  return null;
}

/**
 * Truncate text to length limit
 */
function truncateText(text, maxLength) {
  if (!text) return null;
  if (typeof text !== 'string') return String(text);

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + '... [truncated]';
}

/**
 * Retrieve external API usage statistics
 */
export async function getExternalApiStats(timeRange = '7d') {
  try {
    // Calculate time range
    const now = new Date();
    let startDate;

    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Basic statistics
    const totalRequestsResult = await query(
      `SELECT COUNT(*) as count FROM external_api_logs WHERE timestamp >= $1`,
      [startDate]
    );
    const totalRequests = parseInt(totalRequestsResult.rows[0].count);

    // Statistics by API type
    const apiTypeStatsResult = await query(
      `SELECT api_type as _id, COUNT(*) as count, SUM(total_token_count) as total_tokens
       FROM external_api_logs
       WHERE timestamp >= $1
       GROUP BY api_type`,
      [startDate]
    );
    const apiTypeStats = apiTypeStatsResult.rows.map((row) => ({
      _id: row._id,
      count: parseInt(row.count),
      totalTokens: parseInt(row.total_tokens || 0),
    }));

    // Statistics by client tool
    const clientToolStatsResult = await query(
      `SELECT client_tool as _id, COUNT(*) as count, SUM(total_token_count) as total_tokens
       FROM external_api_logs
       WHERE timestamp >= $1
       GROUP BY client_tool
       ORDER BY count DESC`,
      [startDate]
    );
    const clientToolStats = clientToolStatsResult.rows.map((row) => ({
      _id: row._id,
      count: parseInt(row.count),
      totalTokens: parseInt(row.total_tokens || 0),
    }));

    // Statistics by model
    const modelStatsResult = await query(
      `SELECT model as _id, COUNT(*) as count, SUM(total_token_count) as total_tokens
       FROM external_api_logs
       WHERE timestamp >= $1
       GROUP BY model
       ORDER BY count DESC`,
      [startDate]
    );
    const modelStats = modelStatsResult.rows.map((row) => ({
      _id: row._id,
      count: parseInt(row.count),
      totalTokens: parseInt(row.total_tokens || 0),
    }));

    return {
      totalRequests,
      timeRange,
      byApiType: apiTypeStats,
      byClientTool: clientToolStats,
      byModel: modelStats,
      startDate,
      endDate: now,
    };
  } catch (error) {
    logger.error('[External API Stats] Failed to retrieve statistics', {
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
}
