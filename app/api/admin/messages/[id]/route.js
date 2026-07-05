import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { query } from '@/lib/postgres';
import { isValidUUID } from '@/lib/utils';

export async function DELETE(request, { params }) {
  // Check admin privileges
  const authResult = verifyAdmin(request);
  if (!authResult.success) {
    return authResult;
  }

  try {
    const { id } = await params;

    // Validate UUID
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid message ID.' },
        { status: 400 }
      );
    }

    // Check whether message exists
    const checkResult = await query(
      'SELECT id FROM messages WHERE id = $1 LIMIT 1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Message not found.' },
        { status: 404 }
      );
    }

    // Delete message
    const result = await query(
      'DELETE FROM messages WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Failed to delete message.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message deleted successfully.',
    });
  } catch (error) {
    logger.error('Failed to delete message:', error);
    return NextResponse.json(
      { error: 'Message deletion failed', details: error.message },
      { status: 500 }
    );
  }
}
