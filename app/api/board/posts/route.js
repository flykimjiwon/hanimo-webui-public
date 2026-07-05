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

function normalizePagination(searchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(
    50,
    Math.max(5, parseInt(searchParams.get('limit') || '10', 10))
  );
  return { page, limit };
}

export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const { page, limit } = normalizePagination(searchParams);
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClauses.push(
        `(p.title ILIKE $${paramIndex} OR p.content ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) as count FROM board_posts p ${whereSql}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0]?.count || 0, 10);
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    const postsResult = await query(
      `
      SELECT
        p.id,
        p.user_id,
        p.title,
        p.content,
        p.is_notice,
        p.created_at,
        p.updated_at,
        p.views,
        u.name,
        u.department,
        u.role,
        (
          SELECT COUNT(*) FROM board_comments c WHERE c.post_id = p.id
        )::int AS comment_count
      FROM board_posts p
      JOIN users u ON u.id = p.user_id
      ${whereSql}
      ORDER BY p.is_notice DESC, p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `,
      [...params, limit, offset]
    );

    const posts = postsResult.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      content: row.content,
      isNotice: row.is_notice,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      views: row.views ?? 0,
      author: {
        name: row.name,
        department: row.department,
        role: row.role,
      },
      commentCount: row.comment_count || 0,
    }));

    return NextResponse.json({
      posts,
      pagination: { page, limit, totalPages, totalCount },
    });
  } catch (error) {
    logger.error('Failed to fetch board post list:', error);
    return createServerError(
      error,
      'Failed to load board post list.'
    );
  }
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
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const isNotice =
      auth.user?.role === 'admin' ? Boolean(body.isNotice) : false;

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
    if (!userId) {
      return createAuthError('Unable to verify user information.');
    }

    if (isNotice) {
      const noticeCount = await query(
        'SELECT COUNT(*) as count FROM board_posts WHERE is_notice = true'
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

    const result = await query(
      `
      INSERT INTO board_posts (user_id, title, content, is_notice)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
      `,
      [userId, title, content, isNotice]
    );

    return NextResponse.json({
      success: true,
      id: result.rows[0]?.id,
      createdAt: result.rows[0]?.created_at,
    });
  } catch (error) {
    logger.error('Failed to create board post:', error);
    return createServerError(error, 'An error occurred while creating the post.');
  }
}
