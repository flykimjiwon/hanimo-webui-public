import logger from '@/lib/logger';
/**
 * Client error logging utility
 *
 * Sends error logs visible in the admin dashboard.
 * Available in the "Error Logs" section at the bottom of /admin/models
 */

let isLoggerReady = false;
const pendingLogs = [];

// Initialize logger (send queued logs when token is ready)
export function initializeLogger() {
  if (isLoggerReady) return;

  const token = localStorage.getItem('token');
  if (token) {
    isLoggerReady = true;

    // Send queued logs
    while (pendingLogs.length > 0) {
      const log = pendingLogs.shift();
      sendLogImmediately(log);
    }
  }
}

// Send logs immediately (internal function)
async function sendLogImmediately(payload) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    await fetch('/api/logs/client-error', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // On logging failure, write to console only (prevent infinite loop)
    if (typeof console !== 'undefined' && console.warn) {
      logger.warn('[ClientErrorLogger] Failed to send log:', error.message);
    }
  }
}

/**
 * Send admin log
 * @param {Object} options
 * @param {string} options.level - Log level (error, warn, info)
 * @param {string} options.message - Error message
 * @param {string} [options.stack] - Stack trace
 * @param {Object} [options.context] - Additional context information
 * @param {boolean} [options.silent] - If true, do not print to console
 */
export async function logToAdmin({
  level = 'error',
  message,
  stack = null,
  context = null,
  silent = false,
} = {}) {
  if (!message) return;

  // Console output (only when silent is false)
  if (!silent && typeof console !== 'undefined') {
    const consoleMethod = console[level] || console.log;
    consoleMethod(`[AdminLog] ${message}`, context || '');
  }

  const payload = {
    level,
    message,
    stack,
    context: {
      ...(context || {}),
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: new Date().toISOString(),
    },
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  // If token is not ready, store in queue
  if (!isLoggerReady) {
    const token = localStorage.getItem('token');
    if (!token) {
      pendingLogs.push(payload);
      return;
    }
    isLoggerReady = true;
  }

  // Send immediately
  await sendLogImmediately(payload);
}

/**
 * Send error-level log (shortcut function)
 */
export function logError(message, context = null, silent = false) {
  return logToAdmin({ level: 'error', message, context, silent });
}

/**
 * Send warn-level log (shortcut function)
 */
export function logWarn(message, context = null, silent = false) {
  return logToAdmin({ level: 'warn', message, context, silent });
}

/**
 * Send info-level log (shortcut function)
 */
export function logInfo(message, context = null, silent = true) {
  return logToAdmin({ level: 'info', message, context, silent });
}

/**
 * Send an error object to admin logs
 */
export function logErrorObject(error, additionalContext = null) {
  if (!error) return;

  const message = error.message || String(error);
  const stack = error.stack || null;
  const context = {
    ...(additionalContext || {}),
    errorName: error.name || 'Error',
    errorCode: error.code || null,
  };

  return logToAdmin({
    level: 'error',
    message,
    stack,
    context,
  });
}

// Auto-initialize only in browser environment
if (typeof window !== 'undefined') {
  // Auto-initialize after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLogger);
  } else {
    initializeLogger();
  }

  // Listen for storage events (when logged in from another tab)
  window.addEventListener('storage', (e) => {
    if (e.key === 'token' && e.newValue) {
      initializeLogger();
    }
  });
}
