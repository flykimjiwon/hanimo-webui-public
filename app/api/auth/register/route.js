import { query } from '@/lib/postgres';
import bcryptjs from 'bcryptjs';

export async function POST(request) {
  const { name, email, password, department, position } = await request.json();

  // Validate input values
  if (!name || !email || !password || !department || !position) {
    return new Response(
      JSON.stringify({ error: 'Please fill in all fields.' }),
      {
        status: 400,
      }
    );
  }

  // Normalize email to lowercase (prevent duplicates)
  const normalizedEmail = email.toLowerCase().trim();

  // Check whether department is valid.
  // Configurable via ALLOWED_DEPARTMENTS env (comma-separated). Generic defaults for OSS.
  const validDepartments = process.env.ALLOWED_DEPARTMENTS
    ? process.env.ALLOWED_DEPARTMENTS.split(',').map((d) => d.trim()).filter(Boolean)
    : ['Engineering', 'Product', 'Design', 'Operations', 'Other'];
  if (!validDepartments.includes(department)) {
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
        department,
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
