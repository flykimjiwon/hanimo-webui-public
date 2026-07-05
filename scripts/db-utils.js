/**
 * Database utility functions
 * Provides database connection and helper functions
 */

// Load environment variables with dotenv (optional in Docker)
try {
  require('dotenv').config({ path: '.env.development' });
} catch (e) {
  console.info(
    '[db-utils] Failed to load .env.development, using only environment variables:',
    e.message
  );
}

const { Pool } = require('pg');

/**
 * Create PostgreSQL connection pool
 */
function createPool() {
  const connectionString = process.env.POSTGRES_URI || process.env.DATABASE_URL;

  if (!connectionString) {
    const errorMsg = [
      '❌ POSTGRES_URI or DATABASE_URL environment variable not set.',
      '',
      '💡 How to fix:',
      '  1. Docker environment: set POSTGRES_URI in docker.env',
      '  2. Local environment: set POSTGRES_URI in .env.development',
      '  3. Set environment variable directly: export POSTGRES_URI="postgresql://..."',
    ].join('\n');
    throw new Error(errorMsg);
  }

  // Validate connection string format
  if (
    !connectionString.startsWith('postgresql://') &&
    !connectionString.startsWith('postgres://')
  ) {
    throw new Error(
      '❌ Invalid connection string format. It must start with postgresql:// or postgres://.'
    );
  }

  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000, // increased timeout for long queries during schema creation (5s -> 30s)
    statement_timeout: 60000, // query execution timeout 60s
  });
}

/**
 * Wait for PostgreSQL connection
 * @param {Pool} pool - PostgreSQL connection pool
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} retryDelay - Retry delay (ms)
 */
async function waitForDatabase(pool, maxRetries = 30, retryDelay = 2000) {
  console.log('⏳ Waiting for PostgreSQL connection...');
  console.log(`   Max wait time: ${(maxRetries * retryDelay) / 1000} seconds`);

  let lastError = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();

      // Run connection test query
      const result = await client.query(
        'SELECT NOW() as current_time, version() as version'
      );
      const pgVersion = result.rows[0].version.split(' ')[1];

      client.release();

      console.log('✅ PostgreSQL connection successful');
      console.log(`   PostgreSQL version: ${pgVersion}`);
      console.log(`   Connection attempts: ${i + 1}`);
      return true;
    } catch (error) {
      lastError = error;
      const remaining = maxRetries - i - 1;

      if (remaining > 0) {
        console.log(
          `⏳ Waiting for PostgreSQL connection... (${
            i + 1
          }/${maxRetries}) - ${remaining} attempts left`
        );

        // Message by error type
        if (error.code === 'ECONNREFUSED') {
          console.log('   ℹ️  PostgreSQL server has not started yet.');
        } else if (error.code === 'ENOTFOUND') {
          console.log('   ℹ️  Host not found. Checking DNS...');
        } else if (error.code === '3D000') {
          console.log('   ℹ️  Database does not exist.');
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Final failure
  const errorMsg = [
    '❌ PostgreSQL connection failed (max retries exceeded)',
    '',
    `Last error: ${lastError.message}`,
    `Error code: ${lastError.code || 'N/A'}`,
    '',
    '💡 Checklist:',
    '  1. Verify PostgreSQL server is running',
    '  2. Verify connection info is correct (host, port, database name)',
    '  3. Verify firewall settings',
    '  4. Check PostgreSQL logs',
  ].join('\n');

  throw new Error(errorMsg);
}

/**
 * Check whether a table exists
 * @param {PoolClient} client - PostgreSQL client
 * @param {string} tableName - Table name
 */
async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  return result.rows[0].exists;
}

/**
 * Check whether a user exists
 * @param {PoolClient} client - PostgreSQL client
 * @param {string} email - User email
 */
async function userExists(client, email) {
  const result = await client.query(
    'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)',
    [email]
  );
  return result.rows[0].exists;
}

/**
 * Check whether settings exist
 * @param {PoolClient} client - PostgreSQL client
 * @param {string} configType - Settings type
 */
async function settingsExist(client, tableName, configType = 'general') {
  const result = await client.query(
    `SELECT EXISTS(SELECT 1 FROM ${tableName} WHERE config_type = $1)`,
    [configType]
  );
  return result.rows[0].exists;
}

/**
 * Mask connection string (hide password)
 * @param {string} connectionString - PostgreSQL connection string
 */
function maskConnectionString(connectionString) {
  return connectionString.replace(/:[^:@]+@/, ':****@');
}

module.exports = {
  createPool,
  waitForDatabase,
  tableExists,
  userExists,
  settingsExist,
  maskConnectionString,
};
