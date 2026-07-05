import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    // Check if model_type column exists
    const colCheck = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'models' AND column_name = 'model_type'
    `);
    if (colCheck.rows.length === 0) {
      return NextResponse.json({ models: [] });
    }

    const result = await query(`
      SELECT model_name, label, endpoint
      FROM models
      WHERE model_type = $1
      ORDER BY display_order ASC, label ASC
    `, ['Rerank']);

    const models = result.rows.map((row) => ({
      id: row.model_name,
      label: row.label,
      endpoint: row.endpoint,
    }));

    return NextResponse.json({ models });
  } catch (error) {
    logger.error('Failed to fetch rerank models:', error);
    return createServerError(error, 'Failed to fetch rerank models.');
  }
}
