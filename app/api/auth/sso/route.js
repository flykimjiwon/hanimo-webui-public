import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
// TODO: Replace with your OAuth provider URL
const OAUTH_URL = process.env.OAUTH_URL || 'https://oauth.example.com';
const OAUTH_COMPANY_CODE = process.env.OAUTH_COMPANY_CODE || 'ORG';
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_AUTH_PATH = process.env.OAUTH_AUTH_PATH || '/oauth/authorize';

// SHA256 hash function (hex)
async function sha256Hex(text) {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Ensure SSO log table exists
async function ensureSSOLogsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS sso_login_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_no VARCHAR(50),
        request_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        client_ip VARCHAR(50),
        user_agent TEXT,
        browser_name VARCHAR(100),
        browser_version VARCHAR(50),
        os_name VARCHAR(100),
        os_version VARCHAR(50),
        device_type VARCHAR(50),
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
        login_success BOOLEAN DEFAULT FALSE,
        error_type VARCHAR(50),
        error_message TEXT,
        error_detail TEXT,
        jwt_issued BOOLEAN DEFAULT FALSE,
        jwt_expires_at TIMESTAMPTZ,
        client_error_type VARCHAR(50),
        client_error_message TEXT,
        local_storage_available BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    logger.warn('[SSO] Failed to create log table (ignored):', error.message);
  }
}

// Record SSO log
async function logSSOAttempt(logData) {
  try {
    await ensureSSOLogsTable();
    await query(
      `INSERT INTO sso_login_logs (
        employee_no, client_ip, user_agent,
        browser_name, browser_version, os_name, os_version, device_type,
        sso_result_code, sso_auth_result, sso_auth_result_message, sso_login_deny_yn,
        sso_transaction_id, sso_response_datetime, sso_employee_name, sso_department_name,
        sso_company_code, sso_company_name,
        login_success, error_type, error_message, error_detail,
        jwt_issued, jwt_expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        logData.employeeNo,
        logData.clientIP,
        logData.userAgent,
        logData.browserName,
        logData.browserVersion,
        logData.osName,
        logData.osVersion,
        logData.deviceType,
        logData.ssoResultCode,
        logData.ssoAuthResult,
        logData.ssoAuthResultMessage,
        logData.ssoLoginDenyYn,
        logData.ssoTransactionId,
        logData.ssoResponseDatetime,
        logData.ssoEmployeeName,
        logData.ssoDepartmentName,
        logData.ssoCompanyCode,
        logData.ssoCompanyName,
        logData.loginSuccess,
        logData.errorType,
        logData.errorMessage,
        logData.errorDetail,
        logData.jwtIssued,
        logData.jwtExpiresAt,
      ]
    );
  } catch (error) {
    logger.error('[SSO] Failed to write log:', error.message);
  }
}

async function callOAuthProvider(employeeNo, hashedPassword) {
  const endpoint = `${OAUTH_URL}${OAUTH_AUTH_PATH}`;

  const payload = {
    common: {
      companyCode: OAUTH_COMPANY_CODE,
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      employeeNo,
    },
    data: {
      loginPassword: hashedPassword,
    },
  };

  logger.info('[SSO] Calling OAuth provider endpoint:', endpoint);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  logger.info('[SSO] OAuth provider response:', {
    resultCode: json.common?.resultCode,
    authResult: json.data?.authResult,
  });

  return json;
}

// Find user by employee number
async function findUserByEmployeeNo(employeeNo) {
  const result = await query(
    'SELECT * FROM users WHERE employee_no = $1',
    [employeeNo]
  );
  return result.rows[0] || null;
}

// Create new SSO user
async function createSSOUser(ssoData, ssoCommon, hashedPassword) {
  const result = await query(
    `INSERT INTO users (
      email, password_hash, name, department, cell, role, auth_type,
      employee_no, employee_id, sso_user_id, company_code, company_name, company_id,
      department_id, department_no, department_location,
      employee_position_name, employee_class, employee_security_level,
      lang, login_deny_yn,
      auth_result, auth_result_message, auth_event_id,
      sso_result_code, sso_response_datetime, sso_transaction_id,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
    RETURNING *`,
    [
      ssoData.companyEmail,                    // email
      hashedPassword,                          // password_hash (SHA256)
      ssoData.employeeName,                    // name
      ssoData.departmentName,                  // department
      '',                                      // cell (Cell/Team info not provided by SSO)
      'user',                                  // role
      'sso',                                   // auth_type
      ssoData.employeeNo,                      // employee_no
      ssoData.employeeId,                      // employee_id
      ssoData.userId,                          // sso_user_id
      ssoData.companyCode,                     // company_code
      ssoData.companyName,                     // company_name
      ssoData.companyId,                       // company_id
      ssoData.departmentId,                    // department_id
      ssoData.departmentNo,                    // department_no
      ssoData.departmentLocation,              // department_location
      ssoData.employeePositionName,            // employee_position_name
      ssoData.employeeClass,                   // employee_class
      ssoData.employeeSecurityLevel,           // employee_security_level
      ssoData.lang || 'en',                    // lang
      ssoData.loginDenyYn || 'N',              // login_deny_yn
      ssoData.authResult,                      // auth_result
      ssoData.authResultMessage || '',         // auth_result_message
      ssoData.authEventId,                     // auth_event_id
      ssoCommon.resultCode,                    // sso_result_code
      ssoCommon.responseDatetime ? new Date(ssoCommon.responseDatetime) : null, // sso_response_datetime
      ssoCommon.transactionId,                 // sso_transaction_id
      new Date(),                              // created_at
    ]
  );
  return result.rows[0];
}

// Record change history
async function logUserChanges(userId, employeeNo, oldData, newData) {
  const fieldsToCompare = [
    { db: 'name', sso: 'employeeName', label: 'Name' },
    { db: 'department', sso: 'departmentName', label: 'Department' },
    { db: 'company_name', sso: 'companyName', label: 'Company name' },
    { db: 'department_id', sso: 'departmentId', label: 'Department ID' },
    { db: 'department_no', sso: 'departmentNo', label: 'Department number' },
    { db: 'employee_position_name', sso: 'employeePositionName', label: 'Position' },
    { db: 'employee_class', sso: 'employeeClass', label: 'Employee type' },
    { db: 'employee_security_level', sso: 'employeeSecurityLevel', label: 'Security level' },
  ];

  const changes = [];

  for (const field of fieldsToCompare) {
    const oldValue = oldData[field.db];
    const newValue = newData[field.sso];
    const oldStr = oldValue?.toString() || '';
    const newStr = newValue?.toString() || '';

    if (oldStr !== newStr) {
      changes.push({
        field_name: field.db,
        old_value: oldStr || null,
        new_value: newStr || null,
      });
      logger.info(`[SSO] Change detected - ${field.label}: "${oldStr}" → "${newStr}"`);
    }
  }

  if (changes.length > 0) {
    for (const change of changes) {
      try {
        await query(
          `INSERT INTO user_change_logs (user_id, employee_no, field_name, old_value, new_value, change_type, change_source)
           VALUES ($1, $2, $3, $4, $5, 'update', 'sso')`,
          [userId, employeeNo, change.field_name, change.old_value, change.new_value]
        );
      } catch (err) {
        logger.warn('[SSO] Failed to write change history (ignored):', err.message);
      }
    }
    logger.info(`[SSO] Recorded ${changes.length} change history entries`);
  }

  return changes;
}

// Update SSO user information
async function updateSSOUser(userId, ssoData, ssoCommon, hashedPassword, existingUser) {
  if (existingUser) {
    await logUserChanges(userId, ssoData.employeeNo, existingUser, ssoData);
  }

  const result = await query(
    `UPDATE users SET
      password_hash = $2,
      name = $3,
      department = $4,
      company_name = $5,
      department_id = $6,
      department_no = $7,
      department_location = $8,
      employee_position_name = $9,
      employee_class = $10,
      employee_security_level = $11,
      lang = $12,
      login_deny_yn = $13,
      auth_result = $14,
      auth_result_message = $15,
      auth_event_id = $16,
      sso_result_code = $17,
      sso_response_datetime = $18,
      sso_transaction_id = $19,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *`,
    [
      userId,
      hashedPassword,
      ssoData.employeeName,
      ssoData.departmentName,
      ssoData.companyName,
      ssoData.departmentId,
      ssoData.departmentNo,
      ssoData.departmentLocation,
      ssoData.employeePositionName,
      ssoData.employeeClass,
      ssoData.employeeSecurityLevel,
      ssoData.lang || 'en',
      ssoData.loginDenyYn || 'N',
      ssoData.authResult,
      ssoData.authResultMessage || '',
      ssoData.authEventId,
      ssoCommon.resultCode,
      ssoCommon.responseDatetime ? new Date(ssoCommon.responseDatetime) : null,
      ssoCommon.transactionId,
    ]
  );
  return result.rows[0];
}

// Extract client IP
function getClientIP(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request) {
  const clientIP = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';

  // Initialize log data
  const logData = {
    employeeNo: null,
    clientIP,
    userAgent,
    browserName: null,
    browserVersion: null,
    osName: null,
    osVersion: null,
    deviceType: null,
    ssoResultCode: null,
    ssoAuthResult: null,
    ssoAuthResultMessage: null,
    ssoLoginDenyYn: null,
    ssoTransactionId: null,
    ssoResponseDatetime: null,
    ssoEmployeeName: null,
    ssoDepartmentName: null,
    ssoCompanyCode: null,
    ssoCompanyName: null,
    loginSuccess: false,
    errorType: null,
    errorMessage: null,
    errorDetail: null,
    jwtIssued: false,
    jwtExpiresAt: null,
  };

  try {
    const body = await request.json();
    const { employeeNo, password, browserInfo } = body;

    logData.employeeNo = employeeNo;

    // Save browser info
    if (browserInfo) {
      logData.browserName = browserInfo.browserName;
      logData.browserVersion = browserInfo.browserVersion;
      logData.osName = browserInfo.osName;
      logData.osVersion = browserInfo.osVersion;
      logData.deviceType = browserInfo.deviceType;
    }

    // Validate input
    if (!employeeNo || !password) {
      logData.errorType = 'VALIDATION_ERROR';
      logData.errorMessage = 'Please enter employee number and password.';
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'Please enter employee number and password.', errorCode: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    // SHA256-hash password
    const hashedPassword = await sha256Hex(password);

    let ssoResponse;
    try {
      ssoResponse = await callOAuthProvider(employeeNo, hashedPassword);
    } catch (ssoError) {
      logData.errorType = 'SSO_CONNECTION_ERROR';
      logData.errorMessage = 'Failed to connect to SSO server.';
      logData.errorDetail = ssoError.message;
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'Failed to connect to SSO server.', errorCode: 'SSO_CONNECTION_ERROR', detail: ssoError.message },
        { status: 502 }
      );
    }

    // Save SSO response data in log
    logData.ssoResultCode = ssoResponse.common?.resultCode;
    logData.ssoAuthResult = ssoResponse.data?.authResult;
    logData.ssoAuthResultMessage = ssoResponse.data?.authResultMessage;
    logData.ssoLoginDenyYn = ssoResponse.data?.loginDenyYn;
    logData.ssoTransactionId = ssoResponse.common?.transactionId;
    logData.ssoResponseDatetime = ssoResponse.common?.responseDatetime ? new Date(ssoResponse.common.responseDatetime) : null;
    logData.ssoEmployeeName = ssoResponse.data?.employeeName;
    logData.ssoDepartmentName = ssoResponse.data?.departmentName;
    logData.ssoCompanyCode = ssoResponse.data?.companyCode;
    logData.ssoCompanyName = ssoResponse.data?.companyName;

    // Validate SSO response
    const resultCode = ssoResponse.common?.resultCode;

    if (resultCode === '400') {
      logData.errorType = 'SSO_SYSTEM_ERROR';
      logData.errorMessage = 'An SSO system error occurred.';
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'An SSO system error occurred. Please try again shortly.', errorCode: 'SSO_SYSTEM_ERROR' },
        { status: 502 }
      );
    }

    if (resultCode === '500') {
      logData.errorType = 'SSO_SERVER_ERROR';
      logData.errorMessage = 'SSO Server error occurred.';
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'SSO server error occurred. Please try again shortly.', errorCode: 'SSO_SERVER_ERROR' },
        { status: 502 }
      );
    }

    if (resultCode !== '200') {
      logData.errorType = 'SSO_UNKNOWN_RESPONSE';
      logData.errorMessage = 'Received an unknown response from the SSO server.';
      logData.errorDetail = `resultCode: ${resultCode}`;
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'Received an unknown response from the SSO server.', errorCode: 'SSO_UNKNOWN_RESPONSE' },
        { status: 502 }
      );
    }

    // Handle authResult branches
    const authResult = ssoResponse.data?.authResult;
    const authResultMessage = ssoResponse.data?.authResultMessage || '';

    if (authResult !== 'SUCCESS') {
      const errorMessage = authResultMessage || 'Authentication failed. Please check employee number or password.';
      logData.errorType = 'AUTH_FAILED';
      logData.errorMessage = errorMessage;
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: errorMessage, errorCode: 'AUTH_FAILED', authResult },
        { status: 401 }
      );
    }

    // Check login denial
    if (ssoResponse.data?.loginDenyYn === 'Y') {
      logData.errorType = 'LOGIN_DENIED';
      logData.errorMessage = 'This account is denied from logging in.';
      await logSSOAttempt(logData);
      return NextResponse.json(
        { error: 'This account is denied from logging in. Please contact an administrator.', errorCode: 'LOGIN_DENIED' },
        { status: 403 }
      );
    }

    const ssoData = ssoResponse.data;
    const ssoCommon = ssoResponse.common;

    // Find existing user
    let user = await findUserByEmployeeNo(ssoData.employeeNo);

    if (!user) {
      logger.info('[SSO] Creating new user:', ssoData.employeeNo);
      user = await createSSOUser(ssoData, ssoCommon, hashedPassword);
    } else {
      logger.info('[SSO] Updating existing user:', ssoData.employeeNo);
      const existingUser = user;
      user = await updateSSOUser(user.id, ssoData, ssoCommon, hashedPassword, existingUser);
    }

    // Update last_login_at
    await query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Issue JWT token
    const jwtExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour later
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        department: user.department,
        cell: user.cell,
        role: user.role || 'user',
        employeeNo: user.employee_no,
        authType: 'sso',
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Record success log
    logData.loginSuccess = true;
    logData.jwtIssued = true;
    logData.jwtExpiresAt = jwtExpiresAt;
    await logSSOAttempt(logData);

    logger.info('[SSO] Login successful:', {
      employeeNo: user.employee_no,
      name: user.name,
    });

    // Issue refresh token (30 days) -> httpOnly cookie
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const rtHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const rtExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || null;
    const userAgent = request.headers.get('user-agent') || null;

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, rtHash, rtExpiresAt, ipAddress, userAgent]
    ).catch((err) => {
      logger.warn('[SSO] Failed to save refresh token (skip):', err.message);
    });

    const jsonResponse = NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        department: user.department,
        position: user.employee_position_name,
        employeeNo: user.employee_no,
      },
    });
    jsonResponse.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });
    jsonResponse.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/auth',
    });
    return jsonResponse;

  } catch (error) {
    logger.error('[SSO] Login error:', error);
    logData.errorType = 'SERVER_ERROR';
    logData.errorMessage = 'Server error occurred.';
    logData.errorDetail = error.message;
    await logSSOAttempt(logData);
    return NextResponse.json(
      { error: 'Server error occurred. Please try again shortly.', errorCode: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
