import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

export async function GET(request) {
  // Check admin privileges
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    // Extract URL parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const search = searchParams.get('search') || '';
    const department = searchParams.get('department') || '';
    const authType = searchParams.get('authType') || '';
    const role = searchParams.get('role') || '';
    const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100); // Users per page (max 100)

    // Build search conditions
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (department) {
      whereConditions.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }

    if (authType) {
      whereConditions.push(`auth_type = $${paramIndex}`);
      params.push(authType);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Query total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Ensure last_active_at column exists (for environments without migration)
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP`).catch(() => {});

    // Query user list
    const offset = (page - 1) * limit;
    const usersResult = await query(
      `SELECT
        id, email, name, department, cell, role, last_login_at, last_active_at, created_at, updated_at,
        auth_type, employee_no, employee_id, company_name, company_code, company_id,
        department_id, department_no, department_location,
        employee_position_name, employee_class, employee_security_level,
        lang, login_deny_yn,
        sso_response_datetime, sso_user_id, auth_event_id
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Convert PostgreSQL UUID to string and map detailed fields
    const formattedUsers = usersResult.rows.map((user) => ({
      _id: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      cell: user.cell,
      role: user.role,
      lastLoginAt: user.last_login_at,
      lastActiveAt: user.last_active_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,

      // Additional details
      authType: user.auth_type || 'local',
      employeeNo: user.employee_no,
      employeeId: user.employee_id,
      companyName: user.company_name,
      companyCode: user.company_code,
      companyId: user.company_id,
      departmentId: user.department_id,
      departmentNo: user.department_no,
      departmentLocation: user.department_location,
      employeePositionName: user.employee_position_name,
      employeeClass: user.employee_class,
      employeeSecurityLevel: user.employee_security_level,
      lang: user.lang,
      loginDenyYn: user.login_deny_yn,
      ssoResponseDatetime: user.sso_response_datetime,
      ssoUserId: user.sso_user_id,
      authEventId: user.auth_event_id,
    }));

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch user list:', error);
    return createServerError(error, 'Failed to fetch user list');
  }
}
