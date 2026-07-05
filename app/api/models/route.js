import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import {
  getModelOptions,
  getDefaultModel,
  getEnvironment,
} from '@/lib/modelServers';
import { query } from '@/lib/postgres';
import { verifyToken } from '@/lib/auth';
import { getModelsFromTables, saveModelsToTables } from '@/lib/modelTables';

function normalizeCategories(categories) {
  if (!categories || typeof categories !== 'object') return null;

  const hasModelsCategory =
    categories.models && Array.isArray(categories.models.models);

  const mergedModels = hasModelsCategory
    ? [...categories.models.models]
    : Object.values(categories).flatMap((category) =>
        Array.isArray(category?.models) ? category.models : []
      );

  if (mergedModels.length === 0) {
    return { models: { label: 'Model List', models: [] } };
  }

  const normalizedModels = mergedModels.map((model) => ({ ...model }));
  let defaultIndex = normalizedModels.findIndex((m) => m.isDefault);
  if (defaultIndex === -1) {
    defaultIndex = 0;
  }
  normalizedModels.forEach((model, index) => {
    model.isDefault = index === defaultIndex;
  });

  return {
    models: {
      label: 'Model List',
      models: normalizedModels,
    },
  };
}

export async function GET(request) {
  try {
    const payload = verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    // Try querying from the new table structure
    let categories = await getModelsFromTables();

    // If no data exists in new tables, query from legacy model_config
    if (!categories) {
      const modelConfigResult = await query(
        'SELECT * FROM model_config WHERE config_type = $1 LIMIT 1',
        ['models']
      );
      
      const modelConfig = modelConfigResult.rows[0] || null;
      
      if (modelConfig && modelConfig.config && modelConfig.config.categories) {
        categories = modelConfig.config.categories;
        // Migrate existing data to new tables
        await saveModelsToTables(categories);
      }
    }

    if (categories) {
      logger.info('[/api/models] Model settings loaded from DB');

      const normalizedCategories = normalizeCategories(categories);
      if (normalizedCategories && !categories.models) {
        await saveModelsToTables(normalizedCategories);
        categories = normalizedCategories;
      } else if (normalizedCategories) {
        categories = normalizedCategories;
      }

      // Use role from JWT token (not client header)
      const userRole = payload.role || 'user';
      const isAdmin = ['admin', 'manager'].includes(userRole);

      const filteredCategories = { ...categories };
      Object.keys(filteredCategories).forEach((categoryKey) => {
        if (filteredCategories[categoryKey].models) {
          let filtered = filteredCategories[categoryKey].models.filter(
            (model) => model.visible !== false
          );
          if (!isAdmin) {
            filtered = filtered.filter((model) => !model.adminOnly);
            filtered = filtered.map(({ systemPrompt, apiKey, endpoint, apiConfig, ...safeModel }) => safeModel);
          }
          filteredCategories[categoryKey] = {
            ...filteredCategories[categoryKey],
            models: filtered,
          };
        }
      });

      // Find default model from all models
      const allModels = Object.values(filteredCategories).flatMap(
        (category) => category.models || []
      );

      const defaultModel =
        allModels.find((m) => m.isDefault)?.id ||
        allModels[0]?.id ||
        'gemma3:1b';

      return NextResponse.json({
        modelConfig: { categories: filteredCategories }, // Return filtered categories structure
        defaultModel,
        environment: getEnvironment(),
        success: true,
        source: 'database',
      });
    } else {
      logger.info('[/api/models] No DB config, using default settings');

      // If no admin settings exist, convert default ollama.js structure to categories format
      const ollamaModels = getModelOptions();
      const defaultModel = getDefaultModel();

      // Convert Ollama models to categories structure
      const categories = {
        models: {
          label: 'Model List',
          models: ollamaModels,
        },
      };

      // Add a default value if no models exist
      if (categories.models.models.length === 0) {
        categories.models.models.push({
          id: 'gemma3:1b',
          label: 'Gemma 3 1B',
          tooltip: 'Model for development',
          isDefault: true,
        });
      }

      const normalizedFallback = normalizeCategories(categories);

      return NextResponse.json({
        modelConfig: { categories: normalizedFallback || categories },
        defaultModel,
        environment: getEnvironment(),
        success: true,
        source: 'ollama',
      });
    }
  } catch (error) {
    logger.error('[/api/models] Failed to retrieve model options:', error);

    // Return hardcoded default settings on error
    const fallbackCategories = {
      models: {
        label: 'Model List',
        models: [
          {
            id: 'gemma3:1b',
            label: 'Gemma 3 1B',
            tooltip: 'Default model',
            isDefault: true,
          },
        ],
      },
    };

    return NextResponse.json({
      modelConfig: { categories: fallbackCategories },
      defaultModel: 'gemma3:1b',
      environment: getEnvironment(),
      success: true,
      source: 'fallback',
    });
  }
}
