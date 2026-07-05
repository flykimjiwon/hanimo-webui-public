import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Please enter name, email, and password.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const adminCheck = await query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
      []
    );
    const adminCount = parseInt(adminCheck.rows[0].count, 10);

    if (adminCount > 0) {
      return NextResponse.json(
        { error: 'An admin account already exists. Please request permissions from the existing admin.' },
        { status: 403 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'Email already registered.' },
        { status: 409 }
      );
    }

    const hash = await bcryptjs.hash(password, 12);

    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, auth_type, created_at)
       VALUES ($1, $2, $3, 'admin', 'local', CURRENT_TIMESTAMP)
       RETURNING id, email, name, role`,
      [name, normalizedEmail, hash]
    );

    const user = result.rows[0];

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
