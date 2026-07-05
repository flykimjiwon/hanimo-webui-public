import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import pg from 'pg';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

const { Pool } = pg;

function getAvailableTargets() {
  const targets = [];

  if (process.env.POSTGRES_URI || process.env.DATABASE_URL) {
    targets.push({
      value: 'main',
      label: 'Default DB (POSTGRES_URI)',
    });
  }

  if (process.env.POSTGRES_API_URI) {
    targets.push({
      value: 'api',
      label: 'API DB (POSTGRES_API_URI)',
    });
  }

  if (targets.length === 0) {
    targets.push({
      value: 'main',
      label: 'Default DB (POSTGRES_URI)',
    });
  }

  return targets;
}

export async function GET(request) {
  let targetPool = null;

  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    const { searchParams } = new URL(request.url);
    const selectedTarget = (searchParams.get('target') || 'main').toLowerCase();
    const availableTargets = getAvailableTargets();

    if (!['main', 'api'].includes(selectedTarget)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid DB target.',
        },
        { status: 400 }
      );
    }

    if (selectedTarget === 'api' && !process.env.POSTGRES_API_URI) {
      return NextResponse.json(
        {
          success: false,
          error: 'POSTGRES_API_URI is not configured.',
          selectedTarget,
          availableTargets,
        },
        { status: 400 }
      );
    }

    const runQuery = async (sql, params) => {
      if (selectedTarget === 'api') {
        if (!targetPool) {
          targetPool = new Pool({
            connectionString: process.env.POSTGRES_API_URI,
            max: 5,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 10000,
          });
        }
        return targetPool.query(sql, params);
      }

      return query(sql, params);
    };

    const tablesResult = await runQuery(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );

    const tables = tablesResult.rows.map((row) => row.table_name);
    const columnsResult = await runQuery(
      `SELECT table_name, column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );

    const grouped = tables.reduce((acc, table) => {
      acc[table] = [];
      return acc;
    }, {});

    columnsResult.rows.forEach((row) => {
      if (!grouped[row.table_name]) {
        grouped[row.table_name] = [];
      }
      grouped[row.table_name].push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      });
    });

    return NextResponse.json({
      success: true,
      selectedTarget,
      availableTargets,
      tables: tables.map((table) => ({
        name: table,
        columns: grouped[table] || [],
      })),
    });
  } catch (error) {
    logger.error('Failed to query DB schema:', error);
    return createServerError(error, 'Failed to query DB schema.');
  } finally {
    if (targetPool) {
      try {
        await targetPool.end();
      } catch (poolCloseError) {
        logger.error('Failed to close API pool for DB schema query:', poolCloseError);
      }
    }
  }
}
