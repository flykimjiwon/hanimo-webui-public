export const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.SKIP_DB_CONNECTION !== 'true') {
  throw new Error('JWT_SECRET is not defined in the environment variables. Please check your .env file.');
}

/**
 * Model server call timeout settings (milliseconds)
 * Configurable via environment variables, defaults: streaming 15min, normal 10min
 */
export const MODEL_SERVER_TIMEOUT_STREAM = parseInt(
  process.env.MODEL_SERVER_TIMEOUT_STREAM || '900000',
  10
); // Default: 15min (900s)

export const MODEL_SERVER_TIMEOUT_NORMAL = parseInt(
  process.env.MODEL_SERVER_TIMEOUT_NORMAL || '600000',
  10
); // Default: 10min (600s)

/**
 * Model server retry delay (milliseconds)
 * Configurable via environment variables, default: 1 second
 */
export const MODEL_SERVER_RETRY_DELAY = parseInt(
  process.env.MODEL_SERVER_RETRY_DELAY || '1000',
  10
); // Default: 1s
