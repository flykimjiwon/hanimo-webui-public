import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

/**
 * GET /api/admin/database/size
 * Get total DB size + per-table size + index size
 *
 * Query params:
 *   table (optional) — include per-column size for a specific table
 */
export async function GET(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const { searchParams } = new URL(request.url);
    const targetTable = searchParams.get('table') || null;

    // 1) Total DB size
    const dbSizeResult = await query(`
      SELECT
        current_database() AS db_name,
        pg_database_size(current_database()) AS db_size_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty
    `);
    const dbInfo = dbSizeResult.rows[0];

    // 2) Per-table size (data + index + TOAST)
    const tableSizeResult = await query(`
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_relation_size(c.oid) AS table_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        COALESCE(pg_total_relation_size(c.reltoastrelid), 0) AS toast_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
        pg_size_pretty(pg_relation_size(c.oid)) AS table_pretty,
        pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
        COALESCE(s.n_live_tup, 0) AS row_count
      FROM pg_class c
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);

    const tables = tableSizeResult.rows.map(r => ({
      name: r.table_name,
      totalBytes: Number(r.total_bytes),
      tableBytes: Number(r.table_bytes),
      indexBytes: Number(r.index_bytes),
      toastBytes: Number(r.toast_bytes),
      totalPretty: r.total_pretty,
      tablePretty: r.table_pretty,
      indexPretty: r.index_pretty,
      rowCount: Number(r.row_count),
    }));

    // 3) Per-column avg size for specific table (if requested)
    let columns = null;
    if (targetTable) {
      // Verify table exists
      const exists = await query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1`,
        [targetTable]
      );
      if (exists.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Table not found.' }, { status: 404 });
      }

      // Get column list
      const colsResult = await query(
        `SELECT column_name, udt_name AS data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [targetTable]
      );

      // Measure per-column size only when rows exist
      const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;
      const safeTable = targetTable;
      if (!SAFE_IDENT.test(safeTable)) {
        return NextResponse.json({ success: false, error: 'Invalid table name.' }, { status: 400 });
      }

      const rowCountCheck = await query(`SELECT COUNT(*)::int AS cnt FROM "${safeTable}"`);
      const rowCnt = rowCountCheck.rows[0].cnt;

      if (rowCnt > 0) {
        // Per-column pg_column_size avg + NULL ratio
        const colNames = colsResult.rows.map(c => c.column_name).filter(n => SAFE_IDENT.test(n));
        const selectParts = colNames.map(name =>
          `AVG(pg_column_size("${name}"))::numeric(12,1) AS "avg_${name}",
           (COUNT(*) FILTER (WHERE "${name}" IS NULL))::float / GREATEST(COUNT(*), 1) AS "null_${name}"`
        ).join(',\n');

        // Include avg row size
        const sizeQuery = `
          SELECT
            AVG(pg_column_size(t.*))::numeric(12,1) AS avg_row_size,
            ${selectParts}
          FROM "${safeTable}" t
        `;
        const sizeResult = await query(sizeQuery);
        const sizeRow = sizeResult.rows[0];

        columns = colsResult.rows.map(col => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          avgBytes: sizeRow[`avg_${col.column_name}`] !== null
            ? parseFloat(sizeRow[`avg_${col.column_name}`])
            : 0,
          nullRatio: parseFloat((sizeRow[`null_${col.column_name}`] * 100).toFixed(1)),
        }));

        columns = {
          avgRowSize: parseFloat(sizeRow.avg_row_size) || 0,
          rowCount: rowCnt,
          items: columns,
        };
      } else {
        columns = {
          avgRowSize: 0,
          rowCount: 0,
          items: colsResult.rows.map(col => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === 'YES',
            avgBytes: 0,
            nullRatio: 0,
          })),
        };
      }
    }

    return NextResponse.json({
      success: true,
      database: {
        name: dbInfo.db_name,
        sizeBytes: Number(dbInfo.db_size_bytes),
        sizePretty: dbInfo.db_size_pretty,
      },
      tables,
      columns,
    });
  } catch (error) {
    logger.error('[DB Size] Failed to query capacity:', error);
    return createServerError(error);
  }
}

/**
 * POST /api/admin/database/size
 * Run VACUUM FULL on table (resolve bloat — reclaim disk space)
 *
 * Body: { table: string }
 */
export async function POST(request) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const body = await request.json().catch(() => ({}));
    const tableName = body.table;

    if (!tableName) {
      return NextResponse.json({ success: false, error: 'Table name is required.' }, { status: 400 });
    }

    // Verify table exists (prevent SQL injection)
    const exists = await query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1`,
      [tableName]
    );
    if (exists.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Table not found.' }, { status: 404 });
    }

    // Size before VACUUM FULL
    const beforeResult = await query(
      `SELECT pg_total_relation_size($1::regclass) AS bytes, pg_size_pretty(pg_total_relation_size($1::regclass)) AS pretty`,
      [tableName]
    );
    const beforeBytes = Number(beforeResult.rows[0].bytes);
    const beforePretty = beforeResult.rows[0].pretty;

    // Run VACUUM (non-blocking — allows concurrent reads)
    await query(`VACUUM "${tableName}"`);

    // Size after VACUUM FULL
    const afterResult = await query(
      `SELECT pg_total_relation_size($1::regclass) AS bytes, pg_size_pretty(pg_total_relation_size($1::regclass)) AS pretty`,
      [tableName]
    );
    const afterBytes = Number(afterResult.rows[0].bytes);
    const afterPretty = afterResult.rows[0].pretty;

    return NextResponse.json({
      success: true,
      table: tableName,
      before: { bytes: beforeBytes, pretty: beforePretty },
      after: { bytes: afterBytes, pretty: afterPretty },
      freedBytes: beforeBytes - afterBytes,
      freedPretty: formatPrettyBytes(beforeBytes - afterBytes),
    });
  } catch (error) {
    logger.error('[DB Size] VACUUM FULL failed:', error);
    return createServerError(error);
  }
}

function formatPrettyBytes(bytes) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}
