import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken, updateLastActive } from '@/lib/auth';
import { verifyAdmin } from '@/lib/adminAuth';

// Check and add soft-delete columns
let softDeleteColumnsChecked = false;

async function ensureSoftDeleteColumns() {
  if (softDeleteColumnsChecked) return;

  try {
    // Check whether is_deleted column exists
    const checkColumn = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'is_deleted'
    `);

    if (checkColumn.rows.length === 0) {
      logger.info('⚠️ Adding soft-delete columns to messages table...');
      
      // Add is_deleted column
      await query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false
      `);

      // Add deleted_at column
      await query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP
      `);

      // Add deleted_by column
      await query(`
        ALTER TABLE messages 
        ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL
      `);

      // Add index
      await query(`
        CREATE INDEX IF NOT EXISTS idx_messages_is_deleted 
        ON messages(is_deleted) 
        WHERE is_deleted = false
      `);

      logger.info('✅ Soft-delete columns added');
    }

    softDeleteColumnsChecked = true;
  } catch (error) {
    logger.error('Failed to check/add soft-delete columns:', error);
    // Continue even if an error occurs (keep existing behavior)
  }
}

// GET: Fetch chat message list (pagination supported)
export async function GET(request) {
  try {
    const userPayload = verifyToken(request);
    if (!userPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }
    updateLastActive(userPayload.sub || userPayload.id);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const before = searchParams.get('before'); // Cursor for loading earlier messages (ISO date string)
    const since = searchParams.get('since'); // Cursor for loading messages after latest point (ISO date string)

    // Check whether soft-delete columns exist and add if missing
    await ensureSoftDeleteColumns();

    // Fetch only chat-widget messages (room_id is NULL only)
    // Exclude normal chat-room messages (linked to chat_rooms)
    let sql = '';
    const params = [];
    let paramIndex = 1;

    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid since parameter format.' },
          { status: 400 }
        );
      }

      sql = `
        SELECT
          m.*,
          COALESCE(u.name, '') as user_name,
          COALESCE(u.email, '') as user_email
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE (m.is_deleted IS NULL OR m.is_deleted = false)
          AND m.room_id IS NULL
          AND m.created_at > $${paramIndex}
        ORDER BY m.created_at ASC
        LIMIT $${paramIndex + 1}
      `;
      params.push(sinceDate, limit);
    } else {
      sql = `
        SELECT
          m.*,
          COALESCE(u.name, '') as user_name,
          COALESCE(u.email, '') as user_email
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.id
        WHERE (m.is_deleted IS NULL OR m.is_deleted = false)
          AND m.room_id IS NULL
      `;
      if (before) {
        sql += ` AND m.created_at < $${paramIndex}`;
        params.push(new Date(before));
        paramIndex++;
      }
      sql += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);
    }

    const result = await query(sql, params);

    if (since && result.rows.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    // Convert result to camelCase and add _id
    const messages = result.rows.map((row) => {
      const camelRow = {
        _id: row.id,
        userId: row.user_id,
        email: row.user_email || row.email,
        name: row.user_name || row.name,
        role: row.role,
        text: row.text,
        roomId: row.room_id,
        createdAt: row.created_at,
      };
      return camelRow;
    });

    // DB fetches newest first, reverse for chronological display on client
    const reversedMessages = since ? messages : messages.reverse();

    return NextResponse.json(reversedMessages);
  } catch (error) {
    logger.error('[/api/chat GET] Error:', error);
    return NextResponse.json(
      {
        error: 'An error occurred while fetching messages.',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST: Save a new chat message
export async function POST(request) {
  try {
    // Validate auth token
    const userPayload = verifyToken(request);
    if (!userPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }
    updateLastActive(userPayload.sub || userPayload.id);

    const { text, roomId } = await request.json();

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return NextResponse.json(
        { error: 'Message content is empty.' },
        { status: 400 }
      );
    }

    // Fetch user info (for user_role)
    const userResult = await query(
      'SELECT role as user_role FROM users WHERE email = $1 LIMIT 1',
      [userPayload.email]
    );
    const user = userResult.rows[0] || null;

    // Save directly to messages table
    // Chat-widget messages always store room_id as NULL (to separate from normal chat rooms)
    // Treat special rooms like 'general' as NULL as well
    // Normalization: remove email, name, department, cell (fetch via JOIN from users table)
    const finalRoomId = null;
    
    const insertResult = await query(
      `INSERT INTO messages (user_id, role, user_role, text, room_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userPayload.sub,
        'user',
        user?.user_role || 'user',
        text.trim(),
        finalRoomId,
        new Date(),
      ]
    );

    const row = insertResult.rows[0];
    const newMessage = {
      _id: row.id,
      userId: row.user_id,
      role: row.role,
      userRole: row.user_role,
      text: row.text,
      roomId: row.room_id,
      createdAt: row.created_at,
    };

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    logger.error('[/api/chat POST] Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while saving the message.', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Hide chat-widget message history (admin only)
// Do not physically delete; set is_deleted to true (soft delete)
export async function DELETE(request) {
  try {
    // Verify admin permission
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    // Check and add soft-delete columns
    await ensureSoftDeleteColumns();

    // Soft-delete chat-widget messages in messages table
    // Hide only messages with room_id NULL (chat-widget only)
    // Exclude normal chat-room messages (linked to chat_rooms)
    const updateResult = await query(
      `UPDATE messages 
       SET is_deleted = true, 
           deleted_at = NOW(), 
           deleted_by = $1
       WHERE (is_deleted IS NULL OR is_deleted = false)
         AND room_id IS NULL
       RETURNING id`,
      [adminCheck.user.id]
    );

    const hiddenCount = updateResult.rowCount || 0;

    return NextResponse.json({
      success: true,
      message: `${hiddenCount} chat-widget messages have been hidden.`,
      hiddenCount,
    });
  } catch (error) {
    logger.error('[/api/chat DELETE] Error:', error);
    return NextResponse.json(
      { error: 'An error occurred while hiding messages.', details: error.message },
      { status: 500 }
    );
  }
}
