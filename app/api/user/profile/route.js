import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';
import { isValidUUID } from '@/lib/utils';
import {
  createAuthError,
  createValidationError,
  createNotFoundError,
  createServerError,
} from '@/lib/errorHandler';

export async function GET(request) {
  try {
    // Token validation
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // UUID validation
    if (!isValidUUID(payload.sub)) {
      return createValidationError('Invalid user ID.');
    }

    // Fetch user information (excluding password)
    const result = await query(
      'SELECT id, name, email, department, cell, role, created_at FROM users WHERE id = $1 LIMIT 1',
      [payload.sub]
    );

    if (result.rows.length === 0) {
      return createNotFoundError('User not found.');
    }

    const user = result.rows[0];

    return NextResponse.json({
      success: true,
      user: {
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        department: user.department,
        cell: user.cell,
        role: user.role,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch user information:', error);
    return createServerError(error, 'Failed to fetch user information');
  }
}

export async function PATCH(request) {
  try {
    // Token validation
    const payload = verifyToken(request);
    if (!payload) {
      return createAuthError('Authentication required.');
    }

    const body = await request.json();
    const { name, department, cell, currentPassword, newPassword } = body;

    // Input validation
    if (!name || !department || !cell) {
      return createValidationError('Please fill in all fields.');
    }

    // Check valid department
    const validDepartments = [
      'Digital Service Development Department',
      'Global Service Development Department',
      'Financial Service Development Department',
      'Information Service Development Department',
      'Tech Innovation Unit',
      'Other Department',
    ];

    if (!validDepartments.includes(department)) {
      return createValidationError('Invalid department.');
    }

    // UUID validation
    if (!isValidUUID(payload.sub)) {
      return createValidationError('Invalid user ID.');
    }

    // Fetch current user
    const userResult = await query(
      'SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1',
      [payload.sub]
    );

    if (userResult.rows.length === 0) {
      return createNotFoundError('User not found.');
    }

    const user = userResult.rows[0];

    // Prepare data to update
    const updateFields = [];
    const updateParams = [];
    let paramIndex = 1;

    updateFields.push(`name = $${paramIndex++}`);
    updateParams.push(name);

    updateFields.push(`department = $${paramIndex++}`);
    updateParams.push(department);

    updateFields.push(`cell = $${paramIndex++}`);
    updateParams.push(cell);

    updateFields.push(`updated_at = $${paramIndex++}`);
    updateParams.push(new Date());

    // If password change is requested
    if (currentPassword && newPassword) {
      // Check passwordHash field
      const passwordHash = user.password_hash;

      if (!passwordHash) {
        return createServerError(
          null,
          'User password information not found.'
        );
      }

      // Verify current password
      const isCurrentPasswordValid = await bcryptjs.compare(
        currentPassword,
        passwordHash
      );
      if (!isCurrentPasswordValid) {
        return createValidationError('Current password does not match.');
      }

      // Validate new password
      if (newPassword.length < 6) {
        return createValidationError(
          'New password must be at least 6 characters long.'
        );
      }

      // Hash new password
      const newPasswordHash = await bcryptjs.hash(newPassword, 12);
      updateFields.push(`password_hash = $${paramIndex++}`);
      updateParams.push(newPasswordHash);
    }

    // Update user information
    updateParams.push(payload.sub);
    const updateResult = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateParams
    );

    // In PostgreSQL, rowCount can be 0 even when values are unchanged
    // Therefore, only check whether the update query was executed
    if (updateResult.rowCount === 0) {
      return createNotFoundError('User not found.');
    }

    // After normalization: messages table has no user info, so no update needed
    // User info is fetched via JOIN using user_id

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully.',
    });
  } catch (error) {
    logger.error('Failed to update profile:', error);
    logger.error('Error stack:', error.stack);
    return createServerError(error, 'Failed to update profile');
  }
}
