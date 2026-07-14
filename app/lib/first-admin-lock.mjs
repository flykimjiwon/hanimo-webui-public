export const FIRST_ADMIN_LOCK = Object.freeze([1212239433, 1094997070]);

export async function lockFirstAdminTransaction(client) {
  await client.query(
    'SELECT pg_advisory_xact_lock($1, $2)',
    FIRST_ADMIN_LOCK
  );
}

export async function createFirstAdminLocked(client, candidate) {
  await lockFirstAdminTransaction(client);
  const adminCheck = await client.query(
    "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    []
  );
  if (Number.parseInt(adminCheck.rows[0].count, 10) > 0) {
    return { outcome: 'admin-exists' };
  }

  const existingUser = await client.query(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [candidate.email]
  );
  if (existingUser.rows.length > 0) return { outcome: 'email-exists' };

  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, role, auth_type, created_at)
     VALUES ($1, $2, $3, 'admin', 'local', CURRENT_TIMESTAMP)
     RETURNING id, email, name, role`,
    [candidate.name, candidate.email, candidate.passwordHash]
  );
  return { outcome: 'created', user: result.rows[0] };
}
