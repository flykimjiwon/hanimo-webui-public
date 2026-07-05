import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdmin } from '@/lib/adminAuth';
import {
  checkAllModelServerInstances,
  saveendpointStatus,
} from '@/lib/modelServerMonitor';

// Retrieve Ollama instance list
export async function GET(request) {
  try {
    // Check admin privileges
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    const url = new URL(request.url);
    const shouldRefresh = url.searchParams.get('refresh') === 'true';

    // Check list of inactive servers
    const settingsResult = await query(
      'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );
    
    const inactiveUrls = new Set();
    if (settingsResult.rows.length > 0) {
      const settings = settingsResult.rows[0];
      const customEndpoints = settings.custom_endpoints;
      if (customEndpoints && Array.isArray(customEndpoints)) {
        customEndpoints.forEach((ep) => {
          if (ep.isActive === false && ep.url) {
            // Normalize URL (remove trailing slash)
            const normalizedUrl = ep.url.trim().replace(/\/+$/, '');
            inactiveUrls.add(normalizedUrl);
          }
        });
      }
    }

    // Get the last saved Ollama status from DB
    const ollamamodelServersResult = await query(
      'SELECT * FROM model_server ORDER BY endpoint ASC'
    );
    const ollamamodelServersRaw = ollamamodelServersResult.rows;

    // Filter inactive servers and remove duplicates: unique by id
    // Build instance objects by extracting host, port, url, etc. from metadata
    const uniqMap = new Map();
    for (const inst of ollamamodelServersRaw) {
      // Extract info from metadata (metadata is a JSONB field)
      let instanceData = { ...inst };
      
      // If metadata exists, parse and extract host, port, url, etc.
      if (inst.metadata && typeof inst.metadata === 'object') {
        instanceData = {
          ...instanceData,
          ...inst.metadata,
          // Copy metadata fields to top level
          host: inst.metadata.host || inst.metadata.hostname || null,
          port: inst.metadata.port || null,
          url: inst.metadata.url || inst.endpoint || null,
          id: inst.metadata.id || inst.id,
        };
      } else if (typeof inst.metadata === 'string') {
        try {
          const parsed = JSON.parse(inst.metadata);
          instanceData = {
            ...instanceData,
            ...parsed,
            host: parsed.host || parsed.hostname || null,
            port: parsed.port || null,
            url: parsed.url || inst.endpoint || null,
            id: parsed.id || inst.id,
          };
        } catch (e) {
          logger.warn(
            '[instances] Failed to parse metadata JSON:',
            e?.message || e
          );
          // If parsing fails, try parsing URL from endpoint
          try {
            const url = new URL(inst.endpoint);
            instanceData.host = url.hostname;
            instanceData.port = url.port || null;
            instanceData.url = inst.endpoint;
          } catch (e2) {
            logger.warn(
              '[instances] Failed to parse endpoint URL:',
              e2?.message || e2
            );
          }
        }
      } else {
        // If metadata is missing, parse URL from endpoint
        try {
          const url = new URL(inst.endpoint);
          instanceData.host = url.hostname;
          instanceData.port = url.port || null;
          instanceData.url = inst.endpoint;
        } catch (e) {
          logger.warn(
            '[instances] Failed to parse endpoint URL:',
            e?.message || e
          );
        }
      }
      
      // Exclude inactive servers
      const urlToCheck = instanceData.url || inst.endpoint;
      if (urlToCheck) {
        const normalizedUrl = urlToCheck.trim().replace(/\/+$/, '');
        if (inactiveUrls.has(normalizedUrl)) {
          continue;
        }
      }
      
      const instanceId = instanceData.id || inst.id;
      if (!uniqMap.has(instanceId)) {
        uniqMap.set(instanceId, instanceData);
      }
    }
    const ollamamodelServers = Array.from(uniqMap.values());

    // Also fetch recent log count per instance (direct logs + proxy logs)
    const modelServersWithLogCount = await Promise.all(
      ollamamodelServers.map(async (instance) => {
        const hostPort = `${instance.host || ''}${
          instance.port ? `:${instance.port}` : ''
        }`;
        const proxyTypes = [
          'ollama_proxy',
          'ollama_proxy_chat',
          'openai_proxy',
        ];

        // Direct logs (query by instance_id)
        const directLogResult = await query(
          `SELECT COUNT(*) as count FROM model_logs 
           WHERE instance_id = $1 AND timestamp >= $2`,
          [instance.id, new Date(Date.now() - 24 * 60 * 60 * 1000)]
        );
        const directLogCount = parseInt(directLogResult.rows[0]?.count || 0);

        // Proxy logs (check type and endpoint from metadata)
        // Need to check type and endpoint in metadata JSONB
        // Convert proxyTypes array into OR conditions
        const proxyTypeConditions = proxyTypes.map((_, i) => `metadata->>'type' = $${i + 2}`).join(' OR ');
        const endpointParamIndex = proxyTypes.length + 2;
        const messageParamIndex = proxyTypes.length + 3;
        const proxyLogResult = await query(
          `SELECT COUNT(*) as count FROM model_logs 
           WHERE timestamp >= $1 
           AND (${proxyTypeConditions})
           AND (metadata->>'endpoint' LIKE $${endpointParamIndex} OR message LIKE $${messageParamIndex})`,
          [
            new Date(Date.now() - 24 * 60 * 60 * 1000),
            ...proxyTypes,
            `%${hostPort}%`,
            `%${hostPort}%`
          ]
        );
        const proxyLogCount = parseInt(proxyLogResult.rows[0]?.count || 0);

        return {
          ...instance,
          logCount24h: directLogCount + proxyLogCount, // Total log count
          proxyLogCount24h: proxyLogCount, // Proxy-only log count
          isActive: instance.status === 'healthy',
        };
      })
    );

    // Also provide real-time status check (optional)
    const realTimeCheck = await checkAllModelServerInstances();

    // Save real-time status on forced refresh request
    if (shouldRefresh && Array.isArray(realTimeCheck)) {
      try {
        await saveendpointStatus(realTimeCheck);
      } catch (e) {
        logger.warn('Failed to save real-time status (ignored):', e.message);
      }
    }

    return NextResponse.json({
      modelServers: modelServersWithLogCount,
      totalActive: modelServersWithLogCount.filter((i) => i.isActive).length,
      totalModelServers: modelServersWithLogCount.length,
      realTimeStatus: Array.isArray(realTimeCheck) 
        ? realTimeCheck.map((i) => ({
            id: i.id,
            url: i.url, // Add URL
            host: i.host, // Add host
            port: i.port, // Add port
            status: i.status,
            responseTime: i.responseTime,
            modelCount: i.modelCount,
          }))
        : [],
    });
  } catch (error) {
    logger.error('Failed to retrieve Ollama instance list:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve the Ollama instance list.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
