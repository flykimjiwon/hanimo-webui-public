// Browser environment check (first at top level)
const isBrowser = typeof window !== 'undefined';

// Import winston only on server side
let winston = null;
let path = null;
let fileURLToPath = null;

if (!isBrowser) {
  // Use dynamic import to load winston only in server environment
  winston = require('winston');
  path = require('path');
  const url = require('url');
  fileURLToPath = url.fileURLToPath;
}

// Define log levels
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Get log level from environment variables
const getLogLevel = () => {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'development') {
    return process.env.LOG_LEVEL || 'debug';
  }
  return process.env.LOG_LEVEL || 'info';
};

// Create Winston logger (server-side only)
const createWinstonLogger = () => {
  if (isBrowser || !winston || !path) {
    return null;
  }

  // Replace __dirname in ES modules
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  );

  // Console output format (for development)
  const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
      let msg = `${timestamp} [${level}]: ${message}`;

      // Add metadata if present
      if (Object.keys(metadata).length > 0) {
        // Show stack trace separately if present
        if (metadata.stack) {
          msg += `\n${metadata.stack}`;
          delete metadata.stack;
        }

        // Show remaining metadata
        const remainingMetadata = { ...metadata };
        delete remainingMetadata.timestamp;
        delete remainingMetadata.level;
        delete remainingMetadata.message;

        if (Object.keys(remainingMetadata).length > 0) {
          msg += `\n${JSON.stringify(remainingMetadata, null, 2)}`;
        }
      }

      return msg;
    })
  );

  const transports = [];

  // File transport (production environment)
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.ENABLE_FILE_LOGGING === 'true'
  ) {
    // Log directory (relative to project root)
    const logDir = path.join(__dirname, '../../logs');

    // Error log
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      })
    );

    // Combined log
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        format: logFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      })
    );
  }

  // Console transport (development or explicitly enabled)
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_CONSOLE_LOGGING === 'true'
  ) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
      })
    );
  }

  // Create Winston logger instance
  const winstonLogger = winston.createLogger({
    level: getLogLevel(),
    levels: LOG_LEVELS,
    transports,
    exitOnError: false,
  });

  // Add colors
  winston.addColors(LOG_COLORS);

  return winstonLogger;
};

// Simple logger for client side
const createBrowserLogger = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return {
    error: (...args) => {
      if (isDevelopment) {
        console.error('[ERROR]', ...args);
      }
    },
    warn: (...args) => {
      if (isDevelopment) {
        console.warn('[WARN]', ...args);
      }
    },
    info: (...args) => {
      if (isDevelopment) {
        console.info('[INFO]', ...args);
      }
    },
    http: (...args) => {
      if (isDevelopment) {
        console.log('[HTTP]', ...args);
      }
    },
    debug: (...args) => {
      if (isDevelopment) {
        console.debug('[DEBUG]', ...args);
      }
    },
    log: (...args) => {
      if (isDevelopment) {
        console.log('[LOG]', ...args);
      }
    },
    getInstance: () => null,
  };
};

// Create logger instance
let winstonLogger = null;

if (!isBrowser) {
  winstonLogger = createWinstonLogger();
}

// Safe logger method wrapper (prevents calls after winston logger shutdown)
const safeLogMethod = (methodName) => {
  return (message, ...meta) => {
    if (!winstonLogger) return;
    try {
      const method = winstonLogger[methodName];
      if (method && typeof method === 'function') {
        method.call(winstonLogger, message, ...meta);
      }
    } catch (error) {
      // Ignore if logger is already ended (prevent write-after-end error)
      if (error.code !== 'ERR_STREAM_WRITE_AFTER_END') {
        // Print other error types to console
        if (typeof console !== 'undefined' && console.error) {
          console.error(`Logger ${methodName} call failed:`, error.message);
        }
      }
    }
  };
};

// Export with convenience methods
export const logger = isBrowser
  ? createBrowserLogger()
  : {
      // Base logging methods (safely wrapped)
      error: safeLogMethod('error'),
      warn: safeLogMethod('warn'),
      info: safeLogMethod('info'),
      http: safeLogMethod('http'),
      debug: safeLogMethod('debug'),

      // log method for backward compatibility (same as info)
      log: safeLogMethod('info'),

      // Direct access to Winston instance (advanced use)
      getInstance: () => winstonLogger,
    };

// Print initialization message on server side only
if (!isBrowser && winstonLogger) {
  logger.info('Logger initialized', {
    level: getLogLevel(),
    environment: process.env.NODE_ENV || 'development',
    fileLogging:
      process.env.NODE_ENV === 'production' ||
      process.env.ENABLE_FILE_LOGGING === 'true',
    consoleLogging:
      process.env.NODE_ENV !== 'production' ||
      process.env.ENABLE_CONSOLE_LOGGING === 'true',
  });
}

// Clean up log streams on process shutdown (server side only)
if (!isBrowser && winstonLogger) {
  let isShuttingDown = false;
  
  const gracefulShutdown = () => {
    // Ignore if already shutting down
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    
    // Log before end() by using winstonLogger directly
    try {
      winstonLogger.info('Logger shutting down...');
      // Wait until all logs are flushed when end() is called
      winstonLogger.end(() => {
        // Handle any follow-up work after shutdown completes here
      });
    } catch (error) {
      // Ignore errors if already shut down
      // Use console.error only when available
      if (typeof console !== 'undefined' && console.error) {
        console.error('Logger shutdown error:', error);
      }
    }
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

export default logger;
