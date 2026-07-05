import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import {
  getAllEndpoints,
  checkModelServerHealth,
  checkOpenAICompatibleHealth,
  checkGeminiHealth,
} from '@/lib/modelServerMonitor';
import { createAuthError, createServerError } from '@/lib/errorHandler';

export async function GET(request) {
  // Check admin privileges
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const systemStatus = {
      database: { status: 'unknown', message: 'Unknown', responseTime: null },
      apiServer: {
        status: 'operational',
        message: 'Operational',
        responseTime: 0,
      },
      modelServers: {
        status: 'unknown',
        message: 'Unknown',
        responseTime: null,
      },
      modelServerEndpoints: [],
    };

    // 1. Check database status
    try {
      const dbStart = Date.now();
      await query('SELECT 1');
      const dbTime = Date.now() - dbStart;

      systemStatus.database = {
        status: 'operational',
        message: 'Connected',
        responseTime: dbTime,
      };
    } catch (error) {
      systemStatus.database = {
        status: 'error',
        message: 'Connection Failed',
        responseTime: null,
        error: error.message,
      };
    }

    // 2. API server status (operational because it is currently responding)
    systemStatus.apiServer = {
      status: 'operational',
      message: 'Operational',
      responseTime: 0,
      timestamp: new Date().toISOString(),
    };

    // 3. Check status of all registered endpoints
    try {
      // Retrieve all registered endpoints
      const registeredEndpoints = await getAllEndpoints();

      let endpointsToCheck = [];

      if (registeredEndpoints.length === 0) {
        // If no endpoints are registered, use default value (development only)
        const isDevelopment = process.env.NODE_ENV !== 'production';
        endpointsToCheck = isDevelopment
          ? [
              {
                url: 'http://localhost:11434',
                host: 'localhost',
                port: '11434',
                name: 'Local Development Server',
                provider: 'model-server',
              },
            ]
          : [];

        if (!isDevelopment) {
          logger.warn(
            '[System Status] No model servers are registered. Please register model servers in admin settings.'
          );
        }
      } else {
        endpointsToCheck = registeredEndpoints;
      }

      // Check each endpoint status in parallel (skip inactive servers)
      const endpointStatuses = await Promise.all(
        endpointsToCheck.map(async (endpoint) => {
          // Skip status check for inactive servers
          if (endpoint.isActive === false) {
            return {
              endpoint: endpoint.url,
              url: endpoint.url,
              name: endpoint.name || endpoint.url,
              provider: endpoint.provider || 'model-server',
              status: 'inactive',
               message: 'Inactive',
              responseTime: null,
              modelsCount: 0,
              isActive: false,
            };
          }

          try {
            // Re-check provider based on URL (double-check)
            let provider = endpoint.provider;
            if (endpoint.url) {
              const url = endpoint.url.toLowerCase();
              if (url.includes('generativelanguage.googleapis.com')) {
                provider = 'gemini';
              } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
                provider = 'openai-compatible';
              }
            }
            
            let result;
            if (provider === 'openai-compatible') {
              result = await checkOpenAICompatibleHealth({ ...endpoint, provider });
            } else if (provider === 'gemini') {
              result = await checkGeminiHealth({ ...endpoint, provider });
            } else {
              result = await checkModelServerHealth({ ...endpoint, provider: provider || 'model-server' });
            }

            // Convert status for UI
            const status =
              result.status === 'healthy'
                ? 'operational'
                : result.status === 'unhealthy'
                ? 'error'
                : 'warning';

            return {
              endpoint: result.url,
              url: result.url,
              name: result.name || result.url,
              provider: result.provider || 'model-server',
              status,
              message:
                result.modelCount !== undefined
                  ? `${result.modelCount} models loaded`
                  : result.error || 'Unknown',
              responseTime: result.responseTime,
              modelsCount: result.modelCount || 0,
              isActive: endpoint.isActive !== false,
            };
          } catch (error) {
            return {
              endpoint: endpoint.url,
              url: endpoint.url,
              name: endpoint.name || endpoint.url,
              provider: endpoint.provider || 'model-server',
              status: 'error',
              message: error.message || 'Check Failed',
              responseTime: null,
              modelsCount: 0,
              isActive: endpoint.isActive !== false,
            };
          }
        })
      );

      systemStatus.modelServerEndpoints = endpointStatuses;

      // Calculate overall summary status
      const operationalCount = endpointStatuses.filter(
        (ep) => ep.status === 'operational'
      ).length;
      const errorCount = endpointStatuses.filter(
        (ep) => ep.status === 'error'
      ).length;
      const warningCount = endpointStatuses.filter(
        (ep) => ep.status === 'warning'
      ).length;

      if (
        operationalCount === endpointStatuses.length &&
        endpointStatuses.length > 0
      ) {
        systemStatus.modelServers = {
          status: 'operational',
           message: `All model servers are operational (${operationalCount})`,
          responseTime: Math.max(
            ...endpointStatuses
              .map((ep) => ep.responseTime)
              .filter((rt) => rt !== null)
          ),
        };
      } else if (errorCount > 0) {
        systemStatus.modelServers = {
          status: 'error',
           message: `${errorCount} model server errors`,
          responseTime: null,
        };
      } else if (warningCount > 0) {
        systemStatus.modelServers = {
          status: 'warning',
           message: `${warningCount} model server warnings`,
          responseTime: null,
        };
      } else {
        systemStatus.modelServers = {
          status: 'checking',
          message: 'Checking endpoints...',
          responseTime: null,
        };
      }
    } catch (error) {
      systemStatus.modelServers = {
        status: 'error',
        message: 'Check Failed',
        responseTime: null,
        error: error.message,
      };
      systemStatus.modelServerEndpoints = [];
    }

    return NextResponse.json({
      success: true,
      status: systemStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to retrieve system status:', error);
    return createServerError(error, 'Failed to retrieve system status');
  }
}
