import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

async function ensureScreensSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS screens (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      definition JSONB DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      share_id TEXT UNIQUE,
      access_type TEXT DEFAULT 'authenticated',
      access_password_hash TEXT,
      allowed_users TEXT[],
      view_count INTEGER DEFAULT 0,
      last_accessed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`ALTER TABLE screens ALTER COLUMN user_id TYPE TEXT USING user_id::text`).catch(() => {});
  await query(`
    ALTER TABLE screens
    ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS definition JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'authenticated',
    ADD COLUMN IF NOT EXISTS access_password_hash TEXT,
    ADD COLUMN IF NOT EXISTS allowed_users TEXT[],
    ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS screen_access_logs (
      id BIGSERIAL PRIMARY KEY,
      screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
      user_id TEXT,
      client_ip VARCHAR(255),
      action VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_screens_user_id ON screens(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_screens_share_id ON screens(share_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_screen_access_logs_screen_id ON screen_access_logs(screen_id)');
}

// GET: 내 화면 목록
export async function GET(request) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  await ensureScreensSchema();

  const result = await query(
    `SELECT id, name, description, status, share_id, access_type, view_count, created_at, updated_at
     FROM screens WHERE user_id = $1 ORDER BY updated_at DESC`,
    [auth.user.id]
  );

  return NextResponse.json({ screens: result.rows });
}

// POST: 새 화면 생성
export async function POST(request) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  await ensureScreensSchema();

  const { name, description } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '이름을 입력하세요' }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO screens (user_id, name, description, definition, status)
     VALUES ($1, $2, $3, $4, 'draft') RETURNING *`,
    [
      auth.user.id,
      name.trim(),
      description || '',
      JSON.stringify({ components: [], endpoints: [], theme: {} }),
    ]
  );

  return NextResponse.json({ screen: result.rows[0] }, { status: 201 });
}
