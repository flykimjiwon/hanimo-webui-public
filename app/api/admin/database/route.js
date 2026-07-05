import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

/**
 * GET /api/admin/database
 * 모든 public 테이블 목록 + 행 수 + 컬럼 수 조회
 */
export async function GET(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const result = await query(`
      SELECT
        t.table_name,
        COALESCE(s.n_live_tup, 0) AS row_count,
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.table_name
        ) AS column_count,
        obj_description((t.table_schema || '.' || t.table_name)::regclass, 'pg_class') AS table_comment
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.table_schema AND s.relname = t.table_name
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name ASC
    `);

    return NextResponse.json({
      success: true,
      tables: result.rows.map(r => ({
        name: r.table_name,
        rowCount: Number(r.row_count),
        columnCount: Number(r.column_count),
        comment: r.table_comment || null,
      })),
      totalTables: result.rows.length,
    });
  } catch (error) {
    logger.error('[DB Viewer] 테이블 목록 조회 실패:', error);
    return createServerError(error);
  }
}
