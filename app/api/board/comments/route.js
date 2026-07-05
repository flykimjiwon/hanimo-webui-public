import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import {
  createAuthError,
  createValidationError,
  createServerError,
} from '@/lib/errorHandler';

async function isBoardEnabled() {
  const result = await query(
    'SELECT board_enabled FROM settings WHERE config_type = $1 LIMIT 1',
    ['general']
  );
  return result.rows[0]?.board_enabled !== false;
}

export async function POST(request) {
  try {
    const auth = verifyTokenWithResult(request);
    if (!auth.valid) {
      return createAuthError(auth.error);
    }

    if (!(await isBoardEnabled())) {
      return NextResponse.json(
        { error: 'Board is disabled.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const postId = Number(body.postId);
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!Number.isFinite(postId)) {
      return createValidationError('Invalid post ID.');
    }

    if (!content || content.length > 2000) {
      return createValidationError('Comment must be between 1 and 2,000 characters.');
    }

    const postExists = await query(
      'SELECT id FROM board_posts WHERE id = $1',
      [postId]
    );
    if (postExists.rows.length === 0) {
      return NextResponse.json(
        { error: 'Post not found.' },
        { status: 404 }
      );
    }

    const userId = auth.user?.sub || auth.user?.id;
    if (!userId) {
      return createAuthError('Unable to verify user information.');
    }

    const result = await query(
      `
      INSERT INTO board_comments (post_id, user_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
      `,
      [postId, userId, content]
    );

    return NextResponse.json({
      success: true,
      id: result.rows[0]?.id,
      createdAt: result.rows[0]?.created_at,
    });
  } catch (error) {
    logger.error('Failed to create comment:', error);
    return createServerError(error, 'Failed to create comment.');
  }
}
