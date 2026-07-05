import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';

// GET: workflow detail
export async function GET(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `SELECT * FROM workflows WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({ workflow: result.rows[0] });
}

// PUT: update workflow (new version + immediate apply)
export async function PUT(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description, definition, status: newStatus } = body;

  // Ownership check
  const existing = await query(
    `SELECT id, version FROM workflows WHERE id = $1 AND user_id = $2`,
    [id, auth.user.id]
  );
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다' }, { status: 404 });
  }

  const newVersion = existing.rows[0].version + 1;

  // Auto-extract input_schema and output_schema
  let inputSchema = {};
  let outputSchema = {};
  if (definition?.nodes) {
    const inputNodes = definition.nodes.filter(n => n.type === 'input');
    const outputNodes = definition.nodes.filter(n => n.type === 'output');
    inputNodes.forEach(n => {
      if (n.data?.variableName) {
        inputSchema[n.data.variableName] = {
          type: n.data.inputType || 'text',
          label: n.data.label || n.data.variableName,
          required: n.data.required ?? true,
        };
      }
    });
    outputNodes.forEach(n => {
      if (n.data?.variableName) {
        outputSchema[n.data.variableName] = {
          type: n.data.outputFormat || 'text',
        };
      }
    });
  }

  const result = await query(
    `UPDATE workflows SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      definition = COALESCE($3, definition),
      input_schema = $4,
      output_schema = $5,
      version = $6,
      status = COALESCE($7, status),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 AND user_id = $9
     RETURNING *`,
    [
      name || null,
      description ?? null,
      definition ? JSON.stringify(definition) : null,
      JSON.stringify(inputSchema),
      JSON.stringify(outputSchema),
      newVersion,
      newStatus || null,
      id,
      auth.user.id,
    ]
  );

  return NextResponse.json({ workflow: result.rows[0] });
}

// DELETE: delete workflow
export async function DELETE(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    `DELETE FROM workflows WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, auth.user.id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
