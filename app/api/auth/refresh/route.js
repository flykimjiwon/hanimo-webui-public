import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '@/lib/postgres';
import { JWT_SECRET } from '@/lib/config';
import { authRateLimitConfig, consumeRateLimit, rateLimitKey } from '@/lib/security/rate-limit.mjs';
import { shouldUseSecureAuthCookie } from '@/lib/security/auth-cookie-policy.mjs';

const ACCESS_TOKEN_EXPIRES = '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

/**
 * POST /api/auth/refresh
 * Issue new access token + refresh token (rotation) using refresh token in httpOnly cookie
 */
export async function POST(request) {
  try {
    const refreshToken = request.cookies.get('refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
         { error: 'Refresh token is missing.', errorType: 'no_refresh_token' },
        { status: 401 }
      );
    }

    // Validate refresh token in DB
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const limitConfig = authRateLimitConfig();
    const refreshLimit = consumeRateLimit(rateLimitKey('auth:refresh', tokenHash), {
      limit: 60,
      windowMs: limitConfig.windowMs,
    });
    if (!refreshLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many refresh attempts.', errorType: 'rate_limited' },
        {
          status: 429,
          headers: { 'Retry-After': String(refreshLimit.retryAfterSeconds) },
        }
      );
    }
    const tokenResult = await query(
      `SELECT rt.*, u.id as uid, u.email, u.name, u.department, u.cell, u.role,
              u.employee_no, u.auth_type
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked = FALSE
         AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      // Expired or revoked token - clear cookie
      const response = NextResponse.json(
        { error: 'Refresh token is expired or invalid.', errorType: 'refresh_expired' },
        { status: 401 }
      );
      const secureCookie = shouldUseSecureAuthCookie(request);
      response.cookies.set('refresh_token', '', {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
        maxAge: 0,
        path: '/api/auth',
      });
      response.cookies.set('token', '', {
        httpOnly: true,
        secure: secureCookie,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      });
      return response;
    }

    const tokenRow = tokenResult.rows[0];
    const userId = tokenRow.uid;

    // Revoke existing refresh token
    await query(
      `UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );

    // Generate new refresh token
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;
    const userAgent = request.headers.get('user-agent') || null;

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, newTokenHash, newExpiresAt, ipAddress, userAgent]
    );

    // Issue new access token
    const newAccessToken = jwt.sign(
      {
        sub: userId,
        email: tokenRow.email,
        name: tokenRow.name,
        department: tokenRow.department,
        cell: tokenRow.cell,
        role: tokenRow.role || 'user',
        employeeNo: tokenRow.employee_no,
        authType: tokenRow.auth_type,
      },
      JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES }
    );

    // Update last_active_at (refresh means active session)
    await query(
      `UPDATE users SET last_active_at = NOW()
       WHERE id = $1
         AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '10 minutes')`,
      [userId]
    );

    const response = NextResponse.json({ token: newAccessToken });
    const secureCookie = shouldUseSecureAuthCookie(request);
    response.cookies.set('token', newAccessToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });
    response.cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60,
      path: '/api/auth',
    });
    return response;

  } catch (error) {
    logger.error('[Auth Refresh] Error:', error);
    return NextResponse.json(
      { error: 'Server error occurred.', errorType: 'server_error' },
      { status: 500 }
    );
  }
}
