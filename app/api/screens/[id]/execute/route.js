import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { extractBearerToken, verifyTokenWithResult } from '@/lib/auth';
import {
  assertAllowedOutboundUrl,
  getScreenEndpointTimeoutMs,
  readLimitedEndpointJson,
} from '@/lib/screen-security.mjs';

// POST: 화면 엔드포인트 실행
export async function POST(request, { params }) {
  const auth = await verifyTokenWithResult(request);
  if (!auth.valid) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const { id } = await params;

  const screenResult = await query(
    `SELECT id, user_id, definition, access_type, status FROM screens WHERE id = $1`,
    [id]
  );

  if (screenResult.rows.length === 0) {
    return NextResponse.json({ error: '화면을 찾을 수 없습니다.' }, { status: 404 });
  }

  const screen = screenResult.rows[0];
  const isOwner = String(screen.user_id) === String(auth.user.id);
  const isAdmin = auth.user.role === 'admin';
  const isPublishedPublic = screen.access_type === 'public' && screen.status === 'published';

  if (!isPublishedPublic && !isOwner && !isAdmin) {
    return NextResponse.json({ error: '실행 권한이 없습니다.' }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }
  const { endpointId, inputValues = {} } = body;

  let definition = {};
  try {
    definition = typeof screen.definition === 'string'
      ? JSON.parse(screen.definition)
      : (screen.definition || {});
  } catch {
    return NextResponse.json({ error: '화면 definition이 올바르지 않습니다.' }, { status: 400 });
  }
  const endpoint = (definition.endpoints || []).find((ep) => ep.id === endpointId);

  if (!endpoint) {
    return NextResponse.json({ error: '엔드포인트를 찾을 수 없습니다.' }, { status: 404 });
  }

  try {
    let result;

    if (endpoint.type === 'workflow') {
      // 워크플로우 실행
      const wfResult = await query(
        `SELECT id, definition FROM workflows WHERE id = $1`,
        [endpoint.workflowId]
      );
      if (wfResult.rows.length === 0) {
        return NextResponse.json({ error: '워크플로우를 찾을 수 없습니다.' }, { status: 404 });
      }

      // inputMapping에 따라 입력값 매핑
      const mappedInput = {};
      for (const [key, varName] of Object.entries(endpoint.inputMapping || {})) {
        mappedInput[key] = inputValues[varName];
      }

      // 워크플로우 실행 API 내부 호출 (동기 방식)
      const bearerToken = extractBearerToken(request);
      const headers = { 'Content-Type': 'application/json' };
      if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

      const execRes = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/workflows/${endpoint.workflowId}/execute`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ inputs: mappedInput }),
          redirect: 'error',
          signal: AbortSignal.timeout(getScreenEndpointTimeoutMs()),
        }
      );

      if (!execRes.ok) {
        const errData = await execRes.json().catch(() => ({}));
        return NextResponse.json({ error: errData.error || '워크플로우 실행 실패' }, { status: 500 });
      }

      const execData = await readLimitedEndpointJson(execRes);
      result = execData.outputs || execData;
    } else if (endpoint.type === 'custom') {
      // 커스텀 URL 호출
      const mappedInput = {};
      for (const [key, varName] of Object.entries(endpoint.inputMapping || {})) {
        mappedInput[key] = inputValues[varName];
      }

      const headers = { 'Content-Type': 'application/json' };
      if (endpoint.apiKey) headers['Authorization'] = `Bearer ${endpoint.apiKey}`;
      const safeUrl = await assertAllowedOutboundUrl(endpoint.url);

      const res = await fetch(safeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(mappedInput),
        redirect: 'error',
        signal: AbortSignal.timeout(getScreenEndpointTimeoutMs()),
      });

      result = await readLimitedEndpointJson(res);
      if (!res.ok) {
        return NextResponse.json(
          { error: result.error || '커스텀 엔드포인트 호출에 실패했습니다.' },
          { status: 502 }
        );
      }
    } else {
      return NextResponse.json({ error: '알 수 없는 엔드포인트 타입입니다.' }, { status: 400 });
    }

    // outputMapping에 따라 결과 매핑
    const mappedOutput = {};
    for (const [varName, key] of Object.entries(endpoint.outputMapping || {})) {
      // 중첩 경로 지원 (예: "data.result")
      const keys = key.split('.');
      let val = result;
      for (const k of keys) {
        val = val?.[k];
      }
      mappedOutput[varName] = val;
    }

    return NextResponse.json({ outputs: mappedOutput });
  } catch (err) {
    if (err.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return NextResponse.json({ error: '엔드포인트 실행 시간이 초과되었습니다.' }, { status: 504 });
    }
    logger.error('[screens/execute] 오류:', err);
    return NextResponse.json({ error: '실행 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
