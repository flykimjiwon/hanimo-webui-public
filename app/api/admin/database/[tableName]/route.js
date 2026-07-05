import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createValidationError, createServerError } from '@/lib/errorHandler';

/**
 * 테이블 이름이 실제 public 스키마에 존재하는지 검증 (SQL Injection 방지)
 */
async function validateTableName(tableName) {
  const result = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1`,
    [tableName]
  );
  return result.rows.length > 0;
}

/**
 * 컬럼 이름이 테이블에 실제 존재하는지 검증
 */
async function validateColumnNames(tableName, columnNames) {
  const result = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  const validColumns = new Set(result.rows.map(r => r.column_name));
  const invalid = columnNames.filter(c => !validColumns.has(c));
  return { valid: invalid.length === 0, invalidColumns: invalid, validColumns };
}

/**
 * 테이블의 Primary Key 컬럼 조회
 */
async function getPrimaryKeyColumns(tableName) {
  const result = await query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
  `, [tableName]);
  return result.rows.map(r => r.column_name);
}

/**
 * GET /api/admin/database/[tableName]
 * 테이블 스키마 + 페이지네이션된 데이터 조회
 *
 * Query params:
 *   page (default 1), limit (default 50, max 200),
 *   sort (column name), dir (asc|desc),
 *   search (전체 텍스트 검색), column (특정 컬럼 검색)
 */
export async function GET(request, { params }) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const { tableName } = await params;
    if (!(await validateTableName(tableName))) {
      return createValidationError(`테이블 '${tableName}'이(가) 존재하지 않습니다.`);
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const sortColumn = searchParams.get('sort') || null;
    const sortDir = (searchParams.get('dir') || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const search = searchParams.get('search') || '';
    const searchColumn = searchParams.get('column') || '';
    const offset = (page - 1) * limit;

    const schemaResult = await query(`
      SELECT
        c.column_name,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        col_description((table_schema || '.' || table_name)::regclass, c.ordinal_position) AS column_comment
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]);

    const columns = schemaResult.rows.map(r => ({
      name: r.column_name,
      type: r.udt_name || r.data_type,
      nullable: r.is_nullable === 'YES',
      defaultValue: r.column_default,
      maxLength: r.character_maximum_length,
      precision: r.numeric_precision,
      comment: r.column_comment || null,
    }));

    const primaryKeys = await getPrimaryKeyColumns(tableName);
    const columnNames = columns.map(c => c.name);

    let orderClause = '';
    if (sortColumn && columnNames.includes(sortColumn)) {
      orderClause = `ORDER BY "${sortColumn}" ${sortDir} NULLS LAST`;
    } else if (primaryKeys.length > 0) {
      orderClause = `ORDER BY "${primaryKeys[0]}" ASC NULLS LAST`;
    }

    let whereClause = '';
    const queryParams = [];
    if (search.trim()) {
      if (searchColumn && columnNames.includes(searchColumn)) {
        queryParams.push(`%${search}%`);
        whereClause = `WHERE "${searchColumn}"::text ILIKE $${queryParams.length}`;
      } else {
        const textColumns = columns
          .filter(c => ['text', 'varchar', 'bpchar', 'name', 'uuid'].includes(c.type))
          .map(c => c.name);
        if (textColumns.length > 0) {
          queryParams.push(`%${search}%`);
          const conditions = textColumns.map(col => `"${col}"::text ILIKE $${queryParams.length}`);
          whereClause = `WHERE (${conditions.join(' OR ')})`;
        }
      }
    }

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM "${tableName}" ${whereClause}`,
      queryParams
    );
    const totalRows = countResult.rows[0]?.total || 0;

    const dataParams = [...queryParams, limit, offset];
    const dataResult = await query(
      `SELECT * FROM "${tableName}" ${whereClause} ${orderClause} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return NextResponse.json({
      success: true,
      table: tableName,
      schema: columns,
      primaryKeys,
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        totalRows,
        totalPages: Math.ceil(totalRows / limit),
      },
    });
  } catch (error) {
    logger.error('[DB Viewer] 데이터 조회 실패:', error);
    return createServerError(error);
  }
}

/**
 * POST /api/admin/database/[tableName]
 * 새 행 삽입
 * Body: { row: { column1: value1, column2: value2, ... } }
 */
export async function POST(request, { params }) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const { tableName } = await params;
    if (!(await validateTableName(tableName))) {
      return createValidationError(`테이블 '${tableName}'이(가) 존재하지 않습니다.`);
    }

    const body = await request.json();
    const row = body.row;
    if (!row || typeof row !== 'object' || Object.keys(row).length === 0) {
      return createValidationError('삽입할 데이터가 없습니다.');
    }

    const colNames = Object.keys(row);
    const { valid, invalidColumns } = await validateColumnNames(tableName, colNames);
    if (!valid) {
      return createValidationError(`존재하지 않는 컬럼: ${invalidColumns.join(', ')}`);
    }

    const values = Object.values(row);
    const placeholders = values.map((_, i) => `$${i + 1}`);
    const quotedCols = colNames.map(c => `"${c}"`);

    const result = await query(
      `INSERT INTO "${tableName}" (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );

    return NextResponse.json({
      success: true,
      message: '행이 추가되었습니다.',
      row: result.rows[0],
    }, { status: 201 });
  } catch (error) {
    logger.error('[DB Viewer] 행 삽입 실패:', error);
    if (error.code === '23505') {
      return createValidationError('중복된 키 값이 존재합니다: ' + error.detail);
    }
    if (error.code === '23503') {
      return createValidationError('참조 무결성 위반: ' + error.detail);
    }
    if (error.code === '23502') {
      return createValidationError('필수 컬럼 누락: ' + error.detail);
    }
    return createServerError(error);
  }
}

/**
 * PUT /api/admin/database/[tableName]
 * 행 수정
 * Body: { primaryKey: { id: 123 }, row: { column1: newValue, ... } }
 */
export async function PUT(request, { params }) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const { tableName } = await params;
    if (!(await validateTableName(tableName))) {
      return createValidationError(`테이블 '${tableName}'이(가) 존재하지 않습니다.`);
    }

    const body = await request.json();
    const { primaryKey, row } = body;
    if (!primaryKey || typeof primaryKey !== 'object' || Object.keys(primaryKey).length === 0) {
      return createValidationError('Primary Key 정보가 필요합니다.');
    }
    if (!row || typeof row !== 'object' || Object.keys(row).length === 0) {
      return createValidationError('수정할 데이터가 없습니다.');
    }

    const pkCols = Object.keys(primaryKey);
    const { valid: pkValid, invalidColumns: pkInvalid } = await validateColumnNames(tableName, pkCols);
    if (!pkValid) {
      return createValidationError(`존재하지 않는 PK 컬럼: ${pkInvalid.join(', ')}`);
    }

    const updateCols = Object.keys(row);
    const { valid: colValid, invalidColumns: colInvalid } = await validateColumnNames(tableName, updateCols);
    if (!colValid) {
      return createValidationError(`존재하지 않는 컬럼: ${colInvalid.join(', ')}`);
    }

    let paramIndex = 1;
    const setClauses = updateCols.map(col => `"${col}" = $${paramIndex++}`);
    const updateValues = Object.values(row);

    const whereClauses = pkCols.map(col => `"${col}" = $${paramIndex++}`);
    const pkValues = Object.values(primaryKey);

    const allValues = [...updateValues, ...pkValues];

    const result = await query(
      `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`,
      allValues
    );

    if (result.rowCount === 0) {
      return createValidationError('해당 행을 찾을 수 없습니다.');
    }

    return NextResponse.json({
      success: true,
      message: '행이 수정되었습니다.',
      row: result.rows[0],
    });
  } catch (error) {
    logger.error('[DB Viewer] 행 수정 실패:', error);
    if (error.code === '23505') {
      return createValidationError('중복된 키 값이 존재합니다: ' + error.detail);
    }
    if (error.code === '23503') {
      return createValidationError('참조 무결성 위반: ' + error.detail);
    }
    return createServerError(error);
  }
}

/**
 * DELETE /api/admin/database/[tableName]
 * 행 삭제
 * Body: { primaryKey: { id: 123 } }
 */
export async function DELETE(request, { params }) {
  try {
    const auth = verifyAdminWithResult(request);
    if (!auth.valid) return createAuthError(auth.error);

    const { tableName } = await params;
    if (!(await validateTableName(tableName))) {
      return createValidationError(`테이블 '${tableName}'이(가) 존재하지 않습니다.`);
    }

    const body = await request.json();
    const { primaryKey } = body;
    if (!primaryKey || typeof primaryKey !== 'object' || Object.keys(primaryKey).length === 0) {
      return createValidationError('Primary Key 정보가 필요합니다.');
    }

    const pkCols = Object.keys(primaryKey);
    const { valid, invalidColumns } = await validateColumnNames(tableName, pkCols);
    if (!valid) {
      return createValidationError(`존재하지 않는 PK 컬럼: ${invalidColumns.join(', ')}`);
    }

    const whereClauses = pkCols.map((col, i) => `"${col}" = $${i + 1}`);
    const pkValues = Object.values(primaryKey);

    const result = await query(
      `DELETE FROM "${tableName}" WHERE ${whereClauses.join(' AND ')} RETURNING *`,
      pkValues
    );

    if (result.rowCount === 0) {
      return createValidationError('해당 행을 찾을 수 없습니다.');
    }

    return NextResponse.json({
      success: true,
      message: '행이 삭제되었습니다.',
      deletedRow: result.rows[0],
    });
  } catch (error) {
    logger.error('[DB Viewer] 행 삭제 실패:', error);
    if (error.code === '23503') {
      return createValidationError('참조 무결성 위반: 다른 테이블에서 참조 중인 행입니다. ' + (error.detail || ''));
    }
    return createServerError(error);
  }
}
