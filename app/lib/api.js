import logger from '@/lib/logger';
/**
 * Fetches available directly connected model-server model list.
 * @param {object} headers - Headers to use for API request.
 * @returns {Promise<object>} Model configuration data.
 */
export async function fetchDirectModels(headers) {
  try {
    const response = await fetch('/api/models', { headers });
    if (!response.ok) {
      throw new Error(`Failed to load direct models: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('fetchDirectModels API call failed:', error);
    throw error;
  }
}

/**
 * Sends a chat message and receives a streaming response.
 * @param {string} apiEndpoint - '/api/webapp-generate'
 * @param {object} payload - Data to send to the API
 * @param {AbortSignal} signal - AbortSignal for request cancellation
 * @returns {Promise<Response>} fetch response object
 */
export async function sendChatMessage(apiEndpoint, payload, signal, extraHeaders = {}) {
  try {
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: signal,
    });

    if (!response.ok) {
      // Read response body as text first (for JSON parsing fallback)
      let responseText = '';
      let errorData = {};
      try {
        responseText = await response.text();
        if (responseText) {
          try {
            errorData = JSON.parse(responseText);
          } catch (error) {
            logger.warn('[Catch] Error occurred:', error.message);
            // If not JSON, use raw text as is
            errorData = { error: responseText };
          }
        }
      } catch (e) {
        logger.warn('Failed to read response body:', e);
      }

      // Include response info in error log
      const timestamp = new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
      });
      const isQuotaError =
        response.status === 429 &&
        (errorData?.error?.code === 'insufficient_quota' ||
          (errorData?.error?.message || responseText || '')
            .toLowerCase()
            .includes('exceeded your current quota'));
      const isNotFoundError = response.status === 404;
      const logFn = isQuotaError || isNotFoundError ? console.warn : console.error;
      logFn(
        `ERROR ${timestamp} ${response.status} ${response.statusText} POST ${apiEndpoint}`,
        {
          url: apiEndpoint,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          response: responseText || errorData,
          request: {
            model: payload?.model,
            method: 'POST',
          },
        }
      );

      // Build error message
      let errorMessage =
        errorData.error ||
        `Model call failed. (HTTP ${response.status})`;

      // Model name normalization function
      const normalizeModelInMessage = (
        message,
        originalModel,
        normalizedModel
      ) => {
        if (!message || !originalModel || !normalizedModel) return message;

        let normalized = message;

        // 1. Directly replace original model name
        if (normalized.includes(originalModel)) {
          normalized = normalized.replace(
            new RegExp(
              originalModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'g'
            ),
            normalizedModel
          );
        }

        // 2. Also replace cases with "models/" prefix
        const modelWithPrefix = `models/${normalizedModel}`;
        if (normalized.includes(modelWithPrefix)) {
          normalized = normalized.replace(
            new RegExp(
              modelWithPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'g'
            ),
            normalizedModel
          );
        }

        // 3. Replace quoted model-name patterns (e.g., 'models/gemini-2.0-flash')
        const quotedModelPattern = /(['"])(models\/[^'"]+)\1/gi;
        normalized = normalized.replace(
          quotedModelPattern,
          (match, quote, modelName) => {
            const normalizedName = modelName.startsWith('models/')
              ? modelName.substring(7)
              : modelName;
            return `${quote}${normalizedName}${quote}`;
          }
        );

        // 4. Handle model-name patterns used without quotes
        const unquotedModelPattern = /models\/([a-zA-Z0-9_\-:.]+)/g;
        normalized = normalized.replace(
          unquotedModelPattern,
          (match, modelName) => {
            return modelName.split(':')[0].trim();
          }
        );

        return normalized;
      };

      // Normalize error message (remove original model name)
      const originalModel = errorData.originalModel || payload?.model;
      let normalizedModel = errorData.normalizedModel;

      // If normalizedModel is missing, normalize directly from original model
      if (!normalizedModel && originalModel) {
        normalizedModel = originalModel.trim();
        if (normalizedModel.startsWith('models/')) {
          normalizedModel = normalizedModel.substring(7);
        }
        normalizedModel = normalizedModel.split(':')[0].trim();
        normalizedModel = normalizedModel.split('/').pop().trim();
      }

      if (
        originalModel &&
        normalizedModel &&
        originalModel !== normalizedModel
      ) {
        errorMessage = normalizeModelInMessage(
          errorMessage,
          originalModel,
          normalizedModel
        );
      }

      // Add detailed info if present (after normalization)
      if (errorData.details && errorData.details !== errorMessage) {
        let normalizedDetails = errorData.details;
        if (originalModel && normalizedModel) {
          normalizedDetails = normalizeModelInMessage(
            normalizedDetails,
            originalModel,
            normalizedModel
          );
        }
        errorMessage += `\n\nDetails: ${normalizedDetails}`;
      }

      // Add model information if present
      if (errorData.originalModel || errorData.normalizedModel) {
        errorMessage += `\n\nModel Info:`;
        if (errorData.originalModel) {
          errorMessage += `\n- Original model: ${errorData.originalModel}`;
        }
        if (errorData.normalizedModel) {
          errorMessage += `\n- Normalized model: ${errorData.normalizedModel}`;
        }
      }

      throw new Error(errorMessage);
    }
    return response; // Return the response object itself for streaming handling
  } catch (error) {
    const message = error?.message || '';
    const isQuotaError =
      /insufficient_quota|exceeded your current quota/i.test(message);
    const isNotFoundError = /http 404|not found/i.test(message);
    const logFn = isQuotaError || isNotFoundError ? console.warn : console.error;
    logFn('sendChatMessage API call failed:', error);
    throw error;
  }
}

/**
 * Saves a message to conversation history.
 * @param {string} roomId - Chat room ID
 * @param {object} messagePayload - Message data to save
 * @returns {Promise<object>} Save result
 */
export async function saveMessageToHistory(roomId, messagePayload) {
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`/api/webapp-chat/history/${roomId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(messagePayload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to save message (HTTP ${response.status})`
      );
    }

    return await response.json();
  } catch (error) {
    logger.error('saveMessageToHistory API call failed:', error);
    throw error;
  }
}
