import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/postgres';
import { createFirstAdminLocked } from '@/lib/first-admin-lock.mjs';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  authRateLimitConfig,
  consumeRateLimit,
  rateLimitKey,
} from '@/lib/security/rate-limit.mjs';
import { verifySetupToken } from '@/lib/security/setup-token.mjs';

const FIRST_ADMIN_RATE_KEY = rateLimitKey('auth:first-admin', 'global');

function adminExistsResponse() {
  return NextResponse.json(
    { error: 'An admin account already exists. Please request permissions from the existing admin.' },
    { status: 403 }
  );
}

export async function POST(request) {
  try {
    if (!verifySetupToken(
      request.headers.get('x-hanimo-setup-token'),
      process.env.HANIMO_SETUP_TOKEN
    )) {
      return NextResponse.json(
        { error: 'A valid setup token is required.' },
        { status: 403 }
      );
    }

    const rateConfig = authRateLimitConfig();
    const rate = consumeRateLimit(FIRST_ADMIN_RATE_KEY, {
      limit: rateConfig.identityLimit,
      windowMs: rateConfig.windowMs,
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many setup attempts. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      );
    }

    const { name, email, password } = await request.json();

    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return NextResponse.json(
        { error: 'Please enter name, email, and password.' },
        { status: 400 }
      );
    }

    if (name.length > 200 || email.length > 320 || password.length > 128) {
      return NextResponse.json(
        { error: 'One or more setup fields are too long.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const existingAdmin = await query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
      []
    );
    if (parseInt(existingAdmin.rows[0].count, 10) > 0) {
      return adminExistsResponse();
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.toLowerCase().trim();
    const hash = await bcryptjs.hash(password, 12);
    const creation = await transaction((client) => createFirstAdminLocked(client, {
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: hash,
    }));

    if (!creation) {
      throw new Error('Database transaction is unavailable.');
    }
    if (creation.outcome === 'admin-exists') {
      return adminExistsResponse();
    }
    if (creation.outcome === 'email-exists') {
      return NextResponse.json(
        { error: 'Email already registered.' },
        { status: 409 }
      );
    }
    const user = creation.user;

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authType: 'local',
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return NextResponse.json(
      { ok: true, message: 'Admin account created.', token },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[create-first-admin] Error:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Email already registered.' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'An error occurred while creating the admin account.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const adminCheck = await query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
      []
    );
    const adminCount = parseInt(adminCheck.rows[0].count, 10);

    return NextResponse.json({ hasAdmin: adminCount > 0 });
  } catch (error) {
    logger.error('[create-first-admin] GET error:', error);
    return NextResponse.json(
      { error: 'An error occurred while checking the database.' },
      { status: 500 }
    );
  }
}
