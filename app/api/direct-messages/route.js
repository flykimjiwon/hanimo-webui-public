import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyTokenWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Get list of messages received by user
export async function GET(request) {
  const authResult = verifyTokenWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    let whereConditions = ['dm.recipient_id = $1'];
    const params = [authResult.user.sub];
    let paramIndex = 2;

    // Exclude deleted messages by default
    if (!includeDeleted) {
      whereConditions.push('dm.deleted_by_recipient = false');
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count
       FROM direct_messages dm
       ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Get message list
    const offset = (page - 1) * limit;
    const messagesResult = await query(
      `SELECT
        dm.id, dm.title, dm.content, dm.is_read, dm.read_at,
        dm.created_at, dm.updated_at,
        s.id as sender_id, s.name as sender_name, s.email as sender_email
       FROM direct_messages dm
       LEFT JOIN users s ON dm.sender_id = s.id
       ${whereClause}
       ORDER BY dm.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const formattedMessages = messagesResult.rows.map((msg) => ({
      _id: msg.id,
      id: msg.id,
      title: msg.title,
      content: msg.content,
      isRead: msg.is_read,
      readAt: msg.read_at,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      sender: {
        id: msg.sender_id,
        name: msg.sender_name || 'Admin',
        email: msg.sender_email,
      },
    }));

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
      },
    });
  } catch (error) {
    logger.error('Failed to get message list:', error);
    return createServerError(error, 'Failed to get message list');
  }
}
