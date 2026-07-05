import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { isValidUUID } from '@/lib/utils';

// Save/update message feedback
export async function POST(request, { params }) {
  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { messageId } = await params;
    const body = await request.json();
    const { feedback } = body;

    // Validate feedback value
    if (feedback !== null && feedback !== 'like' && feedback !== 'dislike') {
      return NextResponse.json(
        { error: 'Invalid feedback value.' },
        { status: 400 }
      );
    }

    // Validate messageId
    if (!messageId || !isValidUUID(messageId)) {
      return NextResponse.json(
        { error: 'Invalid message ID.' },
        { status: 400 }
      );
    }

    // Fetch message and verify ownership
    const messageResult = await query(
      'SELECT id, room_id, user_id, text, role, created_at FROM chat_history WHERE id = $1',
      [messageId]
    );

    if (messageResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Message not found.' },
        { status: 404 }
      );
    }

    const message = messageResult.rows[0];

    // Verify message owner (by user_id)
    if (message.user_id !== payload.sub) {
      return NextResponse.json(
        { error: 'Unauthorized for this message.' },
        { status: 403 }
      );
    }

    // Update feedback (set NULL if null)
    if (feedback === null) {
      // Remove feedback
      await query(
        'UPDATE chat_history SET feedback = NULL WHERE id = $1',
        [messageId]
      );

      // Sync to messages table as well
      await query(
        `UPDATE messages 
         SET feedback = NULL 
         WHERE room_id = $1 AND text = $2 AND role = $3 AND created_at = $4`,
        [message.room_id, message.text, message.role, message.created_at]
      );
    } else {
      // Set feedback
      await query(
        'UPDATE chat_history SET feedback = $1 WHERE id = $2',
        [feedback, messageId]
      );

      // Sync to messages table as well
      await query(
        `UPDATE messages 
         SET feedback = $1 
         WHERE room_id = $2 AND text = $3 AND role = $4 AND created_at = $5`,
        [feedback, message.room_id, message.text, message.role, message.created_at]
      );
    }

    return NextResponse.json({
      success: true,
      feedback: feedback,
    });
  } catch (error) {
    logger.error('Failed to save feedback:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback.', details: error.message },
      { status: 500 }
    );
  }
}
