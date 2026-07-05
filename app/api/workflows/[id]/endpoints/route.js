import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

// GET: list custom endpoints for a workflow
export async function GET(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;

  // Ownership check
  const wf = await query(
    `SELECT id FROM workflows WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );
  if (wf.rows.length === 0) return NextResponse.json({ error: '접근 불가' }, { status: 404 });

  const result = await query(
    `SELECT id, name, endpoint_url, provider_type, model_name, created_at
     FROM workflow_endpoints
     WHERE workflow_id = $1
     ORDER BY created_at`,
    [id]
  );

  return NextResponse.json({ endpoints: result.rows });
}

// POST: add endpoint
export async function POST(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;

  // Ownership check
  const wf = await query(
    `SELECT id FROM workflows WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );
  if (wf.rows.length === 0) return NextResponse.json({ error: '접근 불가' }, { status: 404 });

  const { name, endpointUrl, apiKey, providerType, modelName } = await request.json();

  if (!name?.trim() || !endpointUrl?.trim()) {
    return NextResponse.json({ error: '이름과 URL은 필수입니다' }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO workflow_endpoints (workflow_id, name, endpoint_url, api_key_encrypted, provider_type, model_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, endpoint_url, provider_type, model_name, created_at`,
    [id, name.trim(), endpointUrl.trim(), apiKey || null, providerType || 'openai-compat', modelName || null]
  );

  return NextResponse.json({ endpoint: result.rows[0] }, { status: 201 });
}

// DELETE: delete endpoint (query param ?endpointId=xxx)
export async function DELETE(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const endpointId = searchParams.get('endpointId');

  if (!endpointId) return NextResponse.json({ error: 'endpointId 필요' }, { status: 400 });

  // Ownership check (only workflow owner can delete)
  const wf = await query(
    `SELECT id FROM workflows WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );
  if (wf.rows.length === 0) return NextResponse.json({ error: '접근 불가' }, { status: 404 });

  await query(
    `DELETE FROM workflow_endpoints WHERE id = $1 AND workflow_id = $2`,
    [endpointId, id]
  );

  return NextResponse.json({ ok: true });
}
