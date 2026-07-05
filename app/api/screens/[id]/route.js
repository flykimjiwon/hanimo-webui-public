import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import crypto from 'crypto';

// GET: 화면 상세 조회
export async function GET(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `SELECT * FROM screens WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ screen: result.rows[0] });
}

// PUT: 화면 수정
export async function PUT(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description, definition, status, access_type } = body;

  // 소유권 확인
  const existing = await query(`SELECT id FROM screens WHERE id = $1 AND user_id = $2`, [id, auth.user.id]);
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  const setClauses = [];
  const queryParams = [];
  let paramIdx = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    queryParams.push(name);
  }
  if (description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    queryParams.push(description);
  }
  if (definition !== undefined) {
    setClauses.push(`definition = $${paramIdx++}`);
    queryParams.push(JSON.stringify(definition));
  }
  if (access_type !== undefined) {
    setClauses.push(`access_type = $${paramIdx++}`);
    queryParams.push(access_type);
  }
  if (status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`);
    queryParams.push(status);
    // 게시 상태로 바꿀 때 share_id 자동 생성
    if (status === 'published') {
      setClauses.push(`share_id = COALESCE(share_id, $${paramIdx++})`);
      queryParams.push(crypto.randomBytes(8).toString('hex'));
    }
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  queryParams.push(id);

  const result = await query(
    `UPDATE screens SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    queryParams
  );

  return NextResponse.json({ screen: result.rows[0] });
}

// DELETE: 화면 삭제
export async function DELETE(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `DELETE FROM screens WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, auth.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
