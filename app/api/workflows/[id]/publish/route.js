/**
 * Workflow publish/unpublish API
 * POST   /api/workflows/[id]/publish  - publish
 * DELETE /api/workflows/[id]/publish  - unpublish
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

// POST: publish workflow
export async function POST(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }
  const { id } = await params;

  const result = await query(
    `UPDATE workflows SET is_published = true, status = 'published', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 RETURNING id, is_published, status`,
    [id, auth.user.id]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json({ success: true, workflow: result.rows[0] });
}

// DELETE: unpublish
export async function DELETE(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }
  const { id } = await params;

  const result = await query(
    `UPDATE workflows SET is_published = false, status = 'draft', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 RETURNING id, is_published, status`,
    [id, auth.user.id]
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다' }, { status: 404 });
  }
  return NextResponse.json({ success: true, workflow: result.rows[0] });
}
