import { query, transaction } from './postgres';
import { logger } from './logger';

/**
 * Save messages to both personal conversation storage (chatHistory) and admin logging (messages)
 * @param {Object} messageData - Message data to save
 * @param {string} messageData.roomId - Chat room ID
 * @param {string} messageData.userId - User ID
 * @param {string} messageData.role - 'user' or 'assistant'
 * @param {string} messageData.text - Message content
 * @param {string} messageData.model - AI model name (optional)
 * @param {string} messageData.userRole - User role (optional)
 * @param {string} messageData.clientIP - Client IP (optional)
 * 
 * Note: Due to normalization, email, name, department, and cell are no longer stored.
 * Query them via JOIN with the users table when needed.
 */
export async function saveMessageDual(messageData) {
  const currentTime = new Date();

  const {
    roomId,
    userId,
    role,
    text,
    model = null,
    userRole = 'user',
    clientIP = null,
    drawMode = false,
  } = messageData;

  // Convert text to JSON string when it is an object or array
  let textToSave = text;
  if (text !== null && text !== undefined) {
    if (typeof text === 'object') {
      try {
        textToSave = JSON.stringify(text, null, 2);
      } catch (e) {
        logger.warn('[messageLogger] Failed to serialize text object, converting to string', {
          error: e.message,
        });
        textToSave = String(text);
      }
    } else {
      textToSave = String(text);
    }
  } else {
    textToSave = '';
  }

  try {
    const colCheck = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'chat_history' AND column_name = 'draw_mode' LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const hasDrawMode = colCheck.rows.length > 0;

    return await transaction(async (client) => {
      // 1. Personal conversation storage (chat_history)
      let chatHistoryResult;
      if (hasDrawMode) {
        chatHistoryResult = await client.query(
          `INSERT INTO chat_history (room_id, user_id, role, text, model, draw_mode, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            roomId,
            userId || null,
            role,
            textToSave,
            model,
            drawMode === true,
            currentTime,
          ]
        );
      } else {
        chatHistoryResult = await client.query(
          `INSERT INTO chat_history (room_id, user_id, role, text, model, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [roomId, userId || null, role, textToSave, model, currentTime]
        );
      }

      // 2. Admin logging (messages)
      // Normalization: remove email, name, department, cell (query via JOIN from users table)
      const messagesResult = await client.query(
        `INSERT INTO messages (role, user_role, model, text, room_id, user_id, client_ip, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          role,
          userRole,
          model,
          textToSave,
          roomId,
          userId || null,
          clientIP,
          currentTime,
        ]
      );

      return {
        success: true,
        chatHistoryId: chatHistoryResult.rows[0].id,
        messagesId: messagesResult.rows[0].id,
      };
    });
  } catch (error) {
    logger.error('Failed to save dual message', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Simple message logging (for RAG system)
 * @param {string} role - 'user' or 'assistant'
 * @param {string} text - Message content
 * @param {string} userId - User ID
 * @param {string} clientIP - Client IP
 * @param {string} roomId - Chat room ID
 * @param {string} model - AI model name
 * @param {Object} metadata - Additional metadata
 */
export async function logMessage(
  role,
  text,
  userId,
  clientIP,
  roomId,
  model,
  metadata = {}
) {
  // Set default user info (should actually be retrieved from JWT)
  return await saveMessageDual({
    roomId,
    userId,
    role,
    text,
    model,
    email: 'system@internal.com', // Default value
    name: 'System User', // Default value
    department: 'System', // Default value
    cell: 'N/A', // Default value
    userRole: 'user',
    clientIP,
    ...metadata,
  });
}

/**
 * Update chat room message count
 * @param {string} roomId - Chat room ID
 */
export async function updateRoomMessageCount(roomId) {
  try {
    await query(
      `UPDATE chat_rooms 
       SET updated_at = CURRENT_TIMESTAMP, message_count = message_count + 1 
       WHERE id = $1`,
      [roomId]
    );
  } catch (error) {
    logger.error('Failed to update chat room message count', {
      error: error.message,
      roomId,
    });
    // Do not throw so this error does not affect message saving
  }
}
