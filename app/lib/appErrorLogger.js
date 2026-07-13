import logger from '@/lib/logger';
import { getPostgresClient, query } from '@/lib/postgres';
import { withSchemaMigrationLock } from '@/lib/schema-migration-lock.mjs';

const _recentErrors = new Map();
const THROTTLE_WINDOW_MS = 60_000;

function shouldThrottle(message) {
  const key = String(message).substring(0, 200);
  const now = Date.now();
  const lastSeen = _recentErrors.get(key);
  if (lastSeen && now - lastSeen < THROTTLE_WINDOW_MS) {
    return true;
  }
  _recentErrors.set(key, now);
  // Auto-cleanup when map exceeds 1000 entries
  if (_recentErrors.size > 1000) {
    const cutoff = now - THROTTLE_WINDOW_MS;
    for (const [k, v] of _recentErrors) {
      if (v < cutoff) _recentErrors.delete(k);
    }
  }
  return false;
}

let tableEnsured = false;

async function ensureErrorLogTable() {
  if (tableEnsured) return;
  const client = await getPostgresClient();
  if (!client) return;
  try {
    await withSchemaMigrationLock(client, async () => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_error_logs (
          id BIGSERIAL PRIMARY KEY,
          source VARCHAR(20) NOT NULL,
          level VARCHAR(10) NOT NULL,
          message TEXT NOT NULL,
          stack TEXT,
          context JSONB,
          user_id UUID,
          user_email TEXT,
          request_path TEXT,
          method TEXT,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at ON app_error_logs(created_at DESC)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_app_error_logs_source ON app_error_logs(source)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_app_error_logs_level ON app_error_logs(level)');
      tableEnsured = true;
    });
  } finally {
    client.release();
  }
}

export async function logAppError({
  source = 'server',
  level = 'error',
  message,
  stack = null,
  context = null,
  userId = null,
  userEmail = null,
  requestPath = null,
  method = null,
  userAgent = null,
} = {}) {
  if (!message) return;
  if (shouldThrottle(message)) return;

  try {
    await ensureErrorLogTable();
    await query(
      `INSERT INTO app_error_logs
        (source, level, message, stack, context, user_id, user_email, request_path, method, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        source,
        level,
        String(message).substring(0, 5000),
        stack ? String(stack).substring(0, 5000) : null,
        context || null,
        userId,
        userEmail,
        requestPath,
        method,
        userAgent,
      ]
    );
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      logger.error('[AppErrorLogger] Failed to save log:', error.message);
    }
  }
}

export async function getAppErrorLogs({
  source,
  level,
  queryText,
  limit = 50,
  offset = 0,
} = {}) {
  await ensureErrorLogTable();

  const where = [];
  const params = [];
  let index = 1;

  if (source && source !== 'all') {
    where.push(`source = $${index++}`);
    params.push(source);
  }

  if (level && level !== 'all') {
    where.push(`level = $${index++}`);
    params.push(level);
  }

  if (queryText) {
    where.push(`message ILIKE $${index++}`);
    params.push(`%${queryText}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const logsQuery = `
    SELECT *
    FROM app_error_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${index++} OFFSET $${index++}
  `;

  const countQuery = `
    SELECT COUNT(*)::INTEGER as count
    FROM app_error_logs
    ${whereClause}
  `;

  const [logsResult, countResult] = await Promise.all([
    query(logsQuery, [...params, limit, offset]),
    query(countQuery, params),
  ]);

  return {
    logs: logsResult.rows,
    total: countResult.rows[0]?.count || 0,
  };
}
