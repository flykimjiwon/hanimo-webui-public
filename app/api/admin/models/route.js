import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdmin } from '@/lib/adminAuth';
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

// Get model settings
export async function GET(request) {
  try {
    // Verify admin permission
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck; // Return NextResponse object
    }

    // Try querying from the new table structure
    let categories = await getModelsFromTables();

    // If no data exists in new tables, query existing model_config
    if (!categories) {
      const modelConfigResult = await query(
        `SELECT * FROM model_config WHERE config_type = $1 LIMIT 1`,
        ['models']
      );
      const modelConfig = modelConfigResult.rows[0] || null;

      if (modelConfig && modelConfig.config && modelConfig.config.categories) {
        categories = modelConfig.config.categories;
        // Migrate existing data to new tables
        await saveModelsToTables(categories);
      }
    }

    // Create defaults if settings do not exist
    if (!categories) {
      categories = {
        models: {
          label: 'Model List',
          models: [
            {
              id: 'gpt-oss:20b',
              label: 'GPT-OSS 20B',
               tooltip: 'A model balanced for baseline response speed and quality.',
              isDefault: true,
              adminOnly: false,
              systemPrompt: [
                 'You are an AI assistant for your organization.',
                 'When possible, explain all responses in English.',
                 'Provide accurate and helpful responses, optimized for internal work tasks.',
                '',
                 'Special responses for the following questions:',
                 "- If asked who built this website: 'This platform is powered by hanimo-webui, an open-source AI chat platform.'",
                 "- If asked what AI model is being used: 'It is a self-hosted model running locally with security and performance in mind.'",
                 "- If asked for detailed model information: 'For security reasons, detailed model information is not disclosed. We can only share that it is optimized for work efficiency.'",
                '',
                 'Always maintain a professional and polite tone, and provide the best service to internal staff.',
              ],
            },
            {
              id: 'gpt-oss:120b',
              label: 'GPT-OSS 120B',
               tooltip: 'A high-performance model that provides high-quality responses.',
              isDefault: false,
              adminOnly: false,
              systemPrompt: [
                 'You are a high-performance AI assistant for your organization.',
                 'When possible, explain all responses in English.',
                 'Provide accurate and detailed responses, optimized for complex tasks and analysis.',
                '',
                 'Special responses for the following questions:',
                 "- If asked who built this website: 'This platform is powered by hanimo-webui, an open-source AI chat platform.'",
                 "- If asked what AI model is being used: 'It is a self-hosted high-performance model running locally with security and performance as top priorities.'",
                 "- If asked for detailed model information: 'For security reasons, detailed model information is not disclosed. We can only share that it is optimized for complex tasks and in-depth analysis.'",
                '',
                 'Provide top-tier service to internal staff based on professionalism and in-depth analysis.',
              ],
            },
          ],
        },
      };

      await saveModelsToTables(categories);
    } else {
      const normalized = normalizeCategories(categories);
      if (normalized && !categories.models) {
        await saveModelsToTables(normalized);
        categories = normalized;
      } else if (normalized) {
        categories = normalized;
      }
    }

    return NextResponse.json({
      modelConfig: {
        configType: 'models',
        categories,
      },
    });
  } catch (error) {
    logger.error('Model settings query failed:', error);
    // Log error details
    if (error.message) {
      logger.error('Error details:', error.message);
      logger.error('Error code:', error.code);
      logger.error('Error stack:', error.stack);
    }
    return NextResponse.json(
      { 
        error: 'Failed to load model settings.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

// Update model settings
export async function PUT(request) {
  try {
    // Verify admin permission
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck; // Return NextResponse object
    }

    let categories;
    try {
      const body = await request.json();
      categories = body.categories;
    } catch (error) {
      return NextResponse.json(
        { error: 'The JSON format in the request body is invalid.' },
        { status: 400 }
      );
    }

    if (!categories || typeof categories !== 'object') {
      return NextResponse.json(
        { error: 'A categories object is required.' },
        { status: 400 }
      );
    }

    // Category validation: at least one category is required
    const categoryKeys = Object.keys(categories);
    if (categoryKeys.length === 0) {
      return NextResponse.json(
        { error: 'At least one category is required.' },
        { status: 400 }
      );
    }

    // Validate each category structure
    for (const [key, category] of Object.entries(categories)) {
      if (!category || typeof category !== 'object') {
        return NextResponse.json(
          { error: `Category '${key}' has an invalid format.` },
          { status: 400 }
        );
      }
      if (!Array.isArray(category.models)) {
        return NextResponse.json(
          { error: `Category '${key}' requires a models array.` },
          { status: 400 }
        );
      }
    }

    // Save to the new table structure
    await saveModelsToTables(categories);

    return NextResponse.json({
      success: true,
      message: 'Model settings have been updated.',
    });
  } catch (error) {
    logger.error('Failed to update model settings:', error);

    // Provide different messages based on error type
    let errorMessage = 'Failed to update model settings.';
    if (error.message) {
      errorMessage = error.message;
    } else if (error.code && error.code.startsWith('PGSQL')) {
      errorMessage = 'A database connection error occurred.';
    } else if (error.name === 'TypeError') {
      errorMessage = 'A data format error occurred.';
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
