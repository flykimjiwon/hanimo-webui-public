import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { query } from '@/lib/postgres';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Helper function to convert model ID to display name
async function getModelLabelMap() {
  const modelLabelMap = new Map();
  const allModels = [];

  try {
    const addModelToMap = (model) => {
      const modelData = {
        id: model.id,
        modelName: model.model_name || model.modelName,
        label: model.label,
      };
      allModels.push(modelData);

      if (modelData.id && !modelLabelMap.has(modelData.id)) {
        modelLabelMap.set(modelData.id, modelData.label);
      }

      if (modelData.modelName) {
        if (!modelLabelMap.has(modelData.modelName)) {
          modelLabelMap.set(modelData.modelName, modelData.label);
        }

        if (modelData.modelName.includes('/')) {
          const shortId = modelData.modelName.split('/').pop();
          if (shortId && !modelLabelMap.has(shortId)) {
            modelLabelMap.set(shortId, modelData.label);
          }
        }

        if (modelData.modelName.includes(':')) {
          const baseId = modelData.modelName.split(':')[0];
          if (baseId && !modelLabelMap.has(baseId)) {
            modelLabelMap.set(baseId, modelData.label);
          }
        }
      }
    };

    // Query models from new table structure (direct query on models table)
    const modelsResult = await query(
      'SELECT id, model_name, label FROM models ORDER BY display_order ASC'
    );

    if (modelsResult.rows.length > 0) {
      modelsResult.rows.forEach((model) => addModelToMap(model));

      logger.info('[Messages] Models loaded from models table:', modelsResult.rows.length, 'items');
    }

    // Merge legacy model_config as well (including manual models)
    const modelConfigResult = await query(
      'SELECT config FROM model_config WHERE config_type = $1',
      ['models']
    );

    if (modelConfigResult.rows.length > 0) {
      const modelConfig = modelConfigResult.rows[0].config;

      if (modelConfig && modelConfig.categories) {
        Object.values(modelConfig.categories).forEach((category) => {
          if (category.models && Array.isArray(category.models)) {
            category.models.forEach((model) => {
              if (model.id && model.label) {
                addModelToMap({
                  id: model.id,
                  model_name: model.modelName,
                  label: model.label,
                });

                if (model.modelName && model.modelName.includes(':')) {
                  const baseModelName = model.modelName.split(':')[0];
                  if (baseModelName && !modelLabelMap.has(baseModelName)) {
                    modelLabelMap.set(baseModelName, model.label);
                  }
                }
              }
            });
          }
        });
      }
    }
  } catch (error) {
    logger.warn('[Messages] Model settings query failed:', error.message);
  }

  return { modelLabelMap, allModels };
}

// Find display name by model ID (enhanced matching logic)
function findModelLabel(modelId, modelLabelMap, allModels) {
  if (!modelId) return null;
  
  // Convert to string and trim whitespace
  const normalizedModelId = String(modelId).trim();
  if (!normalizedModelId) return null;
  
  // 1. Exact match
  let label = modelLabelMap.get(normalizedModelId);
  if (label) return label;
  
  // 2. Exact match by modelName
  let foundModel = allModels.find((m) => m.modelName === normalizedModelId);
  if (foundModel) return foundModel.label;
  
  // 3. Partial match attempt (when model ID is contained in config ID or modelName)
  const modelIdLower = normalizedModelId.toLowerCase();
  foundModel = allModels.find((m) => {
    if (!m.id && !m.modelName) return false;
    const mIdLower = m.id ? String(m.id).toLowerCase() : '';
    const mNameLower = m.modelName ? String(m.modelName).toLowerCase() : '';
    return mIdLower.includes(modelIdLower) || mNameLower.includes(modelIdLower);
  });
  if (foundModel) return foundModel.label;
  
  // 4. Reverse match (when config ID or modelName is contained in model ID)
  foundModel = allModels.find((m) => {
    if (!m.id && !m.modelName) return false;
    const mIdLower = m.id ? String(m.id).toLowerCase() : '';
    const mNameLower = m.modelName ? String(m.modelName).toLowerCase() : '';
    return modelIdLower.includes(mIdLower) || modelIdLower.includes(mNameLower);
  });
  if (foundModel) return foundModel.label;
  
  // 5. Match by colon(:)-separated base name
  if (normalizedModelId.includes(':')) {
    const baseId = normalizedModelId.split(':')[0];
    foundModel = allModels.find((m) => {
      if (!m.id && !m.modelName) return false;
      const mIdLower = m.id ? String(m.id).toLowerCase() : '';
      const mNameLower = m.modelName ? String(m.modelName).toLowerCase() : '';
      return mIdLower.startsWith(baseId.toLowerCase() + ':') || mNameLower.startsWith(baseId.toLowerCase() + ':');
    });
    if (foundModel) return foundModel.label;
  }
  
  // 6. Partial match by slash(/) separator
  if (normalizedModelId.includes('/')) {
    const shortId = normalizedModelId.split('/').pop();
    if (shortId) {
      label = modelLabelMap.get(shortId);
      if (label) return label;
    }
  }
  
  return null;
}

export async function GET(request) {
  // Verify admin privileges
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {

    // Extract URL parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const search = searchParams.get('search') || '';
    const department = searchParams.get('department') || '';
    const authType = searchParams.get('authType') || '';
    const model = searchParams.get('model') || '';
    const role = searchParams.get('role') || '';
    const feedback = searchParams.get('feedback') || '';
    const roomId = searchParams.get('roomId') || '';
    const user = searchParams.get('user') || ''; // Filter by user name or email
    const dateRange = searchParams.get('dateRange') || '7d';
    const startDateParam = searchParams.get('startDate') || '';
    const endDateParam = searchParams.get('endDate') || '';
    const isExport = searchParams.get('export') === 'true';
    const limit = isExport ? 0 : 50; // No limit for export, otherwise 50 per page

    // Calculate date range
    let startDate = null;
    let endDate = null;
    const now = new Date();

    const parseLocalDate = (value, isEnd) => {
      if (!value) return null;
      const suffix = isEnd ? 'T23:59:59.999' : 'T00:00:00';
      const parsed = new Date(`${value}${suffix}`);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed;
    };

    startDate = parseLocalDate(startDateParam, false);
    endDate = parseLocalDate(endDateParam, true);

    if (!startDate && !endDate) {
      switch (dateRange) {
        case '1d':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '365d':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = null;
          break;
      }
    }

    // Build search conditions
    // Normalization: department is queried from users table
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`m.text ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (department) {
      whereConditions.push(`u.department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }

    if (authType) {
      whereConditions.push(`u.auth_type = $${paramIndex}`);
      params.push(authType);
      paramIndex++;
    }

    if (model) {
      whereConditions.push(`m.model ILIKE $${paramIndex}`);
      params.push(`%${model}%`);
      paramIndex++;
    }

    if (role) {
      whereConditions.push(`m.role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (roomId) {
      whereConditions.push(`m.room_id = $${paramIndex}`);
      params.push(roomId);
      paramIndex++;
    }

    // Handle user (name/email) filter
    if (user) {
      whereConditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${user}%`);
      paramIndex++;
    }

    // Handle feedback filter: apply filter only when not empty string
    if (feedback && feedback.trim() !== '') {
      const normalizedFeedback = feedback.trim().toLowerCase();
      if (normalizedFeedback === 'none') {
        // No feedback case: feedback is absent, null, or empty string
        whereConditions.push(`(m.feedback IS NULL OR m.feedback = '')`);
      } else {
        // Feedback exists case: case-insensitive match (like or dislike)
        whereConditions.push(`LOWER(m.feedback) = $${paramIndex}`);
        params.push(normalizedFeedback);
        paramIndex++;
      }
    }

    if (startDate) {
      whereConditions.push(`m.created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereConditions.push(`m.created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Handle CSV export
    if (isExport) {
      // Normalization: query user info by JOINing with users table
      const messagesResult = await query(
        `SELECT m.*, 
                COALESCE(u.email, '') as email,
                COALESCE(u.name, '') as name,
                COALESCE(u.department, '') as department,
                COALESCE(u.cell, '') as cell
         FROM messages m
         LEFT JOIN users u ON m.user_id = u.id
         ${whereClause} 
         ORDER BY m.created_at DESC`,
        params
      );
      const messages = messagesResult.rows;

      // CSV headers
      const csvHeaders = [
        'Time',
        'Name',
        'Email',
        'Department',
        'Cell',
        'Role',
        'Model',
        'Room ID',
        'IP',
        'Feedback',
        'Message Content',
      ];

      // CSV data
      const csvRows = messages.map((msg) => [
        msg.created_at.toISOString(),
        msg.name || '',
        msg.email || '',
        msg.department || '',
        msg.cell || '',
        msg.role === 'user' ? 'User' : 'AI',
        msg.model || '',
        msg.room_id || '',
        msg.client_ip || '',
        msg.feedback === 'like' ? 'Like' : msg.feedback === 'dislike' ? 'Dislike' : '',
        `"${(msg.text || '').replace(/"/g, '""')}"`, // CSV string escape
      ]);

      // Generate CSV string
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map((row) => row.join(',')),
      ].join('\n');

      // Respond with CSV file
      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=messages_${new Date()
            .toISOString()
            .slice(0, 10)}.csv`,
        },
      });
    }

    // Query total count
    // Normalization: JOIN with users table
    const countResult = await query(
      `SELECT COUNT(*) as count 
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Query message list
    // Normalization: query user info by JOINing with users table
    const offset = (page - 1) * limit;
    const messagesResult = await query(
      `SELECT m.*, 
              COALESCE(u.email, '') as email,
              COALESCE(u.name, '') as name,
              COALESCE(u.department, '') as department,
              COALESCE(u.cell, '') as cell
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       ${whereClause} 
       ORDER BY m.created_at DESC 
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );
    let messages = messagesResult.rows;

    // Merge feedback from chatHistory
    // If messages table feedback is null or absent, fetch feedback from chatHistory
    const feedbackMap = new Map();
    
    if (messages.length > 0) {
      // Extract room_id list
      const roomIds = [...new Set(messages.map(m => m.room_id).filter(Boolean))];
      
      if (roomIds.length > 0) {
        // Query only messages with feedback for the given room_ids from chatHistory
        const chatHistoryResult = await query(
          `SELECT room_id, text, role, created_at, feedback 
           FROM chat_history 
           WHERE room_id = ANY($1) AND feedback IS NOT NULL AND feedback != ''`,
          [roomIds]
        );

        // Map chatHistory messages (by room_id, text, role, created_at)
        chatHistoryResult.rows.forEach(chMsg => {
          const key = `${chMsg.room_id}_${chMsg.text}_${chMsg.role}_${chMsg.created_at?.getTime()}`;
          if (chMsg.feedback && String(chMsg.feedback).trim() !== '') {
            feedbackMap.set(key, String(chMsg.feedback).trim());
          }
        });
      }
    }

    // Query model settings
    const { modelLabelMap, allModels } = await getModelLabelMap();

    let formattedMessages = messages.map((msg) => {
      // Use messages table feedback if available, otherwise look up from chatHistory
      let messageFeedback = (msg.feedback && String(msg.feedback).trim() !== '') 
        ? String(msg.feedback).trim() 
        : null;
      
      // If no feedback in messages, look up from chatHistory
      if (!messageFeedback) {
        const key = `${msg.room_id}_${msg.text}_${msg.role}_${msg.created_at?.getTime()}`;
        messageFeedback = feedbackMap.get(key) || null;
      }

      // Convert model ID to display name
      const modelId = msg.model ? String(msg.model).trim() : null;
      let modelLabel = null;
      if (modelId && modelId.length > 0) {
        modelLabel = findModelLabel(modelId, modelLabelMap, allModels);
        // If display name not found, use model ID itself
        if (!modelLabel || modelLabel.trim().length === 0) {
          modelLabel = modelId;
        }
      }

      return {
        _id: msg.id,
        id: msg.id,
        email: msg.email,
        name: msg.name,
        department: msg.department,
        cell: msg.cell,
        role: msg.role,
        userRole: msg.user_role,
        model: msg.model,
        modelLabel: modelLabel, // Add display name
        text: msg.text,
        roomId: msg.room_id,
        userId: msg.user_id,
        clientIP: msg.client_ip,
        createdAt: msg.created_at,
        feedback: messageFeedback,
      };
    });

    // Fallback: when messages table is empty, supplement from chatHistory
    if (formattedMessages.length === 0) {
      // Build WHERE conditions for chatHistory
      let chatWhereConditions = [];
      let chatParams = [];
      let chatParamIndex = 1;

      if (search) {
        chatWhereConditions.push(`ch.text ILIKE $${chatParamIndex}`);
        chatParams.push(`%${search}%`);
        chatParamIndex++;
      }

      if (department) {
        chatWhereConditions.push(`u.department = $${chatParamIndex}`);
        chatParams.push(department);
        chatParamIndex++;
      }

      if (authType) {
        chatWhereConditions.push(`u.auth_type = $${chatParamIndex}`);
        chatParams.push(authType);
        chatParamIndex++;
      }

      if (model) {
        chatWhereConditions.push(`ch.model ILIKE $${chatParamIndex}`);
        chatParams.push(`%${model}%`);
        chatParamIndex++;
      }

      if (role) {
        chatWhereConditions.push(`ch.role = $${chatParamIndex}`);
        chatParams.push(role);
        chatParamIndex++;
      }

      if (roomId) {
        chatWhereConditions.push(`ch.room_id = $${chatParamIndex}`);
        chatParams.push(roomId);
        chatParamIndex++;
      }

      if (user) {
        chatWhereConditions.push(`(u.name ILIKE $${chatParamIndex} OR u.email ILIKE $${chatParamIndex})`);
        chatParams.push(`%${user}%`);
        chatParamIndex++;
      }

      // Handle feedback filter
      if (feedback && feedback.trim() !== '') {
        const normalizedFeedback = feedback.trim().toLowerCase();
        if (normalizedFeedback === 'none') {
          chatWhereConditions.push(`(ch.feedback IS NULL OR ch.feedback = '')`);
        } else {
          chatWhereConditions.push(`LOWER(ch.feedback) = $${chatParamIndex}`);
          chatParams.push(normalizedFeedback);
          chatParamIndex++;
        }
      }

      if (startDate) {
        chatWhereConditions.push(`ch.created_at >= $${chatParamIndex}`);
        chatParams.push(startDate);
        chatParamIndex++;
      }

      if (endDate) {
        chatWhereConditions.push(`ch.created_at <= $${chatParamIndex}`);
        chatParams.push(endDate);
        chatParamIndex++;
      }

      const chatWhereClause = chatWhereConditions.length > 0 
        ? `WHERE ${chatWhereConditions.join(' AND ')}` 
        : '';

      const totalCountCHResult = await query(
        `SELECT COUNT(*) as count
         FROM chat_history ch
         LEFT JOIN users u ON ch.user_id = u.id
         ${chatWhereClause}`,
        chatParams
      );
      const totalCountCH = parseInt(totalCountCHResult.rows[0].count);
      const totalPagesCH = Math.ceil(
        (isExport ? totalCountCH : Math.min(totalCountCH, 1e9)) / (limit || 1)
      );

      const historyResult = await query(
        `SELECT ch.*,
                COALESCE(u.email, '') as email,
                COALESCE(u.name, '') as name,
                COALESCE(u.department, '') as department,
                COALESCE(u.cell, '') as cell
         FROM chat_history ch
         LEFT JOIN users u ON ch.user_id = u.id
         ${chatWhereClause}
         ORDER BY ch.created_at DESC
         LIMIT $${chatParamIndex} OFFSET $${chatParamIndex + 1}`,
        [...chatParams, limit || 0, (page - 1) * (limit || 0)]
      );
      const history = historyResult.rows;

      // Query model settings (for chatHistory fallback)
      const { modelLabelMap: chModelLabelMap, allModels: chAllModels } = await getModelLabelMap();

      formattedMessages = history.map((msg) => {
        // Convert model ID to display name
        const modelId = msg.model ? String(msg.model).trim() : null;
        let modelLabel = null;
        if (modelId && modelId.length > 0) {
          modelLabel = findModelLabel(modelId, chModelLabelMap, chAllModels);
          // If display name not found, use model ID itself
          if (!modelLabel || modelLabel.trim().length === 0) {
            modelLabel = modelId;
          }
        }
        
        return {
          _id: msg.id,
          id: msg.id,
          email: msg.email || '',
          name: msg.name || '',
          department: msg.department || '',
          cell: msg.cell || '',
          role: msg.role,
          userRole: 'user',
          model: msg.model || '',
          modelLabel: modelLabel, // Add display name
          text: msg.text,
          roomId: msg.room_id,
          userId: msg.user_id,
          clientIP: null,
          createdAt: msg.created_at,
          feedback: (msg.feedback && String(msg.feedback).trim() !== '') ? String(msg.feedback).trim() : null,
        };
      });

      return NextResponse.json({
        success: true,
        messages: formattedMessages,
        pagination: {
          currentPage: page,
          totalPages: totalPagesCH,
          totalCount: totalCountCH,
          limit,
        },
      });
    }

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
      },
    });
  } catch (error) {
    logger.error('Failed to query message list:', error);
    return createServerError(error, 'Failed to query message list');
  }
}
