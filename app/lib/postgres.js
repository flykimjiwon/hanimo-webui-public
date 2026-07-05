import logger from '@/lib/logger';
import pg from 'pg';
const { Pool } = pg;

// PostgreSQL connection pool (singleton)
let pool = null;
const DEFAULT_TIMEZONE = 'UTC';

function getSessionTimezone() {
  const configuredTimezone = (process.env.TZ || DEFAULT_TIMEZONE).trim();

  if (!configuredTimezone) {
    return DEFAULT_TIMEZONE;
  }

  // Allow only timezone-safe characters (e.g. UTC, Asia/Seoul, Etc/GMT+9)
  if (!/^[A-Za-z0-9_+\-/]+$/.test(configuredTimezone)) {
    logger.warn(
      `⚠️ Invalid TZ value "${configuredTimezone}". Falling back to ${DEFAULT_TIMEZONE}.`
    );
    return DEFAULT_TIMEZONE;
  }

  return configuredTimezone;
}

async function setClientTimezone(client) {
  const timezone = getSessionTimezone();
  await client.query("SELECT set_config('TimeZone', $1, false)", [timezone]);
}

/**
 * Check if currently in build phase
 */
function isBuildTime() {
  // 1. Explicit environment variable check
  if (process.env.SKIP_DB_CONNECTION === 'true') {
    return true;
  }

  // 2. Next.js build phase check
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return true;
  }

  // 3. Check if Next.js is building (whether process.argv contains 'build')
  if (
    typeof process !== 'undefined' &&
    process.argv &&
    (process.argv.some(
      (arg) => arg.includes('next') && arg.includes('build')
    ) ||
      process.argv.some((arg) => arg === 'build'))
  ) {
    return true;
  }

  // 4. Check if build directory is being created (.next directory creation in progress)
  // This method is unreliable, so it is commented out
  // try {
  //   if (typeof require !== 'undefined') {
  //     const fs = require('fs');
  //     const path = require('path');
  //     const nextDir = path.join(process.cwd(), '.next');
  //     if (fs.existsSync(nextDir)) {
  //       const buildManifest = path.join(nextDir, 'build-manifest.json');
  //       if (!fs.existsSync(buildManifest)) {
  //         return true; // Building
  //       }
  //     }
  //   }
  // } catch (e) {
  //   // Ignore if filesystem access is unavailable
  // }

  return false;
}

/**
 * Get PostgreSQL connection pool
 */
export function getPostgresPool() {
  // Do not attempt database connection during build phase
  if (isBuildTime()) {
    if (process.env.SKIP_DB_CONNECTION !== 'true') {
      // Only print warning if SKIP_DB_CONNECTION is not explicitly set
      // (prevent duplicate warnings if already set)
      logger.warn('⚠️ Skipping PostgreSQL connection during build phase.');
    }
    return null;
  }

  if (!pool) {
    const connectionString =
      process.env.POSTGRES_URI || process.env.DATABASE_URL;

    if (!connectionString) {
      const errorMsg =
        '❌ error POSTGRES_URI or DATABASE_URL is not defined in environment variables.\n' +
        '   Add the following to your .env.local file:\n' +
        '   POSTGRES_URI=postgresql://username:password@host:port/database\n' +
        '   or\n' +
        '   DATABASE_URL=postgresql://username:password@host:port/database';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Use connection string directly (same approach as create-postgres-schema.js)
    // If no password is provided, PostgreSQL must be configured to use trust authentication
    // If SCRAM authentication is required, a password is needed
    pool = new Pool({
      connectionString,
      max: 20, // Maximum connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased connection timeout (2s -> 10s)
    });

    // Set timezone after connection
    pool.on('connect', async (client) => {
      try {
        await setClientTimezone(client);
      } catch (error) {
        logger.warn('⚠️ PostgreSQL timezone setting failed:', error.message);
      }
    });

    // Handle connection errors
    pool.on('error', (err) => {
      logger.error('❌ error PostgreSQL connection pool error:', err.message);
      logger.error('   Error code:', err.code);
      logger.error('   Error details:', err);

      // Provide clearer message for SCRAM authentication errors
      if (err.message && err.message.includes('SCRAM-SERVER-FIRST-MESSAGE')) {
        logger.error(
          '💡 A password is required if PostgreSQL requires SCRAM authentication.'
        );
        logger.error('   Solution:');
        logger.error(
          "   1. Set password for PostgreSQL user: ALTER USER username WITH PASSWORD 'password';"
        );
        logger.error('   2. Add password to POSTGRES_URI in .env.local file:');
        logger.error(
          '      POSTGRES_URI=postgresql://username:password@host:port/database'
        );
      }

      // Connection refused error
      if (err.code === 'ECONNREFUSED') {
        logger.error('💡 Cannot connect to PostgreSQL server.');
        logger.error('   Checklist:');
        logger.error('   1. Verify PostgreSQL is running');
        logger.error('   2. Verify the host and port in the connection string are correct');
        logger.error('   3. Check firewall settings');
      }

      // Host not found error
      if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
        logger.error('💡 PostgreSQL host not found.');
        logger.error('   Checklist:');
        logger.error('   1. Verify the hostname is correct');
        logger.error(
          '   2. If using Docker, verify the container name is correct'
        );
      }
    });

    logger.info('✅ PostgreSQL connection pool created successfully');
    logger.info(
      `   Connection string: ${connectionString.replace(/:[^:@]+@/, ':****@')}`
    );
  }

  return pool;
}

/**
 * PostgreSQL connection (for query execution)
 */
export async function getPostgresClient() {
  // Do not connect client during build phase
  if (isBuildTime()) {
    return null;
  }

  const pool = getPostgresPool();

  if (!pool) {
    logger.warn(
      '⚠️ No PostgreSQL connection pool available. Cannot create client.'
    );
    return null;
  }

  try {
    const client = await pool.connect();
    // Set timezone after connection (explicitly set since pool.on('connect') may not apply to all connections)
    try {
      await setClientTimezone(client);
    } catch (error) {
      logger.warn('⚠️ PostgreSQL timezone setting failed:', error.message);
    }
    return client;
  } catch (error) {
    logger.error('❌ error PostgreSQL client connection failed:', error.message);
    logger.error('   Error code:', error.code);
    throw error;
  }
}

/**
 * Query execution helper function
 */
export async function query(text, params) {
  // Do not execute queries during build phase
  if (isBuildTime()) {
    return { rows: [], rowCount: 0 };
  }

  const pool = getPostgresPool();

  if (!pool) {
    logger.warn(
      '⚠️ No PostgreSQL connection pool available. Cannot execute query.'
    );
    return { rows: [], rowCount: 0 };
  }

  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Query logging disabled (uncomment if needed)
    // if (process.env.NODE_ENV === 'development') {
    //   logger.info('📊 Executed query:', { text, duration, rows: res.rowCount });
    // }
    return res;
  } catch (error) {
    logger.error('❌ error Query execution error:', {
      text: text.substring(0, 100),
      error: error.message,
      code: error.code,
    });

    // Provide additional info for connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error('💡 A PostgreSQL connection issue occurred.');
      logger.error(
        '   Please check the connection string:',
        (process.env.POSTGRES_URI || process.env.DATABASE_URL || '').replace(
          /:[^:@]+@/,
          ':****@'
        )
      );
    }

    throw error;
  }
}

/**
 * Transaction execution helper function
 */
export async function transaction(callback) {
  // Do not execute transactions during build phase
  if (isBuildTime()) {
    return null;
  }

  const client = await getPostgresClient();

  if (!client) {
    logger.warn(
      '⚠️ No PostgreSQL client available. Cannot execute transaction.'
    );
    return null;
  }

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close connection
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('🔌 PostgreSQL connection pool closed');
  }
}
