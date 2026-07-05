import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyTokenWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Mark direct message as read
export async function PATCH(request, { params }) {
  const authResult = verifyTokenWithResult(request);
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

    // Mark as read only for recipient
    const result = await query(
      `UPDATE direct_messages
       SET is_read = true, read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND recipient_id = $2 AND is_read = false
       RETURNING id, is_read, read_at`,
      [id, authResult.user.sub]
    );

    if (result.rowCount === 0) {
      // Already read or no permission
      const existingResult = await query(
        'SELECT id, is_read FROM direct_messages WHERE id = $1 AND recipient_id = $2',
        [id, authResult.user.sub]
      );

      if (existingResult.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Message not found or unauthorized.' },
          { status: 404 }
        );
      }

      // Already read
      return NextResponse.json({
        success: true,
        message: 'This message has already been read.',
        alreadyRead: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Marked as read.',
      readAt: result.rows[0].read_at,
    });
  } catch (error) {
    logger.error('Failed to mark message as read:', error);
    return createServerError(error, 'Failed to mark message as read');
  }
}

// Delete received message (soft delete)
export async function DELETE(request, { params }) {
  const authResult = verifyTokenWithResult(request);
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

    // Delete only for recipient (soft delete)
    const result = await query(
      `UPDATE direct_messages
       SET deleted_by_recipient = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND recipient_id = $2
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
