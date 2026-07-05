import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';

// Ensure SSO logs table exists
async function ensureSSOLogsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sso_login_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_no VARCHAR(50),

        -- Request information
        request_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        client_ip VARCHAR(50),
        user_agent TEXT,
        browser_name VARCHAR(100),
        browser_version VARCHAR(50),
        os_name VARCHAR(100),
        os_version VARCHAR(50),
        device_type VARCHAR(50),

        -- SSO response information
        sso_result_code VARCHAR(10),
        sso_auth_result VARCHAR(50),
        sso_auth_result_message TEXT,
        sso_login_deny_yn VARCHAR(1),
        sso_transaction_id VARCHAR(100),
        sso_response_datetime TIMESTAMPTZ,
        sso_employee_name VARCHAR(100),
        sso_department_name VARCHAR(200),
        sso_company_code VARCHAR(10),
        sso_company_name VARCHAR(100),

        -- Processing result
        login_success BOOLEAN DEFAULT FALSE,
        error_type VARCHAR(50),
        error_message TEXT,
        error_detail TEXT,

        -- JWT issuance information
        jwt_issued BOOLEAN DEFAULT FALSE,
        jwt_expires_at TIMESTAMPTZ,

        -- Client error
        client_error_type VARCHAR(50),
        client_error_message TEXT,
        local_storage_available BOOLEAN,

        -- Metadata
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_sso_logs_employee_no ON sso_login_logs(employee_no)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sso_logs_created_at ON sso_login_logs(created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sso_logs_login_success ON sso_login_logs(login_success)`);
  } catch (error) {
    logger.error('[SSO Logs] Failed to create table:', error.message);
  }
}

// GET: Retrieve SSO log list (admin)
export async function GET(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload || tokenPayload.role !== 'admin') {
      return NextResponse.json({ error: 'Admin privileges required.' }, { status: 403 });
    }

    await ensureSSOLogsTable();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = Math.min(parseInt(searchParams.get('limit')) || 50, 100);
    const offset = (page - 1) * limit;
    const employeeNo = searchParams.get('employeeNo');
    const loginSuccess = searchParams.get('loginSuccess');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (employeeNo) {
      whereClause += ` AND employee_no ILIKE $${paramIndex}`;
      params.push(`%${employeeNo}%`);
      paramIndex++;
    }

    if (loginSuccess !== null && loginSuccess !== '') {
      whereClause += ` AND login_success = $${paramIndex}`;
      params.push(loginSuccess === 'true');
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(new Date(startDate));
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(new Date(endDate + 'T23:59:59'));
      paramIndex++;
    }

    // Query log list
    const logsResult = await query(
      `SELECT * FROM sso_login_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM sso_login_logs ${whereClause}`,
      params
    );

    // Statistics
    const statsResult = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE login_success = true) as success_count,
        COUNT(*) FILTER (WHERE login_success = false) as fail_count,
        COUNT(*) FILTER (WHERE sso_login_deny_yn = 'Y') as deny_count,
        COUNT(*) FILTER (WHERE client_error_type IS NOT NULL) as client_error_count
      FROM sso_login_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);

    return NextResponse.json({
      success: true,
      data: {
        logs: logsResult.rows,
        pagination: {
          page,
          limit,
          totalCount: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
        },
        stats: statsResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('[SSO Logs GET] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Record SSO logs (internal API)
export async function POST(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload || tokenPayload.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin privileges required.' },
        { status: 403 }
      );
    }

    await ensureSSOLogsTable();

    const body = await request.json();
    const {
      employeeNo,
      clientIP,
      userAgent,
      browserInfo,
      ssoResponse,
      loginSuccess,
      errorType,
      errorMessage,
      errorDetail,
      jwtIssued,
      jwtExpiresAt,
      clientError,
      localStorageAvailable,
    } = body;

    const result = await query(
      `INSERT INTO sso_login_logs (
        employee_no, client_ip, user_agent,
        browser_name, browser_version, os_name, os_version, device_type,
        sso_result_code, sso_auth_result, sso_auth_result_message, sso_login_deny_yn,
        sso_transaction_id, sso_response_datetime, sso_employee_name, sso_department_name,
        sso_company_code, sso_company_name,
        login_success, error_type, error_message, error_detail,
        jwt_issued, jwt_expires_at,
        client_error_type, client_error_message, local_storage_available
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING id`,
      [
        employeeNo,
        clientIP,
        userAgent,
        browserInfo?.browserName,
        browserInfo?.browserVersion,
        browserInfo?.osName,
        browserInfo?.osVersion,
        browserInfo?.deviceType,
        ssoResponse?.common?.resultCode,
        ssoResponse?.data?.authResult,
        ssoResponse?.data?.authResultMessage,
        ssoResponse?.data?.loginDenyYn,
        ssoResponse?.common?.transactionId,
        ssoResponse?.common?.responseDatetime ? new Date(ssoResponse.common.responseDatetime) : null,
        ssoResponse?.data?.employeeName,
        ssoResponse?.data?.departmentName,
        ssoResponse?.data?.companyCode,
        ssoResponse?.data?.companyName,
        loginSuccess,
        errorType,
        errorMessage,
        errorDetail,
        jwtIssued,
        jwtExpiresAt ? new Date(jwtExpiresAt) : null,
        clientError?.type,
        clientError?.message,
        localStorageAvailable,
      ]
    );

    return NextResponse.json({ success: true, logId: result.rows[0].id });
  } catch (error) {
    logger.error('[SSO Logs POST] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
