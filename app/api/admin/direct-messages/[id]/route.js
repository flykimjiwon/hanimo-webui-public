import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Delete message sent by admin
export async function DELETE(request, { params }) {
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Message ID is required.' },
        { status: 400 }
      );
    }

    // Verify the message was sent by admin before deleting
    const result = await query(
      `DELETE FROM direct_messages
       WHERE id = $1 AND sender_id = $2
       RETURNING id`,
      [id, authResult.user.sub]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Message not found or unauthorized to delete.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message deleted.',
    });
  } catch (error) {
    logger.error('Failed to delete message:', error);
    return createServerError(error, 'Failed to delete message');
  }
}
