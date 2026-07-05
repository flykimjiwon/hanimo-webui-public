import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { parseModelName, getModelServerEndpointsByName } from '@/lib/modelServers';

/**
 * Parse server info from model name and check round-robin status
 */
export async function GET(request) {
  const authResult = verifyAdmin(request);
  if (!authResult.success) {
    return authResult;
  }

  try {
    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('modelName');

    if (!modelName) {
      return NextResponse.json(
        { error: 'modelName parameter is required' },
        { status: 400 }
      );
    }

    // Parse server info from model name
    const { serverName, modelName: actualModelName } = parseModelName(modelName);

    if (!serverName) {
      // No round-robin if server name is absent
      return NextResponse.json({
        hasServerName: false,
        isRoundRobin: false,
        serverCount: 0,
        serverName: null,
        actualModelName: modelName,
      });
    }

    // Check number of servers with the same name
    const endpoints = await getModelServerEndpointsByName(serverName);
    const serverCount = endpoints.length;
    const isRoundRobin = serverCount > 1;

    return NextResponse.json({
      hasServerName: true,
      isRoundRobin,
      serverCount,
      serverName,
      actualModelName,
      endpoints: endpoints.map(e => ({
        url: e.endpoint,
        provider: e.provider,
      })),
    });
  } catch (error) {
    logger.error('[Check Round Robin] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check round robin status', details: error.message },
      { status: 500 }
    );
  }
}
