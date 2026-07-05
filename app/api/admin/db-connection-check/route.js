import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

const KEY_TABLES = [
  'users',
  'models',
  'settings',
  'board_posts',
  'board_comments',
  'direct_messages',
];

const ENV_VARIABLES = [
  {
    key: 'NODE_ENV',
    category: 'runtime',
    usedFor: 'Next.js runtime mode',
    sensitive: false,
  },
  {
    key: 'APP_ENV',
    category: 'runtime',
    usedFor: 'deployment environment marker',
    sensitive: false,
  },
  {
    key: 'POSTGRES_URI',
    category: 'database',
    usedFor: 'primary DB connection string',
    sensitive: true,
  },
  {
    key: 'DATABASE_URL',
    category: 'database',
    usedFor: 'fallback DB connection string',
    sensitive: true,
  },
  {
    key: 'PII_DETECT_API_URL',
    category: 'integration',
    usedFor: 'PII detection API endpoint',
    sensitive: false,
  },
  {
    key: 'OLLAMA_ENDPOINTS',
    category: 'integration',
    usedFor: 'local model server endpoints',
    sensitive: false,
  },
  {
    key: 'OPENAI_COMPAT_BASE',
    category: 'integration',
    usedFor: 'OpenAI-compatible base URL',
    sensitive: false,
  },
  {
    key: 'OPENAI_COMPAT_API_KEY',
    category: 'integration',
    usedFor: 'OpenAI-compatible API key',
    sensitive: true,
  },
  {
    key: 'OPENAI_API_KEY',
    category: 'integration',
    usedFor: 'OpenAI API key',
    sensitive: true,
  },
  {
    key: 'JWT_SECRET',
    category: 'security',
    usedFor: 'JWT signing/verification',
    sensitive: true,
  },
  {
    key: 'KUBERNETES_SERVICE_HOST',
    category: 'platform',
    usedFor: 'k8s runtime detection',
    sensitive: false,
  },
  {
    key: 'SKIP_DB_CONNECTION',
    category: 'build',
    usedFor: 'build-time DB connection guard',
    sensitive: false,
  },
];

function maskConnectionString(connectionString) {
  if (!connectionString) return null;
  return connectionString.replace(/:[^:@]+@/, ':****@');
}

function parseConfiguredConnection(connectionString) {
  if (!connectionString) {
    return {
      host: null,
      port: null,
      database: null,
      user: null,
    };
  }

  try {
    const parsed = new URL(connectionString);
    const pathname = parsed.pathname || '';
    const databaseName = pathname.startsWith('/')
      ? pathname.slice(1)
      : pathname;
    return {
      host: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : null,
      database: databaseName || null,
      user: parsed.username || null,
    };
  } catch {
    const hostMatch = connectionString.match(/@([^:/?#]+)(?::(\d+))?/);
    const dbMatch = connectionString.match(/\/([^/?#]+)(?:[?#]|$)/);
    return {
      host: hostMatch?.[1] || null,
      port: hostMatch?.[2] ? Number(hostMatch[2]) : null,
      database: dbMatch?.[1] || null,
      user: null,
    };
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function truncateValue(value, maxLength = 120) {
  if (!value) return value;
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}...`
    : value;
}

function maskSecretValue(rawValue) {
  if (!rawValue) return null;
  return `[configured:${rawValue.length}]`;
}

function formatEnvValuePreview(item, rawValue) {
  if (!rawValue) return null;

  if (item.sensitive) {
    if (item.key === 'POSTGRES_URI' || item.key === 'DATABASE_URL') {
      return truncateValue(maskConnectionString(rawValue));
    }
    return maskSecretValue(rawValue);
  }

  if (
    (item.key.endsWith('_URL') || item.key.endsWith('_URI')) &&
    rawValue.includes('://')
  ) {
    return truncateValue(maskConnectionString(rawValue));
  }

  return truncateValue(rawValue);
}

function collectEnvVariablesSnapshot() {
  return ENV_VARIABLES.map((item) => {
    const rawValue = process.env[item.key] || '';
    return {
      key: item.key,
      category: item.category,
      usedFor: item.usedFor,
      isSet: rawValue.length > 0,
      valuePreview: formatEnvValuePreview(item, rawValue),
    };
  });
}

export async function GET(request) {
  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    const connectionSource = process.env.POSTGRES_URI
      ? 'POSTGRES_URI'
      : process.env.DATABASE_URL
        ? 'DATABASE_URL'
        : null;
    const rawConnectionString =
      process.env.POSTGRES_URI || process.env.DATABASE_URL || '';
    const configuredConnection = parseConfiguredConnection(rawConnectionString);
    const configuredDatabase = configuredConnection?.database || null;

    const result = await query(
      `SELECT
         current_database() AS current_database,
         current_user AS current_user,
         current_schema() AS current_schema,
         inet_server_addr()::text AS server_ip,
         inet_server_port() AS server_port,
         pg_is_in_recovery() AS is_replica,
         (SELECT oid FROM pg_database WHERE datname = current_database()) AS database_oid,
         (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS public_table_count,
         COALESCE((SELECT SUM(n_live_tup)::bigint FROM pg_stat_user_tables WHERE schemaname = 'public'), 0) AS approx_live_rows,
         version() AS server_version,
         now() AT TIME ZONE 'Asia/Seoul' AS checked_at_kst`
    );
    const tableStatsResult = await query(
      `SELECT
         relname AS table_name,
         n_live_tup::bigint AS approx_rows
       FROM pg_stat_user_tables
       WHERE schemaname = 'public' AND relname = ANY($1::text[])
       ORDER BY relname`,
      [KEY_TABLES]
    );

    const row = result.rows?.[0] || {};
    const activeDatabase = row.current_database || null;
    const keyTableApproxRows = KEY_TABLES.reduce((acc, tableName) => {
      acc[tableName] = null;
      return acc;
    }, {});

    for (const statsRow of tableStatsResult.rows || []) {
      if (statsRow?.table_name) {
        keyTableApproxRows[statsRow.table_name] = toNumberOrNull(
          statsRow.approx_rows
        );
      }
    }

    const fingerprintSeed = JSON.stringify({
      activeDatabase,
      configuredDatabase,
      serverIp: row.server_ip || null,
      serverPort: toNumberOrNull(row.server_port),
      databaseOid: toNumberOrNull(row.database_oid),
      publicTableCount: toNumberOrNull(row.public_table_count),
      approxLiveRows: toNumberOrNull(row.approx_live_rows),
      keyTableApproxRows,
    });
    const connectionFingerprint = createHash('sha256')
      .update(fingerprintSeed)
      .digest('hex')
      .slice(0, 16);

    const matchesConfiguredDatabase =
      configuredDatabase && activeDatabase
        ? configuredDatabase === activeDatabase
        : null;
    const probableRootCause = !connectionSource
      ? 'missing-connection-env'
      : matchesConfiguredDatabase === false
        ? 'configured-db-and-active-db-mismatch'
        : activeDatabase === 'modol' || activeDatabase === 'modol_dev'
          ? 'connected-to-expected-db-name'
          : 'unknown-db-name';
    const envVariables = collectEnvVariablesSnapshot();

    return NextResponse.json({
      success: true,
      env: {
        nodeEnv: process.env.NODE_ENV || null,
        appEnv: process.env.APP_ENV || null,
        variables: envVariables,
      },
      envUsage: {
        dbConnectionVariable: connectionSource,
        dbConnectionPriority: ['POSTGRES_URI', 'DATABASE_URL'],
        dbConnectionSummary:
          connectionSource === 'POSTGRES_URI'
            ? 'POSTGRES_URI takes priority and DATABASE_URL is used as fallback.'
            : connectionSource === 'DATABASE_URL'
              ? 'POSTGRES_URI is not set, so DATABASE_URL is being used.'
              : 'No DB connection environment variable found.',
      },
      connection: {
        source: connectionSource,
        configuredHost: configuredConnection?.host || null,
        configuredPort: configuredConnection?.port || null,
        configuredUser: configuredConnection?.user || null,
        configuredDatabase,
        configuredUriMasked: maskConnectionString(rawConnectionString),
        activeDatabase,
        matchesConfiguredDatabase,
      isModol: activeDatabase === 'modol',
      isModolDev: activeDatabase === 'modol_dev',
      },
      server: {
        currentUser: row.current_user || null,
        currentSchema: row.current_schema || null,
        serverIp: row.server_ip || null,
        serverPort: toNumberOrNull(row.server_port),
        isReplica: row.is_replica === true,
        databaseOid: toNumberOrNull(row.database_oid),
        publicTableCount: toNumberOrNull(row.public_table_count),
        approxLiveRows: toNumberOrNull(row.approx_live_rows),
        serverVersion: row.server_version || null,
        checkedAtKst: row.checked_at_kst || null,
      },
      stats: {
        keyTableApproxRows,
      },
      diagnostics: {
        probableRootCause,
        connectionFingerprint,
        fingerprintGuide:
          'If the fingerprint is identical on different environment pages, they are likely pointing to the same target DB/data.',
      },
    });
  } catch (error) {
    logger.error('DB connection check failed:', error);
    return createServerError(error, 'DB connection check failed.');
  }
}
