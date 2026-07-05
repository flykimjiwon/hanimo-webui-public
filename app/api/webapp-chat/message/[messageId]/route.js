import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdmin } from '@/lib/adminAuth';
import { isValidUUID } from '@/lib/utils';

// PATCH: Soft-delete a single chat widget message (admin only)
export async function PATCH(request, { params }) {
  try {
    // Verify admin privileges
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    const { messageId } = await params;

    // Validate messageId
    if (!messageId || !isValidUUID(messageId)) {
      return NextResponse.json(
        { error: 'Invalid message ID.' },
        { status: 400 }
      );
    }

    // Check if the message is a chat widget message (room_id is NULL)
    const checkResult = await query(
      `SELECT id, room_id, is_deleted FROM messages WHERE id = $1`,
      [messageId]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Message not found.' },
        { status: 404 }
      );
    }

    const message = checkResult.rows[0];

    if (message.room_id !== null) {
      return NextResponse.json(
        { error: 'Only chat widget messages can be deleted.' },
        { status: 400 }
      );
    }

    if (message.is_deleted) {
      return NextResponse.json(
        { error: 'Message is already deleted.' },
        { status: 400 }
      );
    }

    // Soft delete
    await query(
      `UPDATE messages 
       SET is_deleted = true, 
           deleted_at = NOW(), 
           deleted_by = $1
       WHERE id = $2`,
      [adminCheck.user.id, messageId]
    );

    return NextResponse.json({
      success: true,
      message: 'Message has been deleted.',
      messageId,
    });
  } catch (error) {
    logger.error('[/api/webapp-chat/message PATCH] Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while deleting the message.', details: error.message },
      { status: 500 }
    );
  }
}
