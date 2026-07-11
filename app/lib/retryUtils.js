import logger from '@/lib/logger';
/**
 * Check whether the network error is retryable
 */
function isRetryableError(error) {
  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.message?.includes('fetch failed') ||
    error.message?.includes('timeout')
  );
}

/**
 * Check whether the HTTP status code is retryable
 */
function isRetryableHttpStatus(status) {
  return status === 404 || // Not Found
    status === 502 || // Bad Gateway
    status === 503 || // Service Unavailable
    status === 504; // Gateway Timeout
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt, baseDelay = 500) {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Retry logic for model server calls
 * @param {string} url - URL to call
 * @param {object} options - fetch options
 * @param {object} config - retry settings
 * @param {number} config.maxRetries - maximum retry count (default: 2)
 * @param {boolean} config.isStreaming - whether streaming is enabled (default: false)
 * @param {number} config.streamTimeoutMs - streaming timeout (default: 900000)
 * @param {number} config.normalTimeoutMs - normal timeout (default: 600000)
 * @param {function} config.getNextEndpoint - function to get next endpoint (optional)
 * @param {object} config.providerRef - provider reference object (optional)
 * @param {function} config.buildOptions - rebuild fetch options when endpoint changes (optional)
 * @param {function} config.onRetry - callback called on retry (optional)
 * @param {string} config.endpointPath - endpoint path (e.g., '/api/chat', '/api/generate') (optional)
 * @returns {Promise<Response>} fetch response
 */
export async function fetchWithRetry(url, options, config = {}) {
  const {
    maxRetries = 2,
    isStreaming = false,
    streamTimeoutMs = 900000, // 15 minutes
    normalTimeoutMs = 600000, // 10 minutes
    getNextEndpoint = null,
    providerRef = null,
    buildOptions = null,
    onRetry = null,
    endpointPath = '', // Endpoint path (e.g., '/api/chat')
  } = config;

  let lastError;
  let lastResponse;
  let currentUrl = url;
  let currentOptions = options;
  const timeoutMs = isStreaming ? streamTimeoutMs : normalTimeoutMs;

  function optionsForEndpoint(endpointInfo) {
    if (typeof buildOptions !== 'function') {
      return currentOptions;
    }
    return buildOptions({
      endpointInfo,
      url: currentUrl,
      previousOptions: currentOptions,
    });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.info(
        `[Retry Utils] Model server call attempt ${attempt + 1}/${maxRetries + 1}`,
        {
          url: currentUrl,
           timeout: `${timeoutMs / 1000}s`,
          stream: isStreaming,
        }
      );

      // Set timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        // Call fetch
        const response = await fetch(currentUrl, {
          ...currentOptions,
          signal: controller.signal,
        });

        // Clear timeout on success
        clearTimeout(timeoutId);

        // Check HTTP response status code
        if (!response.ok) {
          const status = response.status;
          const isRetryableHttpError = isRetryableHttpStatus(status);

          if (isRetryableHttpError && attempt < maxRetries && getNextEndpoint) {
            logger.warn(
              `[Retry Utils] HTTP ${status} error, retrying with next instance`,
              { url: currentUrl, status, attempt: attempt + 1 }
            );

            lastResponse = response;

            // Switch to next endpoint
            const nextEndpointInfo = await getNextEndpoint();
            if (nextEndpointInfo && nextEndpointInfo.endpoint) {
              currentUrl = endpointPath 
                ? `${nextEndpointInfo.endpoint}${endpointPath}`
                : nextEndpointInfo.endpoint;
              currentOptions = optionsForEndpoint(nextEndpointInfo);
              if (providerRef && nextEndpointInfo.provider) {
                providerRef.value = nextEndpointInfo.provider;
              }
            }

            // Call retry callback
            if (onRetry) {
              onRetry(attempt, currentUrl, status, null, nextEndpointInfo);
            }

            // Delay before retry (exponential backoff)
            const delayMs = getBackoffDelay(attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));

            continue;
          }

          // Return response if HTTP error is not retryable
          logger.info(
            `[Retry Utils] Model server call completed (HTTP ${status}, not retryable)`
          );
          return response;
        }

        // Successful response
        logger.info(
          `[Retry Utils] Model server call succeeded (attempt ${attempt + 1})`
        );
        return response;
      } catch (fetchErr) {
        // Clear timeout when fetch fails
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } catch (error) {
      lastError = error;

      // Check whether network error is retryable
      const isRetryable = isRetryableError(error);

      // Retry if error is retryable and this is not the last attempt
      if (isRetryable && attempt < maxRetries && getNextEndpoint) {
        // Switch to next endpoint
        const nextEndpointInfo = await getNextEndpoint();
        if (nextEndpointInfo && nextEndpointInfo.endpoint) {
          const nextUrl = endpointPath
            ? `${nextEndpointInfo.endpoint}${endpointPath}`
            : nextEndpointInfo.endpoint;
          if (providerRef && nextEndpointInfo.provider) {
            providerRef.value = nextEndpointInfo.provider;
          }

          logger.warn(
            `[Retry Utils] Attempt ${attempt + 1} failed, retrying with next instance`,
            {
              currentUrl,
              nextUrl,
              error: error.message,
            }
          );

          currentUrl = nextUrl;
          currentOptions = optionsForEndpoint(nextEndpointInfo);

          // Call retry callback
          if (onRetry) {
            onRetry(attempt, currentUrl, null, error, nextEndpointInfo);
          }

          // Delay before retry (exponential backoff)
          const delayMs = getBackoffDelay(attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          continue;
        }
      }

      // Throw error if not retryable or last attempt
      throw error;
    }
  }

  // Return last response or error if all retries fail
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError;
}
