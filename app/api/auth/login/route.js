import logger from '@/lib/logger';
import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { runAutoMigration } from '@/lib/autoMigrate';
import { NextResponse } from 'next/server';


export async function POST(request) {
  const { email, password } = await request.json();

  // Normalize email to lowercase (prevent duplicates)
  const normalizedEmail = email?.toLowerCase().trim();

  const result = await query(
    'SELECT id, email, password_hash, name, department, cell, role, auth_type FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Email does not exist.' }),
      {
        status: 401,
      }
    );
  }

  const user = result.rows[0];

  // SSO users cannot use regular login
  if (user.auth_type === 'sso') {
    return new Response(
      JSON.stringify({ error: 'This is an SSO account. Please use SSO login (/sso).' }),
      {
        status: 401,
      }
    );
  }

  // If password_hash is missing (abnormal case)
  if (!user.password_hash) {
    return new Response(
      JSON.stringify({ error: 'Password is not set for this account. Please contact an administrator.' }),
      {
        status: 401,
      }
    );
  }

  const match = await bcryptjs.compare(password, user.password_hash);
  if (!match) {
    return new Response(
      JSON.stringify({ error: 'Incorrect password.' }),
      {
        status: 401,
      }
    );
  }

  // Update last login time
  await query(
    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
    [user.id]
  );

  // On admin login, automatically run initial schema + migration (background, no login response delay)
  if (user.role === 'admin') {
    runAutoMigration().catch((err) =>
      logger.warn('[AutoMigrate] Background task failed:', err.message)
    );
  }


  // Issue JWT (secret key is stored in .env) - 1-hour session (auto-extended via refresh token)
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      department: user.department,
      cell: user.cell,
      role: user.role || 'user',
      authType: 'local',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Issue refresh token (30 days) -> httpOnly cookie
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || null;
  const userAgent = request.headers.get('user-agent') || null;

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenHash, expiresAt, ipAddress, userAgent]
  ).catch((err) => {
    logger.warn('[Login] Failed to store refresh token (skip):', err.message);
  });

  const response = NextResponse.json({ token });
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/api/auth',
  });
  return response;
}
