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

export async function DELETE(request, { params }) {
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

    const commentId = Number(params.id);
    if (!Number.isFinite(commentId)) {
      return NextResponse.json(
        { error: 'Invalid comment ID.' },
        { status: 400 }
      );
    }

    const commentResult = await query(
      'SELECT user_id FROM board_comments WHERE id = $1',
      [commentId]
    );
    if (commentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    const userId = auth.user?.sub || auth.user?.id;
    const isAdmin = auth.user?.role === 'admin';
    if (!isAdmin && commentResult.rows[0].user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete.' },
        { status: 403 }
      );
    }

    await query('DELETE FROM board_comments WHERE id = $1', [commentId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete comment:', error);
    return createServerError(error, 'Failed to delete comment.');
  }
}

export async function PUT(request, { params }) {
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

    const commentId = Number(params.id);
    if (!Number.isFinite(commentId)) {
      return createValidationError('Invalid comment ID.');
    }

    const body = await request.json();
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content || content.length > 2000) {
      return createValidationError('Comment must be between 1 and 2,000 characters.');
    }

    const commentResult = await query(
      'SELECT user_id FROM board_comments WHERE id = $1',
      [commentId]
    );
    if (commentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Comment not found.' },
        { status: 404 }
      );
    }

    const userId = auth.user?.sub || auth.user?.id;
    const isAdmin = auth.user?.role === 'admin';
    if (!isAdmin && commentResult.rows[0].user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to edit.' },
        { status: 403 }
      );
    }

    await query(
      `
      UPDATE board_comments
      SET content = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [content, commentId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update comment:', error);
    return createServerError(error, 'Failed to update comment.');
  }
}
