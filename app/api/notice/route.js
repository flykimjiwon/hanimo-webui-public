import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';

async function ensureNoticeColumns() {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'notices'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  if (!columns.has('is_popup_login')) {
    await query(
      'ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_popup_login BOOLEAN DEFAULT false'
    );
  }
  if (!columns.has('popup_width')) {
    await query(
      'ALTER TABLE notices ADD COLUMN IF NOT EXISTS popup_width INTEGER DEFAULT NULL'
    );
  }
  if (!columns.has('popup_height')) {
    await query(
      'ALTER TABLE notices ADD COLUMN IF NOT EXISTS popup_height INTEGER DEFAULT NULL'
    );
  }
  if (!columns.has('views')) {
    await query(
      'ALTER TABLE notices ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0'
    );
  }
}

// Fetch notice list
export async function GET(request) {
  try {
    await ensureNoticeColumns();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const showPopup = searchParams.get('showPopup'); // Fetch popup notices only
    const popupTarget = searchParams.get('popupTarget') || 'main';

    const skip = (page - 1) * limit;

    // Build query conditions
    let whereClause = '';
    const params = [];
    let paramIndex = 1;

    if (showPopup === 'true') {
      if (popupTarget === 'login') {
        whereClause = 'WHERE is_popup_login = $1 AND is_active = $2';
      } else if (popupTarget === 'any') {
        whereClause =
          'WHERE (is_popup = $1 OR is_popup_login = $2) AND is_active = $3';
        params.push(true, true, true);
        paramIndex = 4;
      } else {
        whereClause = 'WHERE is_popup = $1 AND is_active = $2';
      }
      if (popupTarget !== 'any') {
        params.push(true, true);
        paramIndex = 3;
      }
    }
    // For normal list queries, show all notices regardless of active status (so admins can manage disabled ones)

    // Fetch notices (latest first)
    const noticesResult = await query(
      `SELECT id, title, content, is_popup, is_popup_login, is_active, author_id, author_name,
              created_at, updated_at, popup_width, popup_height, views
       FROM notices
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, skip]
    );

    // Fetch total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM notices ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Transform data (snake_case to camelCase)
    const notices = noticesResult.rows.map(row => ({
      _id: row.id,
      id: row.id,
      title: row.title,
      content: row.content,
      isPopup: row.is_popup,
      isPopupLogin: row.is_popup_login,
      isActive: row.is_active,
      // authorId omitted for security (not exposed in public GET)
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      popupWidth: row.popup_width,
      popupHeight: row.popup_height,
      views: row.views ?? 0,
    }));

    if (showPopup === 'true' && notices.length > 0) {
      const noticeIds = notices.map((notice) => notice.id);
      await query(
        `UPDATE notices
         SET views = COALESCE(views, 0) + 1
         WHERE id = ANY($1::uuid[])`,
        [noticeIds]
      );
      notices.forEach((notice) => {
        notice.views = (notice.views ?? 0) + 1;
      });
    }

    return NextResponse.json({
      notices,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    logger.error('Failed to fetch notices:', error);
    return NextResponse.json(
      { error: 'Failed to load notices.', details: error.message },
      { status: 500 }
    );
  }
}

// Create notice (admin only)
export async function POST(request) {
  try {
    await ensureNoticeColumns();
    // Validate token
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Check admin privileges
    if (payload.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin privileges required.' },
        { status: 403 }
      );
    }

    const {
      title,
      content,
      isPopup = false,
      isPopupLogin = false,
      isActive = true,
      popupWidth = null,
      popupHeight = null,
    } = await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Please enter both title and content.' },
        { status: 400 }
      );
    }

    // Fetch user info
    const userResult = await query(
      'SELECT id, email, name FROM users WHERE email = $1',
      [payload.email]
    );

    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
    const authorName = userResult.rows.length > 0 
      ? (userResult.rows[0].name || userResult.rows[0].email)
      : (payload.name || payload.email);

    // Insert notice
    const result = await query(
      `INSERT INTO notices (title, content, is_popup, is_popup_login, is_active, author_id, author_name, popup_width, popup_height, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [title, content, isPopup, isPopupLogin, isActive, userId, authorName, popupWidth, popupHeight]
    );

    return NextResponse.json(
      {
        success: true,
        noticeId: result.rows[0].id,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Failed to create notice:', error);
    return NextResponse.json(
      { error: 'Failed to create notice.', details: error.message },
      { status: 500 }
    );
  }
}
