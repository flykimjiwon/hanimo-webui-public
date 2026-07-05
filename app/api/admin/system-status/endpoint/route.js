import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import {
  getAllEndpoints,
  checkModelServerHealth,
  checkOpenAICompatibleHealth,
  checkGeminiHealth,
} from '@/lib/modelServerMonitor';
import {
  createAuthError,
  createValidationError,
  createNotFoundError,
  createServerError,
} from '@/lib/errorHandler';

// Check status of a single endpoint
export async function GET(request) {
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const endpointUrl = searchParams.get('url');

    if (!endpointUrl) {
      return createValidationError('Endpoint URL is required.');
    }

    // Find from registered endpoint list
    const allEndpoints = await getAllEndpoints();
    const endpoint = allEndpoints.find((ep) => ep.url === endpointUrl);

    if (!endpoint) {
      return createNotFoundError('Endpoint is not registered.');
    }

    // Skip health check for inactive servers
    if (endpoint.isActive === false) {
      return NextResponse.json({
        success: true,
        endpoint: {
          endpoint: endpoint.url,
          name: endpoint.name || endpoint.url,
          provider: endpoint.provider || 'model-server',
          status: 'inactive',
          message: 'Inactive',
          responseTime: null,
          modelsCount: 0,
          isActive: false,
        },
      });
    }

    // Re-check provider from URL (double-check)
    let provider = endpoint.provider;
    if (endpoint.url) {
      const url = endpoint.url.toLowerCase();
      if (url.includes('generativelanguage.googleapis.com')) {
        provider = 'gemini';
      } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
        provider = 'openai-compatible';
      }
    }

    // Check status by provider
    let result;
    if (provider === 'openai-compatible') {
      result = await checkOpenAICompatibleHealth({ ...endpoint, provider });
    } else if (provider === 'gemini') {
      result = await checkGeminiHealth({ ...endpoint, provider });
    } else {
      result = await checkModelServerHealth({
        ...endpoint,
        provider: provider || 'model-server',
      });
    }

    // Normalize response format
    const formattedResult = {
      endpoint: result.url,
      name: result.name || result.url,
      provider: result.provider || 'model-server',
      status:
        result.status === 'healthy'
          ? 'operational'
          : result.status === 'unhealthy'
          ? 'error'
          : 'warning',
      message:
        result.modelCount !== undefined
          ? `${result.modelCount} models loaded`
          : result.error || 'Unknown',
      responseTime: result.responseTime,
      modelsCount: result.modelCount || 0,
      error: result.error || null,
    };

    return NextResponse.json({
      success: true,
      endpoint: formattedResult,
    });
  } catch (error) {
    logger.error('[system-status/endpoint] Failed:', error);

    // Handle timeout errors explicitly
    if (
      error.name === 'TimeoutError' ||
      error.name === 'AbortError' ||
      error.name === 'ConnectTimeoutError' ||
      error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error.message?.includes('timeout') ||
      error.message?.includes('aborted')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Endpoint status check timed out',
          message:
            'Model server connection timed out. Check whether the model server is running.',
          errorType: 'timeout',
        },
        { status: 504 }
      );
    }

    return createServerError(error, 'Failed to check endpoint status.');
  }
}
