/**
 * Workflow test execution API
 * POST /api/workflows/[id]/test
 * Same as execute but records source as 'test'
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import { WorkflowEngine } from '@/lib/workflow-engine';

export async function POST(request, { params }) {
  // Auth check
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = params;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // allow empty body
  }
  const inputs = body.inputs || {};

  // Fetch workflow (own or published)
  const wfResult = await query(
    `SELECT * FROM workflows WHERE id = $1 AND (user_id = $2 OR is_published = true)`,
    [id, auth.user.id]
  );
  if (wfResult.rows.length === 0) {
    return NextResponse.json(
      { error: '워크플로우를 찾을 수 없습니다' },
      { status: 404 }
    );
  }

  const workflow = wfResult.rows[0];

  // Fetch custom endpoints
  const epResult = await query(
    `SELECT * FROM workflow_endpoints WHERE workflow_id = $1`,
    [id]
  );

  // Create execution record (source: 'test')
  const execResult = await query(
    `INSERT INTO workflow_executions (workflow_id, user_id, inputs, source)
     VALUES ($1, $2, $3, 'test') RETURNING id`,
    [id, auth.user.id, JSON.stringify(inputs)]
  );
  const executionId = execResult.rows[0].id;

  try {
    const engine = new WorkflowEngine(workflow.definition, {
      customEndpoints: epResult.rows,
      userId: auth.user.id,
    });
    const result = await engine.run(inputs);

    // Update execution result
    await query(
      `UPDATE workflow_executions SET
        status = 'completed',
        outputs = $1,
        node_states = $2,
        total_tokens = $3,
        execution_time = $4,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        JSON.stringify(result.outputs),
        JSON.stringify(result.nodeStates),
        result.totalTokens,
        result.executionTime,
        executionId,
      ]
    );

    return NextResponse.json({
      executionId,
      status: 'completed',
      outputs: result.outputs,
      logs: result.logs,
      nodeStates: result.nodeStates,
      usage: {
        totalTokens: result.totalTokens,
        executionTime: result.executionTime,
      },
    });
  } catch (err) {
    // Record execution failure
    await query(
      `UPDATE workflow_executions SET
        status = 'failed',
        error = $1,
        completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [err.message, executionId]
    );
    return NextResponse.json(
      { error: err.message, executionId },
      { status: 500 }
    );
  }
}
