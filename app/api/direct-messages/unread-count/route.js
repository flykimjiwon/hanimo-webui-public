import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyTokenWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Get unread message count (for badge)
export async function GET(request) {
  const authResult = verifyTokenWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM direct_messages
       WHERE recipient_id = $1
         AND is_read = false
         AND deleted_by_recipient = false`,
      [authResult.user.sub]
    );

    const unreadCount = parseInt(result.rows[0].count);

    return NextResponse.json({
      success: true,
      count: unreadCount,
    });
  } catch (error) {
    logger.error('Failed to get unread message count:', error);
    return createServerError(error, 'Failed to get unread message count');
  }
}
