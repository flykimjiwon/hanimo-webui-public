import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';
import {
  getAllowedDepartments,
  normalizeDepartment,
} from '@/lib/departments.mjs';
import {
  authRateLimitKeys,
  authRateLimitConfig,
  consumeRateLimit,
  rateLimitKey,
  trustedClientAddress,
} from '@/lib/security/rate-limit.mjs';

const REGISTER_GLOBAL_RATE_KEY = rateLimitKey('auth:register', 'global');

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const { name, email, password, department, position } = body || {};

  // Validate input values
  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof department !== 'string' ||
    typeof position !== 'string' ||
    !name.trim() ||
    !email.trim() ||
    !password ||
    !department.trim() ||
    !position.trim()
  ) {
    return new Response(
      JSON.stringify({ error: 'Please fill in all fields.' }),
      {
        status: 400,
      }
    );
  }

  // Normalize email to lowercase (prevent duplicates)
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedDepartment = normalizeDepartment(department);
  const limitConfig = authRateLimitConfig();
  const globalLimit = consumeRateLimit(REGISTER_GLOBAL_RATE_KEY, {
    limit: 30,
    windowMs: limitConfig.windowMs,
  });
  if (!globalLimit.allowed) {
    return Response.json(
      { error: 'Too many sign-up attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(globalLimit.retryAfterSeconds) },
      }
    );
  }
  const clientAddress = trustedClientAddress(request);
  const { identityKey, clientKey } = authRateLimitKeys(
    'register',
    normalizedEmail,
    clientAddress
  );
  const identityLimit = consumeRateLimit(identityKey, {
    limit: 3,
    windowMs: limitConfig.windowMs,
  });
  const clientLimit = clientKey
    ? consumeRateLimit(clientKey, {
        limit: 30,
        windowMs: limitConfig.windowMs,
      })
    : { allowed: true, retryAfterSeconds: 0 };
  if (!identityLimit.allowed || !clientLimit.allowed) {
    const retryAfter = Math.max(
      identityLimit.retryAfterSeconds,
      clientLimit.retryAfterSeconds
    );
    return Response.json(
      { error: 'Too many sign-up attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Check whether department is valid.
  // Configurable via ALLOWED_DEPARTMENTS env (comma-separated). Generic defaults for OSS.
  const validDepartments = getAllowedDepartments();
  if (!validDepartments.includes(normalizedDepartment)) {
    return new Response(
      JSON.stringify({ error: 'Invalid department.' }),
      {
        status: 400,
      }
    );
  }

  try {
    // Pre-check duplicate emails (search by normalized email)
    const existingResult = await query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail]
    );

    if (existingResult.rows.length > 0) {
      return new Response(
        JSON.stringify({ error: 'Email already registered.' }),
        {
          status: 409,
        }
      );
    }

    // Hash password
    const hash = await bcryptjs.hash(password, 12);

    await query(
      `INSERT INTO users (name, email, password_hash, department, employee_position_name, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        name,
        normalizedEmail, // Store normalized email
        hash,
        normalizedDepartment,
        position,
        'user', // Default role
        new Date(),
      ]
    );
    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  } catch (e) {
    // Duplicate email (unique constraint) error
    if (e.code === '23505') {
      return new Response(
        JSON.stringify({ error: 'Email already registered.' }),
        {
          status: 409,
        }
      );
    }
    return new Response(
      JSON.stringify({ error: 'An error occurred during sign-up.' }),
      {
        status: 500,
      }
    );
  }
}
