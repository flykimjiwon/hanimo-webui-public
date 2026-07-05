import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

export async function GET(request) {
  const authCheck = verifyAdminWithResult(request);
  if (!authCheck.valid) return createAuthError(authCheck.error);

  try {
    const result = await query(`
      SELECT department, auth_type, COUNT(*)::integer as count
      FROM users
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department, auth_type
      ORDER BY department, auth_type
    `);

    return NextResponse.json({ departments: result.rows });
  } catch (error) {
    return createServerError(error, 'Failed to retrieve department list');
  }
}
