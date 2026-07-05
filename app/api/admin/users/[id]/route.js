import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { query, transaction } from '@/lib/postgres';
import { isValidUUID } from '@/lib/utils';

export async function PATCH(request, { params }) {
  // Verify admin permission
  const authResult = verifyAdmin(request);
  if (!authResult.success) {
    return authResult;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { action, role, name, department, cell } = body;

    if (action === 'update_profile') {
      // Handle profile update
      if (!name || !department || !cell) {
        return NextResponse.json(
          { error: 'Please fill in all fields.' },
          { status: 400 }
        );
      }

      // Validate department
      // Department validation logic removed (free input allowed)
      /*
      const validDepartments = [ 'Digital Service Development Department', ... ];
      if (!validDepartments.includes(department)) { ... } 
      */

      // UUID validation
      if (!isValidUUID(id)) {
        return NextResponse.json(
          { error: 'Invalid user ID.' },
          { status: 400 }
        );
      }

      // Check whether user exists
      const userResult = await query('SELECT id FROM users WHERE id = $1', [id]);
      if (userResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found.' },
          { status: 404 }
        );
      }

      // Update user info (cell contains position, so save to employee_position_name column)
      const updateResult = await query(
        'UPDATE users SET name = $1, department = $2, employee_position_name = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [name, department, cell, id]
      );

      if (updateResult.rowCount === 0) {
        return NextResponse.json(
          { error: 'Failed to update user information.' },
          { status: 500 }
        );
      }

      // Also update user info in messages table (denormalized data sync)
      // Treat user info update as successful even if this fails
      try {
        await query(
          'UPDATE messages SET name = $1, department = $2, cell = $3 WHERE user_id = $4',
          [name, department, cell, id]
        );
      } catch (msgError) {
        logger.warn('Failed to sync messages table (ignored):', msgError.message);
      }

      return NextResponse.json({
        success: true,
        message: 'User information was updated successfully.',
      });
    }

    // Handle role change (existing logic)
    if (!role || !['user', 'admin', 'manager'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role.' },
        { status: 400 }
      );
    }

    // UUID validation
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid user ID.' },
        { status: 400 }
      );
    }

    // Check whether user exists
    const userResult = await query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    // Prevent removing your own admin privilege
    if (authResult.user.sub === id && role !== 'admin') {
      return NextResponse.json(
        { error: 'You cannot remove your own admin privilege.' },
        { status: 400 }
      );
    }

    // Update role
    const updateResult = await query(
      'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [role, id]
    );

    if (updateResult.rowCount === 0) {
      return NextResponse.json(
        { error: 'Failed to update user information.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User role was changed successfully.',
    });
  } catch (error) {
    logger.error('Failed to change user role:', error);
    return NextResponse.json(
      { error: 'Failed to change user role', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  // Verify admin permission
  const authResult = verifyAdmin(request);
  if (!authResult.success) {
    return authResult;
  }

  try {
    const { id } = await params;

    // UUID validation
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid user ID.' },
        { status: 400 }
      );
    }

    // Check whether user exists
    const userResult = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    // Prevent deleting yourself
    if (authResult.user.sub === id) {
      return NextResponse.json(
          { error: 'You cannot delete yourself.' },
        { status: 400 }
      );
    }

    // Delete user and related data in a PostgreSQL transaction
    await transaction(async (client) => {
      // 1. Delete user-related messages (messages table)
      await client.query('DELETE FROM messages WHERE user_id = $1', [id]);

      // 2. Delete user-related chat rooms (chat_history also auto-deleted by CASCADE)
      await client.query('DELETE FROM chat_rooms WHERE user_id = $1', [id]);

      // 3. Delete user-related chat files
      await client.query('DELETE FROM chat_files WHERE user_id = $1', [id]);

      // 4. Delete user (foreign-key related data also auto-deleted by CASCADE)
      const deleteResult = await client.query('DELETE FROM users WHERE id = $1', [id]);

      if (deleteResult.rowCount === 0) {
        throw new Error('Failed to delete user.');
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully.',
    });
  } catch (error) {
    logger.error('Failed to delete user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user', details: error.message },
      { status: 500 }
    );
  }
}
