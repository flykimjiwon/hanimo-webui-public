import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

// 8자 영숫자 share_id 생성
function generateShareId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// POST: 화면 게시 (share_id 발급 + status = published)
export async function POST(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;

  // 소유권 확인
  const existing = await query(
    `SELECT id FROM screens WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다' }, { status: 404 });
  }

  // 충돌 없는 share_id 생성 (최대 5회 시도)
  let shareId = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateShareId();
    const conflict = await query(`SELECT id FROM screens WHERE share_id = $1`, [candidate]);
    if (conflict.rows.length === 0) {
      shareId = candidate;
      break;
    }
  }
  if (!shareId) {
    return NextResponse.json({ error: 'share_id 생성 실패, 다시 시도하세요' }, { status: 500 });
  }

  const result = await query(
    `UPDATE screens SET share_id = $1, status = 'published', updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [shareId, id, auth.user.id]
  );

  return NextResponse.json({ screen: result.rows[0] });
}

// DELETE: 화면 게시 해제 (share_id 제거 + status = draft)
export async function DELETE(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;

  const result = await query(
    `UPDATE screens SET share_id = NULL, status = 'draft', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, auth.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({ screen: result.rows[0] });
}
