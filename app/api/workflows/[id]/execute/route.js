/**
 * Workflow execution API
 * POST /api/workflows/[id]/execute
 * POST /api/workflows/[id]/execute?stream=true (SSE streaming)
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

  const { id } = await params;

  // Check streaming mode
  const url = new URL(request.url);
  const isStream = url.searchParams.get('stream') === 'true';

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

  // Create execution record (source: 'api')
  const execResult = await query(
    `INSERT INTO workflow_executions (workflow_id, user_id, inputs, source)
     VALUES ($1, $2, $3, 'api') RETURNING id`,
    [id, auth.user.id, JSON.stringify(inputs)]
  );
  const executionId = execResult.rows[0].id;

  // ── SSE streaming mode ──────────────────────────────────────────────────────
  if (isStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const engine = new WorkflowEngine(workflow.definition, {
            customEndpoints: epResult.rows,
            userId: auth.user.id,
            onNodeStart: (nodeId, nodeName) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'node_start', nodeId, nodeName })}\n\n`
                )
              );
            },
            onNodeComplete: (nodeId, nodeName, output) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'node_complete', nodeId, nodeName, output })}\n\n`
                )
              );
            },
            onNodeError: (nodeId, error) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'node_error', nodeId, error })}\n\n`
                )
              );
            },
          });

          const result = await engine.run(inputs);

          // Send completion event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'complete',
                outputs: result.outputs,
                usage: {
                  totalTokens: result.totalTokens,
                  executionTime: result.executionTime,
                },
              })}\n\n`
            )
          );

          // Update execution result in DB
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

          controller.close();
        } catch (err) {
          // Send error event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`
            )
          );

          // Update failure record in DB
          await query(
            `UPDATE workflow_executions SET
              status = 'failed',
              error = $1,
              completed_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [err.message, executionId]
          ).catch(() => {});

          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // ── Normal synchronous execution mode ──────────────────────────────────────
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
