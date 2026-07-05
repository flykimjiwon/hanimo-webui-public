import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

/**
 * GET /api/admin/database/purge-junk
 * Preview junk log statistics (pre-deletion check)
 */
export async function GET(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const targets = [];

    // 1) app_error_logs: 4xx client error logs (auth expiry, validation errors, etc.)
    try {
      const r = await query(`
        SELECT COUNT(*)::int AS cnt,
               pg_size_pretty(SUM(pg_column_size(t.*))::bigint) AS size_pretty,
               COALESCE(SUM(pg_column_size(t.*))::bigint, 0) AS size_bytes
        FROM app_error_logs t
        WHERE level = 'warn'
      `);
      targets.push({
        id: 'app_error_warn',
        table: 'app_error_logs',
        description: '4xx client error logs (auth expiry, validation errors, etc.)',
        condition: "level = 'warn'",
        count: r.rows[0].cnt,
        sizePretty: r.rows[0].size_pretty || '0 bytes',
        sizeBytes: Number(r.rows[0].size_bytes),
      });
    } catch { /* table not found */ }

    // 2) app_error_logs: Duplicate error logs (same message 10+ times, keep latest 5)
    try {
      const r = await query(`
        SELECT COUNT(*)::int AS cnt,
               COALESCE(SUM(pg_column_size(t.*))::bigint, 0) AS size_bytes,
               pg_size_pretty(COALESCE(SUM(pg_column_size(t.*))::bigint, 0)) AS size_pretty
        FROM app_error_logs t
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY message ORDER BY created_at DESC) AS rn
            FROM app_error_logs
          ) ranked WHERE rn <= 5
        )
        AND message IN (
          SELECT message FROM app_error_logs GROUP BY message HAVING COUNT(*) > 10
        )
      `);
      targets.push({
        id: 'app_error_dupes',
        table: 'app_error_logs',
        description: 'Duplicate error logs (same message 10+ times, keep latest 5)',
        count: r.rows[0].cnt,
        sizePretty: r.rows[0].size_pretty || '0 bytes',
        sizeBytes: Number(r.rows[0].size_bytes),
      });
    } catch { /* */ }

    // 3) model_logs: Instance heartbeat/system event logs (not API calls)
    try {
      const r = await query(`
        SELECT COUNT(*)::int AS cnt,
               COALESCE(SUM(pg_column_size(t.*))::bigint, 0) AS size_bytes,
               pg_size_pretty(COALESCE(SUM(pg_column_size(t.*))::bigint, 0)) AS size_pretty
        FROM model_logs t
        WHERE category = 'system_event'
      `);
      targets.push({
        id: 'model_logs_heartbeat',
        table: 'model_logs',
        description: 'Instance heartbeat/system event logs (not API calls)',
        condition: "category = 'system_event'",
        count: r.rows[0].cnt,
        sizePretty: r.rows[0].size_pretty || '0 bytes',
        sizeBytes: Number(r.rows[0].size_bytes),
      });
    } catch { /* */ }

    // 4) external_api_logs: Normal response request/response raw data (NULL-ify to reclaim space)
    try {
      const r = await query(`
        SELECT COUNT(*)::int AS cnt,
               COALESCE(SUM(
                 COALESCE(pg_column_size(request_headers), 0) +
                 COALESCE(pg_column_size(request_body), 0) +
                 COALESCE(pg_column_size(response_headers), 0) +
                 COALESCE(pg_column_size(response_body), 0)
               )::bigint, 0) AS size_bytes,
               pg_size_pretty(COALESCE(SUM(
                 COALESCE(pg_column_size(request_headers), 0) +
                 COALESCE(pg_column_size(request_body), 0) +
                 COALESCE(pg_column_size(response_headers), 0) +
                 COALESCE(pg_column_size(response_body), 0)
               )::bigint, 0)) AS size_pretty
        FROM external_api_logs
        WHERE (status_code IS NULL OR status_code < 400)
          AND (request_headers IS NOT NULL OR request_body IS NOT NULL
               OR response_headers IS NOT NULL OR response_body IS NOT NULL)
      `);
      targets.push({
        id: 'external_api_jsonb',
        table: 'external_api_logs',
        description: 'Normal response request/response raw data (NULL-ify to reclaim space)',
        count: r.rows[0].cnt,
        sizePretty: r.rows[0].size_pretty || '0 bytes',
        sizeBytes: Number(r.rows[0].size_bytes),
      });
    } catch { /* */ }

    const totalBytes = targets.reduce((s, t) => s + (t.sizeBytes || 0), 0);
    const totalCount = targets.reduce((s, t) => s + (t.count || 0), 0);

    return NextResponse.json({
      success: true,
      targets,
      summary: {
        totalCount,
        totalBytes,
        totalPretty: formatBytes(totalBytes),
      },
    });
  } catch (error) {
    logger.error('[Purge Junk] Failed to query status:', error);
    return createServerError(error);
  }
}

/**
 * POST /api/admin/database/purge-junk
 * Bulk delete junk logs
 *
 * Body: { targets?: string[] } — omit for all, specify IDs to target
 */
export async function POST(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const body = await request.json().catch(() => ({}));
    const selectedTargets = body.targets || null; // null = all

    const results = [];

    // 1) Delete app_error_logs warn entries
    if (!selectedTargets || selectedTargets.includes('app_error_warn')) {
      try {
        const r = await query(`DELETE FROM app_error_logs WHERE level = 'warn'`);
        results.push({ id: 'app_error_warn', table: 'app_error_logs', deletedRows: r.rowCount });
      } catch (e) { results.push({ id: 'app_error_warn', error: e.message }); }
    }

    // 2) Remove duplicate app_error_logs (keep latest 5 per message)
    if (!selectedTargets || selectedTargets.includes('app_error_dupes')) {
      try {
        const r = await query(`
          DELETE FROM app_error_logs
          WHERE id NOT IN (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY message ORDER BY created_at DESC) AS rn
              FROM app_error_logs
            ) ranked WHERE rn <= 5
          )
          AND message IN (
            SELECT message FROM app_error_logs GROUP BY message HAVING COUNT(*) > 10
          )
        `);
        results.push({ id: 'app_error_dupes', table: 'app_error_logs', deletedRows: r.rowCount });
      } catch (e) { results.push({ id: 'app_error_dupes', error: e.message }); }
    }

    // 3) Delete model_logs heartbeat entries
    if (!selectedTargets || selectedTargets.includes('model_logs_heartbeat')) {
      try {
        const r = await query(`DELETE FROM model_logs WHERE category = 'system_event'`);
        results.push({ id: 'model_logs_heartbeat', table: 'model_logs', deletedRows: r.rowCount });
      } catch (e) { results.push({ id: 'model_logs_heartbeat', error: e.message }); }
    }

    // 4) NULL-ify normal response JSONB in external_api_logs (clear columns, not deleting rows)
    if (!selectedTargets || selectedTargets.includes('external_api_jsonb')) {
      try {
        const r = await query(`
          UPDATE external_api_logs
          SET request_headers = NULL,
              request_body = NULL,
              response_headers = NULL,
              response_body = NULL
          WHERE (status_code IS NULL OR status_code < 400)
            AND (request_headers IS NOT NULL OR request_body IS NOT NULL
                 OR response_headers IS NOT NULL OR response_body IS NOT NULL)
        `);
        results.push({ id: 'external_api_jsonb', table: 'external_api_logs', updatedRows: r.rowCount });
      } catch (e) { results.push({ id: 'external_api_jsonb', error: e.message }); }
    }

    // VACUUM to reclaim space (non-blocking — allows concurrent reads)
    const affectedTables = new Set(results.filter(r => (r.deletedRows > 0 || r.updatedRows > 0)).map(r => r.table));
    for (const table of affectedTables) {
      try { await query(`VACUUM "${table}"`); } catch { /* ignore */ }
    }

    return NextResponse.json({
      success: true,
      results,
      vacuumed: [...affectedTables],
    });
  } catch (error) {
    logger.error('[Purge Junk] Deletion failed:', error);
    return createServerError(error);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
