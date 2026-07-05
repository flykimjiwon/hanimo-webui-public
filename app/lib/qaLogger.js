import { query } from './postgres';
import { logger } from './logger';

/**
 * Records Q&A content to a separate 'qa_logs' table.
 * @param {object} logData - Data object to record
 */
export async function logQARequest(logData) {
  try {
    await query(
      `INSERT INTO qa_logs (timestamp, log_data)
       VALUES (CURRENT_TIMESTAMP, $1)`,
      [JSON.stringify(logData)]
    );
    logger.debug('[QA Logger] Q&A logging complete', {
      logDataSize: JSON.stringify(logData).length,
    });
  } catch (error) {
    logger.error('[QA Logger] Q&A logging failed', {
      error: error.message,
      stack: error.stack,
    });
  }
}
