import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/postgres';

// Retrieve user's chat room list
export async function GET(request) {
  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Fetch user ID (email-based)
    const userResult = await query(
      'SELECT id FROM users WHERE email = $1',
      [payload.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    const userId = userResult.rows[0].id;

    // Fetch user's chat room list (latest updated first)
    const roomsResult = await query(
      `SELECT id, user_id, name, message_count, created_at, updated_at,
              custom_instruction, custom_instruction_active
       FROM chat_rooms 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    // Transform PostgreSQL results
    const formattedRooms = roomsResult.rows.map((room) => ({
      _id: room.id,
      userId: room.user_id,
      name: room.name,
      messageCount: room.message_count,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      customInstruction: room.custom_instruction || '',
      customInstructionActive: room.custom_instruction_active || false,
    }));

    return NextResponse.json({
      success: true,
      rooms: formattedRooms,
    });
  } catch (error) {
    logger.error('Failed to fetch chat room list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat room list', details: error.message },
      { status: 500 }
    );
  }
}

// Create new chat room
export async function POST(request) {
  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Please enter a chat room name.' },
        { status: 400 }
      );
    }

    if (name.trim().length > 50) {
      return NextResponse.json(
        { error: 'Chat room name must be 50 characters or fewer.' },
        { status: 400 }
      );
    }

    // Fetch user ID (email-based)
    const userResult = await query(
      'SELECT id FROM users WHERE email = $1',
      [payload.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    const userId = userResult.rows[0].id;

    // Check user's chat room count (max 50)
    const roomCountResult = await query(
      'SELECT COUNT(*) as count FROM chat_rooms WHERE user_id = $1',
      [userId]
    );
    const roomCount = parseInt(roomCountResult.rows[0].count);
    
    if (roomCount >= 50) {
      return NextResponse.json(
        { error: 'You can create up to 50 chat rooms.' },
        { status: 400 }
      );
    }

    // Create new chat room
    const newRoomResult = await query(
      `INSERT INTO chat_rooms (user_id, name, message_count, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, user_id, name, message_count, created_at, updated_at`,
      [userId, name.trim(), 0]
    );

    const newRoom = newRoomResult.rows[0];

    return NextResponse.json({
      success: true,
      room: {
        _id: newRoom.id,
        userId: newRoom.user_id,
        name: newRoom.name,
        messageCount: newRoom.message_count,
        createdAt: newRoom.created_at,
        updatedAt: newRoom.updated_at,
      },
    });
  } catch (error) {
    logger.error('Failed to create chat room:', error);
    return NextResponse.json(
      { error: 'Failed to create chat room', details: error.message },
      { status: 500 }
    );
  }
}
