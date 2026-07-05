import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

// Helper function to convert model IDs to display names
async function getModelLabelMap() {
  const modelLabelMap = new Map();
  const allModels = [];

  try {
    const { query: queryPostgres } = await import('@/lib/postgres');
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

    // Query models in new table structure (directly from models table)
    const modelsResult = await queryPostgres(
      'SELECT id, model_name, label FROM models ORDER BY display_order ASC'
    );

    if (modelsResult.rows.length > 0) {
      modelsResult.rows.forEach((model) => addModelToMap(model));

      logger.info('[Dashboard] Models loaded from models table:', modelsResult.rows.length, 'items');
    }

    const modelConfigResult = await queryPostgres(
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
    logger.warn('[Dashboard] Model settings query failed:', error.message);
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
  
  // 2. Try partial match (model ID is included in configured ID)
  const modelIdLower = normalizedModelId.toLowerCase();
  let foundModel = allModels.find((m) => {
    if (!m.id) return false;
    const mIdLower = String(m.id).toLowerCase();
    return mIdLower.includes(modelIdLower);
  });
  if (foundModel) return foundModel.label;
  
  // 3. Reverse match (configured ID is included in model ID)
  foundModel = allModels.find((m) => {
    if (!m.id) return false;
    const mIdLower = String(m.id).toLowerCase();
    return modelIdLower.includes(mIdLower);
  });
  if (foundModel) return foundModel.label;
  
  // 4. Match by base name separated by colon (:)
  if (normalizedModelId.includes(':')) {
    const baseId = normalizedModelId.split(':')[0];
    foundModel = allModels.find((m) => {
      if (!m.id) return false;
      const mIdLower = String(m.id).toLowerCase();
      return mIdLower.startsWith(baseId.toLowerCase() + ':');
    });
    if (foundModel) return foundModel.label;
  }
  
  // 5. Partial match for slash (/) separated IDs
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
  // Verify admin permission
  const authResult = verifyAdminWithResult(request);
  if (!authResult.valid) {
    return createAuthError(authResult.error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Date parsing function
    const parseDate = (dateStr, isEnd) => {
      if (!dateStr) return null;
      const suffix = isEnd ? 'T23:59:59.999' : 'T00:00:00';
      const parsed = new Date(`${dateStr}${suffix}`);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    // Set period (default: last 7 days)
    const today = new Date();
    const endDate = parseDate(endDateParam, true) || today;
    const startDate = parseDate(startDateParam, false) || new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Calculate previous period (for change comparison)
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevEndDate = new Date(startDate.getTime() - 1);
    const prevStartDate = new Date(prevEndDate.getTime() - periodLength);

    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch data in parallel
    const [
      totalUsersResult,
      prevUsersResult,
      totalMessagesResult,
      prevMessagesResult,
      todayMessagesResult,
      activeUsersResult,
      prevActiveUsersResult,
      topModelsResult,
      tokenUsageResult,
      recentActivityResult,
      modelConfigData,
    ] = await Promise.all([
      // Current period user count (joined within period)
      query('SELECT COUNT(*) as count FROM users WHERE created_at >= $1 AND created_at <= $2', [startDate, endDate]),

      // Previous period user count
      query('SELECT COUNT(*) as count FROM users WHERE created_at >= $1 AND created_at <= $2', [prevStartDate, prevEndDate]),

      // Current period message count
      query(
        `SELECT COUNT(*) as count
         FROM messages
         WHERE role = 'user'
           AND created_at >= $1
           AND created_at <= $2`,
        [startDate, endDate]
      ),

      // Previous period message count
      query(
        `SELECT COUNT(*) as count
         FROM messages
         WHERE role = 'user'
           AND created_at >= $1
           AND created_at <= $2`,
        [prevStartDate, prevEndDate]
      ),

      // Today's message count
      query(
        `SELECT COUNT(*) as count
         FROM messages
         WHERE role = 'user'
           AND created_at >= $1`,
        [startOfToday]
      ),

      // Current period active users
      query(
        `SELECT COUNT(DISTINCT user_id) as count
         FROM messages
         WHERE role = 'user'
           AND created_at >= $1
           AND created_at <= $2
           AND user_id IS NOT NULL`,
        [startDate, endDate]
      ),

      // Previous period active users
      query(
        `SELECT COUNT(DISTINCT user_id) as count
         FROM messages
         WHERE role = 'user'
           AND created_at >= $1
           AND created_at <= $2
           AND user_id IS NOT NULL`,
        [prevStartDate, prevEndDate]
      ),

      // Top 10 popular models - join models for model_name and model_server for server name
      query(
        `SELECT 
           COALESCE(models.model_name, t.model) as _id, 
           SUM(t.count) as count,
           COALESCE(models.model_name, t.model) as model_name,
           MAX(model_server.name) as server_name
         FROM (
           SELECT model, COUNT(*) as count
           FROM external_api_logs
           WHERE (api_type IS NULL OR api_type <> 'pii-detect')
             AND model IS NOT NULL
           GROUP BY model
           ) t
         LEFT JOIN models ON t.model = models.id::text OR t.model = models.model_name
         LEFT JOIN model_server ON models.endpoint = model_server.endpoint
         GROUP BY COALESCE(models.model_name, t.model)
         ORDER BY count DESC 
         LIMIT 10`
      ),

      // Total token usage (web chat + external API)
      query(
        `SELECT
          COALESCE(SUM(combined.prompt_tokens), 0)::BIGINT as prompt_tokens,
          COALESCE(SUM(combined.response_tokens), 0)::BIGINT as response_tokens,
          COALESCE(SUM(combined.total_tokens), 0)::BIGINT as total_tokens
        FROM (
          SELECT prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
          FROM external_api_logs
          WHERE timestamp >= $1 AND timestamp <= $2 AND (api_type IS NULL OR api_type <> 'pii-detect')
          UNION ALL
          SELECT prompt_tokens, completion_tokens as response_tokens, total_tokens
          FROM model_logs
          WHERE timestamp >= $1 AND timestamp <= $2
        ) combined`,
        [startDate, endDate]
      ),

      // Recent activity (latest 20) - query from messages table to include historical data
      query(
        `SELECT 
           activity.email,
           activity.model,
           activity.created_at,
           activity.department,
           activity.cell,
           activity.model_name
         FROM (
           SELECT 
             u.email as email,
             m.model as model,
             m.created_at as created_at,
             u.department as department,
             u.cell as cell,
             COALESCE(models.model_name, m.model) as model_name
            FROM messages m
            INNER JOIN users u ON m.user_id = u.id
            LEFT JOIN models ON m.model = models.id::text OR m.model = models.model_name
            WHERE m.role = 'user'
          ) activity
         ORDER BY activity.created_at DESC
         LIMIT 20`
      ),

      // Fetch model settings
      getModelLabelMap(),
    ]);

    const totalUsers = parseInt(totalUsersResult.rows[0]?.count || 0);
    const prevUsers = parseInt(prevUsersResult.rows[0]?.count || 0);
    const totalMessages = parseInt(totalMessagesResult.rows[0]?.count || 0);
    const prevMessages = parseInt(prevMessagesResult.rows[0]?.count || 0);
    const todayMessages = parseInt(todayMessagesResult.rows[0]?.count || 0);
    const activeUsers = parseInt(activeUsersResult.rows[0]?.count || 0);
    const prevActiveUsers = parseInt(prevActiveUsersResult.rows[0]?.count || 0);

    // Token usage
    const tokenUsage = {
      promptTokens: parseInt(tokenUsageResult.rows[0]?.prompt_tokens || 0),
      responseTokens: parseInt(tokenUsageResult.rows[0]?.response_tokens || 0),
      totalTokens: parseInt(tokenUsageResult.rows[0]?.total_tokens || 0),
    };

    // Change-rate calculation helper
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const usersChange = calculateChange(totalUsers, prevUsers);
    const messagesChange = calculateChange(totalMessages, prevMessages);
    const activeUsersChange = calculateChange(activeUsers, prevActiveUsers);
    const topModels = topModelsResult.rows
      .filter((row) => row._id) // filter only non-null models
      .map((row) => ({
        _id: String(row._id).trim(), // convert to string and trim whitespace
        count: parseInt(row.count),
        model_name: row.model_name ? String(row.model_name).trim() : null, // include model_name
        server_name: row.server_name ? String(row.server_name).trim() : null, // include server_name
      }));
    const recentActivity = recentActivityResult.rows.map((row) => ({
      email: row.email,
      model: row.model ? String(row.model).trim() : null, // convert to string and trim whitespace
      model_name: row.model_name ? String(row.model_name).trim() : null, // include model_name
      createdAt: row.created_at,
      department: row.department,
      cell: row.cell,
    }));

    const { modelLabelMap, allModels } = modelConfigData;

    // Debug: model settings info logs
    logger.info('[Dashboard] Model settings count:', allModels.length);
    logger.info('[Dashboard] Model label map size:', modelLabelMap.size);
    if (allModels.length > 0) {
      logger.info('[Dashboard] Sample model settings:', allModels.slice(0, 3).map(m => ({ id: m.id, label: m.label })));
    }

    // Convert model ID to display name (prefer model_name)
    const topModelsWithLabels = topModels.map((model) => {
      const modelId = model._id || model.model || null;
      let label = null;
      
      // Prefer model_name when available
      if (model.model_name) {
        label = model.model_name;
      } else if (modelId) {
        // Debug: actual model ID log
        logger.info('[Dashboard] Matching attempt - Model ID:', modelId);
        
        label = findModelLabel(modelId, modelLabelMap, allModels);
        
        // Debug: matching result log
        if (!label) {
          logger.info('[Dashboard] Match failed - Model ID:', modelId, 'Available model IDs:', Array.from(modelLabelMap.keys()).slice(0, 5));
        } else {
          logger.info('[Dashboard] Match succeeded - Model ID:', modelId, '-> Label:', label);
        }
        
        // If still unavailable, use the model ID itself
        if (!label) {
          label = modelId;
        }
      } else {
        label = 'Unknown';
      }
      
      return {
        ...model,
        label: label,
      };
    });

    const recentActivityWithLabels = recentActivity.map((activity) => {
      const modelId = activity.model || null;
      let modelLabel = 'Unknown';
      
      // Prefer model_name when available
      if (activity.model_name) {
        modelLabel = activity.model_name;
      } else if (modelId) {
        modelLabel = findModelLabel(modelId, modelLabelMap, allModels) || modelId;
      }
      
      return {
        ...activity,
        modelLabel: modelLabel,
      };
    });

    return NextResponse.json({
      totalUsers,
      totalMessages,
      todayMessages,
      activeUsers,
      tokenUsage,
      usersChange: Number(usersChange.toFixed(1)),
      messagesChange: Number(messagesChange.toFixed(1)),
      activeUsersChange: Number(activeUsersChange.toFixed(1)),
      topModels: topModelsWithLabels,
      recentActivity: recentActivityWithLabels,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
      prevPeriodStart: prevStartDate.toISOString(),
      prevPeriodEnd: prevEndDate.toISOString(),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard data:', error);
    return createServerError(error, 'Failed to fetch data.');
  }
}
