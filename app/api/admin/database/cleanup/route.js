import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

/**
 * Log table default retention periods (days)
 */
const DEFAULT_RETENTION = {
  app_error_logs: 30,
  model_logs: 30,
  model_server_error_history: 60,
  external_api_logs: 90,
  external_api_prompts: 90,
  qa_logs: 90,
};

const TABLE_TS_COLUMNS = {
  app_error_logs: 'created_at',
  model_logs: 'timestamp',
  model_server_error_history: 'checked_at',
  external_api_logs: 'timestamp',
  external_api_prompts: 'created_at',
  qa_logs: 'created_at',
};

/**
 * GET /api/admin/database/cleanup
 * Get status of each log table (row count, size, oldest/newest date)
 */
export async function GET(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const tables = Object.keys(DEFAULT_RETENTION);
    const stats = [];

    for (const table of tables) {
      try {
        const tsCol = TABLE_TS_COLUMNS[table] || 'created_at';

        const result = await query(`
          SELECT
            COUNT(*)::int AS row_count,
            pg_size_pretty(pg_total_relation_size($1::regclass)) AS size_pretty,
            pg_total_relation_size($1::regclass) AS size_bytes,
            MIN(${tsCol}) AS oldest,
            MAX(${tsCol}) AS newest
          FROM "${table}"
        `, [table]);
        const r = result.rows[0];
        stats.push({
          table,
          tsColumn: tsCol,
          rowCount: r.row_count,
          sizePretty: r.size_pretty,
          sizeBytes: Number(r.size_bytes),
          oldest: r.oldest,
          newest: r.newest,
          defaultRetentionDays: DEFAULT_RETENTION[table],
        });
      } catch {
        stats.push({ table, error: 'Table not found or query failed' });
      }
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    logger.error('[DB Cleanup] Failed to query status:', error);
    return createServerError(error);
  }
}

/**
 * POST /api/admin/database/cleanup
 * Delete logs exceeding retention period
 *
 * Body: { retentionDays?: Record<string, number>, dryRun?: boolean }
 */
export async function POST(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const body = await request.json().catch(() => ({}));
    const retentionDays = { ...DEFAULT_RETENTION, ...body.retentionDays };
    const dryRun = body.dryRun === true;

    const results = [];

    for (const [table, days] of Object.entries(retentionDays)) {
      if (!DEFAULT_RETENTION[table]) continue; // Only allowed tables

      const tsCol = TABLE_TS_COLUMNS[table] || 'created_at';

      try {
        if (dryRun) {
          const countResult = await query(
            `SELECT COUNT(*)::int AS cnt FROM "${table}" WHERE ${tsCol} < NOW() - make_interval(days => $1)`,
            [parseInt(days)]
          );
          results.push({
            table,
            retentionDays: days,
            deletedRows: 0,
            wouldDelete: countResult.rows[0].cnt,
            dryRun: true,
          });
        } else {
          // external_api_prompts has FK references, delete orphaned prompts only
          if (table === 'external_api_prompts') {
            const deleteResult = await query(
              `DELETE FROM external_api_prompts
               WHERE created_at < NOW() - make_interval(days => $1)
                 AND id NOT IN (
                   SELECT prompt_id FROM external_api_logs WHERE prompt_id IS NOT NULL
                 )`,
              [parseInt(days)]
            );
            results.push({
              table,
              retentionDays: days,
              deletedRows: deleteResult.rowCount,
            });
          } else {
            const deleteResult = await query(
              `DELETE FROM "${table}" WHERE ${tsCol} < NOW() - make_interval(days => $1)`,
              [parseInt(days)]
            );
            results.push({
              table,
              retentionDays: days,
              deletedRows: deleteResult.rowCount,
            });
          }
        }
      } catch (err) {
        results.push({ table, error: err.message });
      }
    }

    // VACUUM after deletion (reclaim space) — ignore failures
    if (!dryRun) {
      for (const r of results) {
        if (r.deletedRows > 0) {
          try {
            await query(`VACUUM "${r.table}"`);
            r.vacuumed = true;
          } catch {
            r.vacuumed = false;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      results,
    });
  } catch (error) {
    logger.error('[DB Cleanup] Cleanup failed:', error);
    return createServerError(error);
  }
}
