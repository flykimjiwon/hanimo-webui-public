import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdmin } from '@/lib/adminAuth';

// Helper function to convert model ID to display name
async function getModelLabelMap() {
  const modelLabelMap = new Map();

  try {
    const { query: queryPostgres } = await import('@/lib/postgres');
    const addModelToMap = (model) => {
      const modelId = model.id;
      const modelName = model.model_name || model.modelName;
      const label = model.label;

      if (modelId && !modelLabelMap.has(modelId)) {
        modelLabelMap.set(modelId, label);
      }

      if (modelName) {
        if (!modelLabelMap.has(modelName)) {
          modelLabelMap.set(modelName, label);
        }

        if (modelName.includes('/')) {
          const shortId = modelName.split('/').pop();
          if (shortId && !modelLabelMap.has(shortId)) {
            modelLabelMap.set(shortId, label);
          }
        }

        if (modelName.includes(':')) {
          const baseId = modelName.split(':')[0];
          if (baseId && !modelLabelMap.has(baseId)) {
            modelLabelMap.set(baseId, label);
          }
        }
      }
    };

    // Query models from the new table structure (directly from models table)
    const modelsResult = await queryPostgres(
      'SELECT id, model_name, label FROM models ORDER BY display_order ASC'
    );

    if (modelsResult.rows.length > 0) {
      modelsResult.rows.forEach((model) => addModelToMap(model));

      logger.info('[Analytics] Models loaded from models table:', modelsResult.rows.length, 'items');
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
                  modelName: model.modelName,
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
    logger.warn('[Analytics] Model settings query failed:', error.message);
  }

  return modelLabelMap;
}

export async function GET(request) {
  // Check admin privileges
  const authResult = verifyAdmin(request);
  if (authResult.error) {
    return authResult;
  }

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '7days';
  const department = url.searchParams.get('department') || 'all';
  const authType = url.searchParams.get('authType') || '';
  const customStartDateParam = url.searchParams.get('startDate');
  const customEndDateParam = url.searchParams.get('endDate');

  const authSql3 = authType ? ' AND u.auth_type = $4' : '';
  const authSql2 = authType ? ' AND u.auth_type = $3' : '';
  const authParam = authType ? [authType] : [];

  try {
    const modelLogsColumnResult = await query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'model_logs' AND column_name = 'user_id'
      LIMIT 1
    `
    );
    const hasModelLogsUserId = modelLogsColumnResult.rows.length > 0;
    // Calculate dates by period
    const now = new Date();
    let startDate;
    let endDate = now;

    // Custom date parsing function
    const parseCustomDate = (dateStr, isEnd) => {
      if (!dateStr) return null;
      const suffix = isEnd ? 'T23:59:59.999' : 'T00:00:00';
      const parsed = new Date(`${dateStr}${suffix}`);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    if (period === 'custom') {
      // Custom period mode
      startDate = parseCustomDate(customStartDateParam, false);
      endDate = parseCustomDate(customEndDateParam, true) || now;

      // If startDate is missing, default to 7 days
      if (!startDate) {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }
    } else {
      // Existing period options
      switch (period) {
        case '7days':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '3months':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1year':
          startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }
    }

    // Department filter conditions
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    // Fetch data in parallel
    const [
      userStatsResult,
      modelStatsResult,
      departmentStatsResult,
      dailyActivityResult,
      tokenUsageResult,
      modelLabelMap,
    ] = await Promise.all([
      // Usage by user (top 20)
      department !== 'all'
        ? query(
            `SELECT 
              u.email as _id,
              u.email,
              u.name,
              u.department,
              u.cell,
              COUNT(*)::INTEGER as "messageCount",
              MAX(activity.created_at) as "lastActivity",
              ROUND(COUNT(*)::NUMERIC / $1, 2) as "avgPerDay"
            FROM (
              SELECT user_id, created_at
              FROM messages
              WHERE created_at >= $2
                AND role = 'user'
            ) activity
            INNER JOIN users u ON activity.user_id = u.id
            WHERE u.department = $3${authSql3}
            GROUP BY u.email, u.name, u.department, u.cell
            ORDER BY "messageCount" DESC
            LIMIT 20`,
            [daysDiff, startDate, department, ...authParam]
          )
        : query(
            `SELECT 
              u.email as _id,
              u.email,
              u.name,
              u.department,
              u.cell,
              COUNT(*)::INTEGER as "messageCount",
              MAX(activity.created_at) as "lastActivity",
              ROUND(COUNT(*)::NUMERIC / $1, 2) as "avgPerDay"
            FROM (
              SELECT user_id, created_at
              FROM messages
              WHERE created_at >= $2
                AND role = 'user'
            ) activity
            INNER JOIN users u ON activity.user_id = u.id
            GROUP BY u.email, u.name, u.department, u.cell
            ORDER BY "messageCount" DESC
            LIMIT 20`,
            [daysDiff, startDate]
          ),

      // Usage by model
      department !== 'all'
        ? query(
            `SELECT COALESCE(models.model_name, m.model) as _id, COUNT(*)::INTEGER as count
             FROM (
               SELECT model, user_id, timestamp as created_at
               FROM external_api_logs
               WHERE timestamp >= $1
                 AND (api_type IS NULL OR api_type <> 'pii-detect')
             ) m
             INNER JOIN users u ON m.user_id = u.id
             LEFT JOIN models ON m.model = models.id::text OR m.model = models.model_name
             WHERE u.department = $2${authSql2}
             GROUP BY COALESCE(models.model_name, m.model)
             ORDER BY count DESC`,
            [startDate, department, ...authParam]
          )
        : query(
            `SELECT COALESCE(models.model_name, combined.model) as _id, COUNT(*)::INTEGER as count
             FROM (
               SELECT model
               FROM external_api_logs
               WHERE timestamp >= $1
                 AND (api_type IS NULL OR api_type <> 'pii-detect')
             ) combined
             LEFT JOIN models ON combined.model = models.id::text OR combined.model = models.model_name
             GROUP BY COALESCE(models.model_name, combined.model)
             ORDER BY count DESC`,
            [startDate]
          ),

      // Stats by department (only when department is 'all')
      department === 'all'
        ? query(
            `SELECT 
              u.department as _id,
              COUNT(*)::INTEGER as "messageCount",
              COUNT(DISTINCT u.email)::INTEGER as "userCount"
            FROM (
              SELECT user_id, created_at
              FROM messages
              WHERE created_at >= $1
                AND role = 'user'
            ) activity
            INNER JOIN users u ON activity.user_id = u.id
            WHERE u.department IS NOT NULL
            GROUP BY u.department
            ORDER BY "messageCount" DESC`,
            [startDate]
          )
        : Promise.resolve({ rows: [] }),

      // Daily activity
      department !== 'all'
        ? query(
            `SELECT 
              TO_CHAR(activity.created_at, 'YYYY-MM-DD') as _id,
              COUNT(*)::INTEGER as "messageCount",
              COUNT(DISTINCT u.email)::INTEGER as "userCount"
            FROM (
              SELECT user_id, created_at
              FROM messages
              WHERE created_at >= $1
                AND role = 'user'
            ) activity
            INNER JOIN users u ON activity.user_id = u.id
            WHERE u.department = $2${authSql2}
            GROUP BY TO_CHAR(activity.created_at, 'YYYY-MM-DD')
            ORDER BY _id ASC`,
            [startDate, department, ...authParam]
          )
        : query(
            `SELECT 
              TO_CHAR(activity.created_at, 'YYYY-MM-DD') as _id,
              COUNT(*)::INTEGER as "messageCount",
              COUNT(DISTINCT u.email)::INTEGER as "userCount"
            FROM (
              SELECT user_id, created_at
              FROM messages
              WHERE created_at >= $1
                AND role = 'user'
            ) activity
            INNER JOIN users u ON activity.user_id = u.id
            GROUP BY TO_CHAR(activity.created_at, 'YYYY-MM-DD')
            ORDER BY _id ASC`,
            [startDate]
          ),

      // Token usage by user (top 20) - external API + model_logs (when available)
      department !== 'all'
        ? query(
            hasModelLogsUserId
              ? `SELECT
                  u.email as _id,
                  u.email,
                  u.name,
                  u.department,
                  u.cell,
                  COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
                  COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
                  COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
                  COUNT(*)::INTEGER as "requestCount"
                FROM (
                  SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
                  FROM external_api_logs
                  WHERE timestamp >= $1
                  UNION ALL
                  SELECT user_id, prompt_tokens, completion_tokens as response_tokens, total_tokens
                  FROM model_logs
                  WHERE timestamp >= $1
                ) combined
                INNER JOIN users u ON combined.user_id = u.id
                 WHERE u.department = $2${authSql2}
                 GROUP BY u.email, u.name, u.department, u.cell
                 ORDER BY "totalTokens" DESC
                 LIMIT 20`
              : `SELECT
                  u.email as _id,
                  u.email,
                  u.name,
                  u.department,
                  u.cell,
                  COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
                  COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
                  COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
                  COUNT(*)::INTEGER as "requestCount"
                FROM (
                  SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
                  FROM external_api_logs
                  WHERE timestamp >= $1
                ) combined
                INNER JOIN users u ON combined.user_id = u.id
                 WHERE u.department = $2${authSql2}
                 GROUP BY u.email, u.name, u.department, u.cell
                 ORDER BY "totalTokens" DESC
                 LIMIT 20`,
            [startDate, department, ...authParam]
          )
        : query(
            hasModelLogsUserId
              ? `SELECT
                  u.email as _id,
                  u.email,
                  u.name,
                  u.department,
                  u.cell,
                  COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
                  COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
                  COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
                  COUNT(*)::INTEGER as "requestCount"
                FROM (
                  SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
                  FROM external_api_logs
                  WHERE timestamp >= $1
                  UNION ALL
                  SELECT user_id, prompt_tokens, completion_tokens as response_tokens, total_tokens
                  FROM model_logs
                  WHERE timestamp >= $1
                ) combined
                INNER JOIN users u ON combined.user_id = u.id
                GROUP BY u.email, u.name, u.department, u.cell
                ORDER BY "totalTokens" DESC
                LIMIT 20`
              : `SELECT
                  u.email as _id,
                  u.email,
                  u.name,
                  u.department,
                  u.cell,
                  COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
                  COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
                  COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
                  COUNT(*)::INTEGER as "requestCount"
                FROM (
                  SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
                  FROM external_api_logs
                  WHERE timestamp >= $1
                ) combined
                INNER JOIN users u ON combined.user_id = u.id
                GROUP BY u.email, u.name, u.department, u.cell
                ORDER BY "totalTokens" DESC
                LIMIT 20`,
            [startDate]
          ),

      // Load model settings
      getModelLabelMap(),
    ]);

    const userStats = userStatsResult.rows;
    const modelStats = modelStatsResult.rows;
    const departmentStats = departmentStatsResult.rows;
    const dailyActivity = dailyActivityResult.rows;
    const tokenUsage = tokenUsageResult.rows;

    const isLikelyUuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      );

    // Convert model ID to display name (treat UUID as deleted model)
    const modelStatsWithLabels = modelStats.map((model) => {
      const modelId = model?._id ? String(model._id).trim() : '';
      let label = modelLabelMap.get(modelId) || modelId;

      if (!label && isLikelyUuid(modelId)) {
        label = '<Deleted Model>';
      } else if (isLikelyUuid(label) && !modelLabelMap.get(label)) {
        label = '<Deleted Model>';
      }

      return {
        ...model,
        label,
      };
    });

    // Add stats by cell (when a specific department is selected) - normalization: join by user_id
    let cellStats = [];
    if (department !== 'all') {
      const cellStatsResult = await query(
        `SELECT 
          u.cell as _id,
          COUNT(*)::INTEGER as "messageCount",
          COUNT(DISTINCT u.email)::INTEGER as "userCount"
        FROM (
          SELECT user_id, created_at
          FROM messages
          WHERE created_at >= $1
            AND role = 'user'
        ) activity
        INNER JOIN users u ON activity.user_id = u.id
        WHERE u.department = $2${authSql2}
          AND u.cell IS NOT NULL
        GROUP BY u.cell
        ORDER BY "messageCount" DESC`,
        [startDate, department, ...authParam]
      );
      cellStats = cellStatsResult.rows;
    }

    // Token usage by department - web chat (model_logs) + external API (external_api_logs) combined
    let departmentTokenUsage = [];
    if (department === 'all') {
      const deptTokenResult = await query(
        hasModelLogsUserId
          ? `SELECT
              u.department as _id,
              COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
              COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
              COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
              COUNT(*)::INTEGER as "requestCount",
              COUNT(DISTINCT u.email)::INTEGER as "userCount"
            FROM (
              SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
              FROM external_api_logs
              WHERE timestamp >= $1
              UNION ALL
              SELECT user_id, prompt_tokens, completion_tokens as response_tokens, total_tokens
              FROM model_logs
              WHERE timestamp >= $1
            ) combined
            INNER JOIN users u ON combined.user_id = u.id
            WHERE u.department IS NOT NULL
            GROUP BY u.department
            ORDER BY "totalTokens" DESC`
          : `SELECT
              u.department as _id,
              COALESCE(SUM(combined.prompt_tokens), 0)::INTEGER as "promptTokens",
              COALESCE(SUM(combined.response_tokens), 0)::INTEGER as "responseTokens",
              COALESCE(SUM(combined.total_tokens), 0)::INTEGER as "totalTokens",
              COUNT(*)::INTEGER as "requestCount",
              COUNT(DISTINCT u.email)::INTEGER as "userCount"
            FROM (
              SELECT user_id, prompt_token_count as prompt_tokens, response_token_count as response_tokens, total_token_count as total_tokens
              FROM external_api_logs
              WHERE timestamp >= $1
            ) combined
            INNER JOIN users u ON combined.user_id = u.id
            WHERE u.department IS NOT NULL
            GROUP BY u.department
            ORDER BY "totalTokens" DESC`,
        [startDate]
      );
      departmentTokenUsage = deptTokenResult.rows;
    }

    return NextResponse.json({
      userStats,
      modelStats: modelStatsWithLabels,
      departmentStats,
      cellStats,
      dailyActivity,
      tokenUsage,
      departmentTokenUsage,
      period,
      department,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to retrieve analytics data:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve analytics data.' },
      { status: 500 }
    );
  }
}
