import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { saveMessageDual, updateRoomMessageCount } from '@/lib/messageLogger';
import { validateMessage } from '@/lib/validation';
import {
  createAuthError,
  createValidationError,
  createSuccessResponse,
  withErrorHandler,
} from '@/lib/errorHandler';

// Retrieve history for a specific chat room
export async function GET(request, { params }) {
  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { roomId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50; // Default 50
    const offset = parseInt(searchParams.get('offset')) || 0;

    // Retrieve chat room
    const roomResult = await query(
      'SELECT id, user_id, name, message_count FROM chat_rooms WHERE id = $1',
      [roomId]
    );

    // If chat room does not exist
    if (roomResult.rows.length === 0) {
      return NextResponse.json(
        {
          error: 'Chat room not found.',
          shouldLogout: false,
        },
        { status: 404 }
      );
    }

    const room = roomResult.rows[0];

    // Verify chat room owner (email-based - safer)
    const ownerResult = await query(
      'SELECT id, email FROM users WHERE id = $1',
      [room.user_id]
    );

    if (ownerResult.rows.length === 0 || ownerResult.rows[0].email !== payload.email) {
      return NextResponse.json(
        {
          error: 'Unauthorized to access this chat room.',
          shouldLogout: true,
          message: 'Authentication expired. Please log in again.',
        },
        { status: 403 }
      );
    }

    // Retrieve chat history (oldest messages first)
    // Exclude room-title generation messages (messages starting with [RoomTitle)
    let hasDrawModeColumn = true;
    try {
      const colCheck = await query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'chat_history' AND column_name = 'draw_mode'`
      );
      hasDrawModeColumn = colCheck.rows.length > 0;
    } catch (_) {
      hasDrawModeColumn = false;
    }

    const selectFields = hasDrawModeColumn
      ? 'id, room_id, user_id, role, text, model, created_at, feedback, draw_mode'
      : 'id, room_id, user_id, role, text, model, created_at, feedback';

    const historyResult = await query(
      `SELECT ${selectFields}
       FROM chat_history
       WHERE room_id = $1
       AND (text IS NULL OR text NOT LIKE '[RoomTitle%')
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [roomId, limit, offset]
    );

    // Convert UUID to string and include feedback information
    const formattedHistory = historyResult.rows.map((msg) => ({
      _id: msg.id,
      id: msg.id,
      roomId: msg.room_id,
      userId: msg.user_id,
      role: msg.role,
      text: msg.text,
      model: msg.model,
      createdAt: msg.created_at,
      feedback: msg.feedback || null,
      drawMode: hasDrawModeColumn ? msg.draw_mode === true : false,
    }));

    return NextResponse.json({
      success: true,
      history: formattedHistory,
      roomInfo: {
        id: room.id,
        name: room.name,
        messageCount: room.message_count || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to retrieve chat history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve chat history', details: error.message },
      { status: 500 }
    );
  }
}

// Save chat message
export const POST = withErrorHandler(async (request, { params }) => {
  const payload = verifyToken(request);
  if (!payload) {
    return createAuthError();
  }

  const { roomId } = await params;
  const body = await request.json();
  let { role, text, model, drawMode } = body;

  // Convert text to JSON string if it is an object or array
  if (text !== null && text !== undefined) {
    if (typeof text === 'object') {
      try {
        text = JSON.stringify(text, null, 2);
      } catch (e) {
        logger.warn('[history POST] Failed to serialize text object:', e);
        text = String(text);
      }
    } else {
      text = String(text);
    }
  } else {
    text = '';
  }

  // Validate message
  const messageValidation = validateMessage({ role, text, model, roomId });
  if (!messageValidation.valid) {
    return createValidationError(messageValidation.error);
  }

  // Retrieve chat room
  const roomResult = await query(
    'SELECT id, user_id, name FROM chat_rooms WHERE id = $1',
    [roomId]
  );

  // If chat room does not exist
  if (roomResult.rows.length === 0) {
    return NextResponse.json(
      {
        error: 'Chat room not found.',
        shouldLogout: false,
      },
      { status: 404 }
    );
  }

  const room = roomResult.rows[0];

  // Verify chat room owner (email-based - safer)
  const ownerResult = await query(
    'SELECT id, email FROM users WHERE id = $1',
    [room.user_id]
  );

  if (ownerResult.rows.length === 0 || ownerResult.rows[0].email !== payload.email) {
    return NextResponse.json(
      {
        error: 'Unauthorized to access this chat room.',
        shouldLogout: true,
        message: 'Authentication expired. Please log in again.',
      },
      { status: 403 }
    );
  }

  // Retrieve user info (for admin logging)
  // Normalization: now fetch only user_role (others are retrieved via JOIN)
  const userResult = await query(
    'SELECT id, role FROM users WHERE id = $1',
    [payload.sub]
  );
  const user = userResult.rows.length > 0 ? userResult.rows[0] : null;

  // Execute dual save (chatHistory + messages)
  const saveResult = await saveMessageDual({
    roomId: roomId,
    userId: payload.sub,
    role: role,
    text: text,
    model: model || null,
    userRole: user?.role || 'user',
    clientIP:
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      null,
    drawMode: drawMode === true,
  });

  // Update chat room message count
  await updateRoomMessageCount(roomId);

  return createSuccessResponse({
    message: {
      roomId: roomId,
      userId: payload.sub,
      role: role,
      text: text,
      model: model || null,
      createdAt: new Date(),
      _id: saveResult.chatHistoryId,
      id: saveResult.chatHistoryId,
    },
  });
});
