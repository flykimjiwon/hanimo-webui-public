import logger from '@/lib/logger';
import { query } from './postgres';
import { randomBytes } from 'crypto';

// Generate instance ID (once at server startup)
const instanceId = `instance-${Date.now()}-${randomBytes(6).toString('hex')}`;
const startTime = new Date();

// Instance information
export const getInstanceInfo = () => ({
  instanceId,
  startTime,
  hostname: process.env.HOSTNAME || 'localhost',
  port: process.env.PORT || 3000,
  pid: process.pid,
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'development',
});

// Log level
export const LogLevel = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG',
};

// Store log (unified in model_logs table)
export async function logToDatabase(level, message, metadata = {}) {
  try {
    const logMetadata = {
      ...metadata,
      hostname: process.env.HOSTNAME || 'localhost',
      pid: process.pid,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
    };

    await query(
      `INSERT INTO model_logs (instance_id, instance_type, level, category, message, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        instanceId,
        'app-instance',
        level,
        'system_event',
        message,
        JSON.stringify(logMetadata),
      ]
    );

    // Output with winston logger (safe handling)
    try {
      const logLevel = level.toLowerCase();
      if (logger[logLevel]) {
        logger[logLevel](`[${instanceId}] ${message}`, metadata);
      } else {
        logger.info(`[${instanceId}] ${message}`, metadata);
      }
    } catch (loggerError) {
      // Ignore if logger is already closed
      logger.error(`[${instanceId}] Logger output failed (ignored):`, loggerError.message);
    }
  } catch (error) {
    // Handle logger.error safely as well
    try {
      logger.error('Failed to save log', {
        error: error.message,
        stack: error.stack,
      });
    } catch (loggerError) {
      // Use console.error if logger is already closed
      logger.error('Failed to save log (logger closed):', error.message);
    }
  }
}

// Update instance status (heartbeat)
export async function updatemodelServerstatus() {
  try {
    const instanceInfo = getInstanceInfo();
    const instanceData = {
      instanceId,
      instanceType: instanceInfo.instanceType || 'app-instance',
      hostname: instanceInfo.hostname,
      port: instanceInfo.port,
      pid: instanceInfo.pid,
      nodeVersion: instanceInfo.nodeVersion,
      environment: instanceInfo.environment,
      lastHeartbeat: new Date(),
      uptime: Date.now() - startTime.getTime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };

    await query(
      `INSERT INTO model_server_status 
       (instance_id, instance_type, hostname, port, pid, node_version, environment, 
        last_heartbeat, uptime, memory_usage, cpu_usage, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
       ON CONFLICT (instance_id) 
       DO UPDATE SET 
         instance_type = EXCLUDED.instance_type,
         hostname = EXCLUDED.hostname,
         port = EXCLUDED.port,
         pid = EXCLUDED.pid,
         node_version = EXCLUDED.node_version,
         environment = EXCLUDED.environment,
         last_heartbeat = EXCLUDED.last_heartbeat,
         uptime = EXCLUDED.uptime,
         memory_usage = EXCLUDED.memory_usage,
         cpu_usage = EXCLUDED.cpu_usage,
         updated_at = CURRENT_TIMESTAMP`,
      [
        instanceData.instanceId,
        instanceData.instanceType,
        instanceData.hostname,
        instanceData.port,
        instanceData.pid,
        instanceData.nodeVersion,
        instanceData.environment,
        instanceData.lastHeartbeat,
        instanceData.uptime,
        JSON.stringify(instanceData.memoryUsage),
        JSON.stringify(instanceData.cpuUsage),
      ]
    );
  } catch (error) {
    // Handle logger.error safely as well
    try {
      logger.error('Failed to update instance status', {
        error: error.message,
        instanceId,
      });
    } catch (loggerError) {
      // Use console.error if logger is already closed
      logger.error('Failed to update instance status (logger closed):', error.message);
    }
  }
}

// Convenience functions
export const logError = (message, metadata) =>
  logToDatabase(LogLevel.ERROR, message, metadata);
export const logWarn = (message, metadata) =>
  logToDatabase(LogLevel.WARN, message, metadata);
export const logInfo = (message, metadata) =>
  logToDatabase(LogLevel.INFO, message, metadata);
export const logDebug = (message, metadata) =>
  logToDatabase(LogLevel.DEBUG, message, metadata);

// Auto-run at server startup
if (typeof window === 'undefined') {
  // Register instance
  updatemodelServerstatus();

  // Heartbeat every 5 minutes
  setInterval(updatemodelServerstatus, 5 * 60 * 1000);

  // Startup log
  logInfo('Instance started', getInstanceInfo());

  // Cleanup on process shutdown (ensure this runs before logger closes)
  const shutdownHandler = async (signal) => {
    try {
      // Try to log before logger shuts down
      await logInfo(`Instance stopped (${signal})`);
    } catch (error) {
      // Ignore if logger is already closed
      logger.info(`Instance stopped (${signal})`);
    }
  };

  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
}
