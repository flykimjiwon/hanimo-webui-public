import logger from '@/lib/logger';
import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { runAutoMigration } from '@/lib/autoMigrate';
import { NextResponse } from 'next/server';
import {
  authRateLimitKeys,
  authRateLimitConfig,
  clearRateLimit,
  consumeRateLimit,
  trustedClientAddress,
} from '@/lib/security/rate-limit.mjs';

const DUMMY_PASSWORD_HASH = '$2a$12$W8M010AppXqOOgQYombubePwbUa2HLaUJW.TmKlkJ2viA1t1peCRi';
import { shouldUseSecureAuthCookie } from '@/lib/security/auth-cookie-policy.mjs';

function rateLimited(retryAfterSeconds) {
  return NextResponse.json(
    { error: 'Too many login attempts. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

export async function POST(request) {
  let credentials;
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid login request.' }, { status: 400 });
  }
  const { email, password } = credentials || {};

  // Normalize email to lowercase (prevent duplicates)
  const normalizedEmail = email?.toLowerCase().trim();
  if (!normalizedEmail || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const limitConfig = authRateLimitConfig();
  const clientAddress = trustedClientAddress(request);
  const { identityKey, identityClientKey, clientKey } = authRateLimitKeys(
    'login',
    normalizedEmail,
    clientAddress
  );
  const identityLimit = consumeRateLimit(identityKey, {
    limit: clientAddress
      ? limitConfig.distributedIdentityLimit
      : limitConfig.identityLimit,
    windowMs: limitConfig.windowMs,
  });
  const identityClientLimit = identityClientKey
    ? consumeRateLimit(identityClientKey, {
        limit: limitConfig.identityLimit,
        windowMs: limitConfig.windowMs,
      })
    : { allowed: true, retryAfterSeconds: 0 };
  const clientLimit = clientKey
    ? consumeRateLimit(clientKey, {
        limit: limitConfig.clientLimit,
        windowMs: limitConfig.windowMs,
      })
    : { allowed: true, retryAfterSeconds: 0 };
  if (!identityLimit.allowed || !identityClientLimit.allowed || !clientLimit.allowed) {
    return rateLimited(Math.max(
      identityLimit.retryAfterSeconds,
      identityClientLimit.retryAfterSeconds,
      clientLimit.retryAfterSeconds
    ));
  }

  const result = await query(
    'SELECT id, email, password_hash, name, department, cell, role, auth_type FROM users WHERE email = $1',
    [normalizedEmail]
  );

  const user = result.rows[0] || null;
  const match = await bcryptjs.compare(
    password,
    user?.password_hash || DUMMY_PASSWORD_HASH
  );
  if (!user || user.auth_type === 'sso' || !user.password_hash || !match) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  clearRateLimit(identityKey);
  if (identityClientKey) clearRateLimit(identityClientKey);

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
  const secureCookie = shouldUseSecureAuthCookie(request);
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: 60 * 60,
    path: '/',
  });
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/api/auth',
  });
  return response;
}
