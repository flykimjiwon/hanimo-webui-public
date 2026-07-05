import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { getAppErrorLogs } from '@/lib/appErrorLogger';

export async function GET(request) {
  const auth = verifyAdminWithResult(request);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized.' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source') || 'all';
    const level = searchParams.get('level') || 'all';
    const queryText = searchParams.get('q') || '';
    const limit = Math.min(parseInt(searchParams.get('limit'), 10) || 50, 200);
    const offset = parseInt(searchParams.get('offset'), 10) || 0;

    const { logs, total } = await getAppErrorLogs({
      source,
      level,
      queryText,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      logs,
      total,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
