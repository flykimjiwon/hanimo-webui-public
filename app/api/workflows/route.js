import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

// GET: my workflow list
export async function GET(request) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const result = await query(
    `SELECT id, name, description, status, is_published, version, created_at, updated_at
     FROM workflows WHERE user_id = $1 ORDER BY updated_at DESC`,
    [auth.user.id]
  );

  return NextResponse.json({ workflows: result.rows });
}

// POST: create new workflow
export async function POST(request) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { name, description } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: '이름을 입력하세요' }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO workflows (user_id, name, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [auth.user.id, name.trim(), description || '']
  );

  return NextResponse.json({ workflow: result.rows[0] }, { status: 201 });
}
