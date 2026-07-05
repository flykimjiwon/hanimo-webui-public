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

async function ensureBoardColumns() {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'board_posts'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  if (!columns.has('views')) {
    await query(
      'ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0'
    );
  }
}

export async function GET(request, { params }) {
  try {
    await ensureBoardColumns();
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

    const postId = Number(params.id);
    if (!Number.isFinite(postId)) {
      return createValidationError('Invalid post ID.');
    }

    const postResult = await query(
      `
      UPDATE board_posts
      SET views = COALESCE(views, 0) + 1
      WHERE id = $1
      RETURNING id, user_id, title, content, is_notice, created_at, updated_at, views
      `,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Post not found.' },
        { status: 404 }
      );
    }

    const postRow = postResult.rows[0];
    const authorResult = await query(
      `
      SELECT name, department, role
      FROM users
      WHERE id = $1
      `,
      [postRow.user_id]
    );
    const authorRow = authorResult.rows[0] || {};
    const commentsResult = await query(
      `
      SELECT
        c.id,
        c.post_id,
        c.user_id,
        c.content,
        c.created_at,
        c.updated_at,
        u.name,
        u.department,
        u.role
      FROM board_comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
      `,
      [postId]
    );

    const post = {
      id: postRow.id,
      userId: postRow.user_id,
      title: postRow.title,
      content: postRow.content,
      isNotice: postRow.is_notice,
      createdAt: postRow.created_at,
      updatedAt: postRow.updated_at,
      views: postRow.views ?? 0,
      author: {
        name: authorRow.name,
        department: authorRow.department,
        role: authorRow.role,
      },
    };

    const comments = commentsResult.rows.map((row) => ({
      id: row.id,
      postId: row.post_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      author: {
        name: row.name,
        department: row.department,
        role: row.role,
      },
    }));

    return NextResponse.json({ post, comments });
  } catch (error) {
    logger.error('Failed to fetch board post details:', error);
    return createServerError(error, 'Failed to load post.');
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

    const postId = Number(params.id);
    if (!Number.isFinite(postId)) {
      return createValidationError('Invalid post ID.');
    }

    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!title || title.length > 200) {
      return createValidationError(
        'Title must be between 1 and 200 characters.'
      );
    }
    if (!content || content.length > 10000) {
      return createValidationError(
        'Content must be between 1 and 10,000 characters.'
      );
    }

    const userId = auth.user?.sub || auth.user?.id;
    const isAdmin = auth.user?.role === 'admin';
    const isNotice =
      isAdmin && body.isNotice !== undefined ? Boolean(body.isNotice) : null;

    const ownerResult = await query(
      'SELECT user_id, is_notice FROM board_posts WHERE id = $1',
      [postId]
    );
    if (ownerResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Post not found.' },
        { status: 404 }
      );
    }

    const ownerId = ownerResult.rows[0].user_id;
    if (!isAdmin && ownerId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to edit.' },
        { status: 403 }
      );
    }

    const nextNotice =
      isNotice === null ? ownerResult.rows[0].is_notice : isNotice;

    if (nextNotice && !ownerResult.rows[0].is_notice) {
      const noticeCount = await query(
        'SELECT COUNT(*) as count FROM board_posts WHERE is_notice = true AND id <> $1',
        [postId]
      );
      const existingCount = parseInt(
        noticeCount.rows[0]?.count || 0,
        10
      );
      if (existingCount >= 5) {
        return createValidationError(
          'A maximum of 5 notice posts can be registered.'
        );
      }
    }

    await query(
      `
      UPDATE board_posts
      SET title = $1,
          content = $2,
          is_notice = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      `,
      [title, content, nextNotice, postId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update board post:', error);
    return createServerError(error, 'Failed to update post.');
  }
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

    const postId = Number(params.id);
    if (!Number.isFinite(postId)) {
      return createValidationError('Invalid post ID.');
    }

    const userId = auth.user?.sub || auth.user?.id;
    const isAdmin = auth.user?.role === 'admin';
    const ownerResult = await query(
      'SELECT user_id FROM board_posts WHERE id = $1',
      [postId]
    );
    if (ownerResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Post not found.' },
        { status: 404 }
      );
    }

    if (!isAdmin && ownerResult.rows[0].user_id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete.' },
        { status: 403 }
      );
    }

    await query('DELETE FROM board_posts WHERE id = $1', [postId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete board post:', error);
    return createServerError(error, 'Failed to delete post.');
  }
}
