import logger from '@/lib/logger';
import { query } from '@/lib/postgres';

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400,
      });
    }

    // Normalize email to lowercase (prevent duplicates)
    const normalizedEmail = email.toLowerCase().trim();

    const result = await query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [normalizedEmail]
    );
    const existingUser = result.rows[0] || null;

    return new Response(
      JSON.stringify({
        available: !existingUser,
        message: existingUser
          ? 'Email already registered.'
          : 'Email is available.',
      }),
      {
        status: 200,
      }
    );
  } catch (error) {
    logger.error('Email validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Server error occurred.' }),
      {
        status: 500,
      }
    );
  }
}
