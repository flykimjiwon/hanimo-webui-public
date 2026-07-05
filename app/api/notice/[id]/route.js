import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';
import { isValidUUID } from '@/lib/utils';

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

// Retrieve notice details
export async function GET(request, { params }) {
  try {
    await ensureNoticeColumns();
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid ID.' },
        { status: 400 }
      );
    }

    // Increase view count and retrieve notice
    const noticeResult = await query(
      `UPDATE notices
       SET views = COALESCE(views, 0) + 1
       WHERE id = $1
       RETURNING id, title, content, is_popup, is_popup_login, is_active, author_id, author_name,
                 created_at, updated_at, popup_width, popup_height, views`,
      [id]
    );

    if (noticeResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Notice not found.' },
        { status: 404 }
      );
    }

    const row = noticeResult.rows[0];
    const notice = {
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
    };

    return NextResponse.json({ notice });
  } catch (error) {
    logger.error('Failed to retrieve notice details:', error);
    return NextResponse.json(
      { error: 'Failed to load notice.', details: error.message },
      { status: 500 }
    );
  }
}

// Update notice (admin only)
export async function PUT(request, { params }) {
  try {
    await ensureNoticeColumns();
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid ID.' },
        { status: 400 }
      );
    }

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

    const { title, content, isPopup, isPopupLogin, isActive, popupWidth, popupHeight } =
      await request.json();

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Please enter both title and content.' },
        { status: 400 }
      );
    }

    // Update notice
    const result = await query(
      `UPDATE notices
       SET title = $1, content = $2, is_popup = $3, is_popup_login = $4, is_active = $5,
           popup_width = $6, popup_height = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [title, content, !!isPopup, !!isPopupLogin, !!isActive, popupWidth || null, popupHeight || null, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Notice not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to update notice:', error);
    return NextResponse.json(
      { error: 'Failed to update notice.', details: error.message },
      { status: 500 }
    );
  }
}

// Delete notice (admin only)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid ID.' },
        { status: 400 }
      );
    }

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

    // Delete notice
    const result = await query(
      'DELETE FROM notices WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Notice not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete notice:', error);
    return NextResponse.json(
      { error: 'Failed to delete notice.', details: error.message },
      { status: 500 }
    );
  }
}
