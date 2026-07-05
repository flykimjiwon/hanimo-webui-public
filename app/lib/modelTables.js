import logger from '@/lib/logger';
import { query, transaction } from '@/lib/postgres';
import { isValidUUID } from '@/lib/utils';

/**
 * Query model settings in categories format from new table structure
 */
export async function getModelsFromTables() {
  try {
    // First check if tables exist
    const tablesCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('model_categories', 'models', 'model_info')
    `);

    const existingTables = tablesCheck.rows.map((row) => row.table_name);

    // Return null if model_categories or model_info table does not exist
    if (
      !existingTables.includes('model_categories') &&
      !existingTables.includes('model_info')
    ) {
      logger.info(
        '[modelTables] model_categories or model_info table does not exist.'
      );
      return null;
    }

    // Return null if models table does not exist
    if (!existingTables.includes('models')) {
      logger.info('[modelTables] models table does not exist.');
      return null;
    }

    // Check if columns exist
    const columnCheckResult = await query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'models' AND column_name IN ('endpoint', 'api_config', 'api_key', 'multi_turn_limit', 'multi_turn_unlimited', 'visible')`
    );
    const columnNames = new Set(
      columnCheckResult.rows.map((row) => row.column_name)
    );
    const hasEndpointColumn = columnNames.has('endpoint');
    const hasApiConfigColumn = columnNames.has('api_config');
    const hasApiKeyColumn = columnNames.has('api_key');
    const hasMultiturnColumns =
      columnNames.has('multi_turn_limit') &&
      columnNames.has('multi_turn_unlimited');
    const hasVisibleColumn = columnNames.has('visible');

    // Query categories (ordered by display_order)
    // Check both model_info and model_categories (backward compatibility)
    let categoriesResult;
    try {
      if (existingTables.includes('model_info')) {
        categoriesResult = await query(
          `SELECT id, category_key, label, display_order 
           FROM model_info 
           ORDER BY display_order ASC`
        );
      } else {
        categoriesResult = await query(
          `SELECT id, category_key, label, display_order 
           FROM model_categories 
           ORDER BY display_order ASC`
        );
      }
    } catch (error) {
      // Table exists but query failed
      logger.error('[modelTables] Category query failed:', error.message);
      return null;
    }

    if (categoriesResult.rows.length === 0) {
      return null;
    }

    const categories = {};

    // Query models for each category
    for (const category of categoriesResult.rows) {
      const selectFields = [
        'id, model_name, label, tooltip, is_default, admin_only, system_prompt',
        hasEndpointColumn ? 'endpoint' : null,
        hasApiConfigColumn ? 'api_config' : null,
        hasApiKeyColumn ? 'api_key' : null,
        hasMultiturnColumns ? 'multi_turn_limit, multi_turn_unlimited' : null,
        hasVisibleColumn ? 'visible' : null,
        'display_order',
      ]
        .filter(Boolean)
        .join(', ');

      try {
        const modelsResult = await query(
          `SELECT ${selectFields}
           FROM models 
           WHERE category_id = $1 
           ORDER BY display_order ASC`,
          [category.id]
        );

        categories[category.category_key] = {
          label: category.label,
          models: modelsResult.rows.map((model) => ({
            id: model.label || model.model_name || model.id, // Prefer label, fall back to model_name
            dbId: model.id, // Preserve UUID on save
            modelName: model.model_name || model.id, // Keep original model name
            label: model.label || model.model_name || model.id, // Label required, fall back to model_name
            tooltip: model.tooltip,
            isDefault: model.is_default,
            adminOnly: model.admin_only,
            visible: hasVisibleColumn ? (model.visible !== false) : true, // Default true
            systemPrompt: model.system_prompt || [],
            endpoint: hasEndpointColumn ? model.endpoint || '' : '',
            apiConfig: hasApiConfigColumn ? model.api_config || null : null,
            apiKey: hasApiKeyColumn ? model.api_key || null : null,
            multiturnLimit: hasMultiturnColumns
              ? model.multi_turn_limit ?? null
              : null,
            multiturnUnlimited: hasMultiturnColumns
              ? !!model.multi_turn_unlimited
              : false,
          })),
        };
      } catch (error) {
        // Log and continue on model query failure for specific category
        logger.warn(
          `[modelTables] Category ${category.category_key} model query failed:`,
          error.message
        );
        categories[category.category_key] = {
          label: category.label,
          models: [],
        };
      }
    }

    return categories;
  } catch (error) {
    logger.error('[modelTables] Model query failed:', error);
    // Log error details
    if (error.message) {
      logger.error('[modelTables] Error details:', error.message);
      logger.error('[modelTables] Error code:', error.code);
    }
    return null;
  }
}

/**
 * Check and fix foreign key constraints (called outside transaction)
 */
async function fixForeignKeyConstraints() {
  try {
    // Check if models table exists
    const modelsTableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'models'
      )
    `);

    if (!modelsTableCheck.rows[0].exists) {
      return; // No constraint fix needed if table does not exist
    }

    // Check foreign key constraints
    const fkCheck = await query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'models'
        AND kcu.column_name = 'category_id'
    `);

    // Delete and recreate if invalid foreign key constraint found
    if (fkCheck.rows.length > 0) {
      const fk = fkCheck.rows[0];
      if (fk.foreign_table_name !== 'model_categories') {
        logger.warn(
          `[modelTables] Invalid foreign key constraint found: ${fk.constraint_name}, Referenced table: ${fk.foreign_table_name}`
        );
        // Delete invalid constraint (separate transaction)
        await query(
          `ALTER TABLE models DROP CONSTRAINT IF EXISTS ${fk.constraint_name}`
        );
        // Add correct foreign key constraint
        await query(`
          ALTER TABLE models 
          ADD CONSTRAINT models_category_id_fkey 
          FOREIGN KEY (category_id) 
          REFERENCES model_categories(id) 
          ON DELETE CASCADE
        `);
        logger.info('[modelTables] Foreign key constraint fix complete');
      }
    } else {
      // Add foreign key constraint if missing
      await query(`
        ALTER TABLE models 
        ADD CONSTRAINT models_category_id_fkey 
        FOREIGN KEY (category_id) 
        REFERENCES model_categories(id) 
        ON DELETE CASCADE
      `);
    }
  } catch (error) {
    // Only warn and continue on constraint check/fix failure
    logger.warn(
      '[modelTables] Foreign key constraint check failed (ignored):',
      error.message
    );
  }
}

/**
 * Check if required tables exist and create if not
 */
async function ensureTablesExist(client) {
  // Enable UUID extension (if needed)
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  } catch (error) {
    // Ignore if extension already exists or no permission
    if (!error.message.includes('already exists')) {
      logger.warn(
        '[modelTables] UUID extension activation failed (ignored):',
        error.message
      );
    }
  }

  // Check and create model_categories table
  const categoriesTableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'model_categories'
    )
  `);

  if (!categoriesTableCheck.rows[0].exists) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS model_categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        category_key VARCHAR(50) UNIQUE NOT NULL,
        label VARCHAR(255) NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Check and create models table
  const modelsTableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'models'
    )
  `);

  if (!modelsTableCheck.rows[0].exists) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS models (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        category_id UUID REFERENCES model_categories(id) ON DELETE CASCADE,
        model_name VARCHAR(255) NOT NULL,
        label VARCHAR(255) NOT NULL,
        tooltip TEXT,
        is_default BOOLEAN DEFAULT false,
        admin_only BOOLEAN DEFAULT false,
        system_prompt TEXT[],
        endpoint VARCHAR(500),
        multi_turn_limit INTEGER,
        multi_turn_unlimited BOOLEAN DEFAULT false,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  // Add endpoint column to models table if missing
  const endpointColumnCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'models' AND column_name = 'endpoint'
    )
  `);

  if (!endpointColumnCheck.rows[0].exists) {
    await client.query(`
      ALTER TABLE models ADD COLUMN endpoint VARCHAR(500)
    `);
  }

  // Add multi_turn_limit column to models table if missing
  const multiTurnLimitCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'models' AND column_name = 'multi_turn_limit'
    )
  `);

  if (!multiTurnLimitCheck.rows[0].exists) {
    await client.query(`
      ALTER TABLE models ADD COLUMN multi_turn_limit INTEGER
    `);
  }

  // Add multi_turn_unlimited column to models table if missing
  const multiTurnUnlimitedCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'models' AND column_name = 'multi_turn_unlimited'
    )
  `);

  if (!multiTurnUnlimitedCheck.rows[0].exists) {
    await client.query(`
      ALTER TABLE models ADD COLUMN multi_turn_unlimited BOOLEAN DEFAULT false
    `);
  }
}

/**
 * Save model settings to new table structure
 */
export async function saveModelsToTables(categories) {
  // Fix foreign key constraints before starting transaction (separate transaction)
  await fixForeignKeyConstraints();

  return await transaction(async (client) => {
    // Check table existence and create within transaction
    await ensureTablesExist(client);

    // Check if columns exist
    const columnCheckResult = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'models' AND column_name IN ('endpoint', 'multi_turn_limit', 'multi_turn_unlimited', 'visible')`
    );
    const columnNames = new Set(
      columnCheckResult.rows.map((row) => row.column_name)
    );
    const hasEndpointColumn = columnNames.has('endpoint');
    const hasMultiturnColumns =
      columnNames.has('multi_turn_limit') &&
      columnNames.has('multi_turn_unlimited');
    const hasVisibleColumn = columnNames.has('visible');
    // PII columns removed in open-source build — keep flags false so legacy
    // INSERT/UPDATE branches below fall through to non-PII paths.
    const hasPiiColumns = false;
    const hasPiiOptionColumns = false;

    // List of received category keys
    const providedCategoryKeys = Object.keys(categories);

    // List of received model dbIds (for checking undeleted models later)
    const providedModelDbIds = new Set();

    // Process per category (use UPSERT instead of full delete)
    let categoryOrder = 0;
    for (const [categoryKey, categoryData] of Object.entries(categories)) {
      // Insert/update category (table existence guaranteed)
      // Check existence before INSERT to prevent transaction errors
      let categoryResult;

      // First check existing category
      const existingCategory = await client.query(
        `SELECT id FROM model_categories WHERE category_key = $1`,
        [categoryKey]
      );

      if (existingCategory.rows.length > 0) {
        // Update if existing category found
        categoryResult = await client.query(
          `UPDATE model_categories 
           SET label = $1, display_order = $2, updated_at = $3
           WHERE category_key = $4
           RETURNING id`,
          [
            categoryData.label || categoryKey,
            categoryOrder++,
            new Date(),
            categoryKey,
          ]
        );
      } else {
        // Insert if no existing category
        categoryResult = await client.query(
          `INSERT INTO model_categories (category_key, label, display_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            categoryKey,
            categoryData.label || categoryKey,
            categoryOrder++,
            new Date(),
            new Date(),
          ]
        );
      }

      const categoryId = categoryResult.rows[0].id;

      // Query existing models in category (for checking undeleted models later)
      const existingModelsInCategory = await client.query(
        `SELECT id FROM models WHERE category_id = $1`,
        [categoryId]
      );
      const existingModelIdsInCategory = new Set(
        existingModelsInCategory.rows.map((row) => row.id)
      );

      // Insert/update models (by id)
      if (categoryData.models && Array.isArray(categoryData.models)) {
        let modelOrder = 0;
        for (const model of categoryData.models) {
          try {
            const actualModelName = model.modelName || model.id;
            const visibleValue = model.visible !== false;
            let persistedModelId = null;
            let effectiveDbId =
              model.dbId || (isValidUUID(model.id) ? model.id : null);
            if (!effectiveDbId && actualModelName && model.label) {
              // Find existing model by model_name+label (same name, different label = separate model)
              const existingByName = await client.query(
                `SELECT id FROM models WHERE model_name = $1 AND label = $2 LIMIT 1`,
                [actualModelName, model.label]
              );
              if (existingByName.rows.length > 0) {
                effectiveDbId = existingByName.rows[0].id;
              }
            }
            // Process by id(dbId): update if dbId exists, register new otherwise
            if (effectiveDbId) {
              // Update by id if dbId exists
              const existingModelResult = await client.query(
                `SELECT id FROM models WHERE id = $1`,
                [effectiveDbId]
              );

              if (existingModelResult.rows.length > 0) {
                // Update by id if existing model found
                const modelId = existingModelResult.rows[0].id;
                providedModelDbIds.add(modelId);
                persistedModelId = modelId;

                // Update query (by id)
                // Prefer modelName, fall back to id
                // actualModelName is computed above
                 if (hasEndpointColumn) {
                  if (hasMultiturnColumns) {
                    if (hasVisibleColumn) {
                      if (hasPiiColumns) {
                        await client.query(
                          `UPDATE models SET
                            category_id = $1,
                            model_name = $2,
                            label = $3,
                            tooltip = $4,
                            is_default = $5,
                            admin_only = $6,
                            system_prompt = $7,
                            endpoint = $8,
                            api_config = $9,
                            api_key = $10,
                            multi_turn_limit = $11,
                            multi_turn_unlimited = $12,
                            visible = $13,
                            pii_filter_request = $14,
                            pii_filter_response = $15,
                            display_order = $16,
                            updated_at = $17
                           WHERE id = $18`,
                          [
                            categoryId,
                            actualModelName,
                            model.label,
                            model.tooltip || null,
                            model.isDefault || false,
                            model.adminOnly || false,
                            model.systemPrompt || [],
                            model.endpoint || null,
                            model.apiConfig || null,
                            model.apiKey || null,
                            model.multiturnLimit ?? null,
                            model.multiturnUnlimited || false,
                            visibleValue,
                            model.piiFilterRequest || false,
                            model.piiFilterResponse || false,
                            modelOrder++,
                            new Date(),
                            modelId,
                          ]
                        );
                      } else {
                        await client.query(
                          `UPDATE models SET
                            category_id = $1,
                            model_name = $2,
                            label = $3,
                            tooltip = $4,
                            is_default = $5,
                            admin_only = $6,
                            system_prompt = $7,
                            endpoint = $8,
                            api_config = $9,
                            api_key = $10,
                            multi_turn_limit = $11,
                            multi_turn_unlimited = $12,
                            visible = $13,
                            display_order = $14,
                            updated_at = $15
                           WHERE id = $16`,
                          [
                            categoryId,
                            actualModelName,
                            model.label,
                            model.tooltip || null,
                            model.isDefault || false,
                            model.adminOnly || false,
                            model.systemPrompt || [],
                            model.endpoint || null,
                            model.apiConfig || null,
                            model.apiKey || null,
                            model.multiturnLimit ?? null,
                            model.multiturnUnlimited || false,
                            visibleValue,
                            modelOrder++,
                            new Date(),
                            modelId,
                          ]
                        );
                      }
                    } else {
                      await client.query(
                        `UPDATE models SET
                          category_id = $1,
                          model_name = $2,
                          label = $3,
                          tooltip = $4,
                          is_default = $5,
                          admin_only = $6,
                          system_prompt = $7,
                          endpoint = $8,
                          api_config = $9,
                          api_key = $10,
                          multi_turn_limit = $11,
                          multi_turn_unlimited = $12,
                          display_order = $13,
                          updated_at = $14
                         WHERE id = $15`,
                        [
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          model.multiturnLimit ?? null,
                          model.multiturnUnlimited || false,
                          modelOrder++,
                          new Date(),
                          modelId,
                        ]
                      );
                    }
                  } else {
                    if (hasVisibleColumn) {
                      await client.query(
                        `UPDATE models SET
                          category_id = $1,
                          model_name = $2,
                          label = $3,
                          tooltip = $4,
                          is_default = $5,
                          admin_only = $6,
                          system_prompt = $7,
                          endpoint = $8,
                          api_config = $9,
                          api_key = $10,
                          visible = $11,
                          display_order = $12,
                          updated_at = $13
                         WHERE id = $14`,
                        [
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          visibleValue,
                          modelOrder++,
                          new Date(),
                          modelId,
                        ]
                      );
                    } else {
                      await client.query(
                        `UPDATE models SET
                          category_id = $1,
                          model_name = $2,
                          label = $3,
                          tooltip = $4,
                          is_default = $5,
                          admin_only = $6,
                          system_prompt = $7,
                          endpoint = $8,
                          api_config = $9,
                          api_key = $10,
                          display_order = $11,
                          updated_at = $12
                         WHERE id = $13`,
                        [
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          modelOrder++,
                          new Date(),
                          modelId,
                        ]
                      );
                    }
                  }
                } else if (hasMultiturnColumns) {
                  if (hasVisibleColumn) {
                    await client.query(
                      `UPDATE models SET
                        category_id = $1,
                        model_name = $2,
                        label = $3,
                        tooltip = $4,
                        is_default = $5,
                        admin_only = $6,
                        system_prompt = $7,
                        multi_turn_limit = $8,
                        multi_turn_unlimited = $9,
                        visible = $10,
                        display_order = $11,
                        updated_at = $12
                       WHERE id = $13`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        modelId,
                      ]
                    );
                  } else {
                    await client.query(
                      `UPDATE models SET
                        category_id = $1,
                        model_name = $2,
                        label = $3,
                        tooltip = $4,
                        is_default = $5,
                        admin_only = $6,
                        system_prompt = $7,
                        multi_turn_limit = $8,
                        multi_turn_unlimited = $9,
                        display_order = $10,
                        updated_at = $11
                       WHERE id = $12`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        modelOrder++,
                        new Date(),
                        modelId,
                      ]
                    );
                  }
                } else {
                  if (hasVisibleColumn) {
                    await client.query(
                      `UPDATE models SET
                        category_id = $1,
                        model_name = $2,
                        label = $3,
                        tooltip = $4,
                        is_default = $5,
                        admin_only = $6,
                        system_prompt = $7,
                        visible = $8,
                        display_order = $9,
                        updated_at = $10
                       WHERE id = $11`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        modelId,
                      ]
                    );
                  } else {
                    await client.query(
                      `UPDATE models SET
                        category_id = $1,
                        model_name = $2,
                        label = $3,
                        tooltip = $4,
                        is_default = $5,
                        admin_only = $6,
                        system_prompt = $7,
                        display_order = $8,
                        updated_at = $9
                       WHERE id = $10`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        modelOrder++,
                        new Date(),
                        modelId,
                      ]
                    );
                  }
                }
              } else {
                // Register new with specified id if dbId exists but no record found
                // Prefer modelName, fall back to id
                // actualModelName is computed above
                let insertResult;
                if (hasEndpointColumn) {
                  if (hasMultiturnColumns) {
                    if (hasVisibleColumn) {
                      insertResult = await client.query(
                        `INSERT INTO models (
                          id, category_id, model_name, label, tooltip, is_default, admin_only,
                          system_prompt, endpoint, api_config, api_key, multi_turn_limit, multi_turn_unlimited,
                          visible, display_order, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                        RETURNING id`,
                        [
                          effectiveDbId,
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          model.multiturnLimit ?? null,
                          model.multiturnUnlimited || false,
                          visibleValue,
                          modelOrder++,
                          new Date(),
                          new Date(),
                        ]
                      );
                    } else {
                      insertResult = await client.query(
                        `INSERT INTO models (
                          id, category_id, model_name, label, tooltip, is_default, admin_only,
                          system_prompt, endpoint, api_config, api_key, multi_turn_limit, multi_turn_unlimited,
                          display_order, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                        RETURNING id`,
                        [
                          effectiveDbId,
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          model.multiturnLimit ?? null,
                          model.multiturnUnlimited || false,
                          modelOrder++,
                          new Date(),
                          new Date(),
                        ]
                      );
                    }
                  } else {
                    if (hasVisibleColumn) {
                      insertResult = await client.query(
                        `INSERT INTO models (
                          id, category_id, model_name, label, tooltip, is_default, admin_only,
                          system_prompt, endpoint, api_config, api_key, visible,
                          display_order, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                        RETURNING id`,
                        [
                          effectiveDbId,
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          visibleValue,
                          modelOrder++,
                          new Date(),
                          new Date(),
                        ]
                      );
                    } else {
                      insertResult = await client.query(
                        `INSERT INTO models (
                          id, category_id, model_name, label, tooltip, is_default, admin_only,
                          system_prompt, endpoint, api_config, api_key, display_order, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                        RETURNING id`,
                        [
                          effectiveDbId,
                          categoryId,
                          actualModelName,
                          model.label,
                          model.tooltip || null,
                          model.isDefault || false,
                          model.adminOnly || false,
                          model.systemPrompt || [],
                          model.endpoint || null,
                          model.apiConfig || null,
                          model.apiKey || null,
                          modelOrder++,
                          new Date(),
                          new Date(),
                        ]
                      );
                    }
                  }
                } else if (hasMultiturnColumns) {
                  if (hasVisibleColumn) {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        id, category_id, model_name, label, tooltip, is_default, admin_only, 
                        system_prompt, multi_turn_limit, multi_turn_unlimited, visible,
                        display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                      RETURNING id`,
                      [
                        effectiveDbId,
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  } else {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        id, category_id, model_name, label, tooltip, is_default, admin_only, 
                        system_prompt, multi_turn_limit, multi_turn_unlimited, display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                      RETURNING id`,
                      [
                        effectiveDbId,
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  }
                } else {
                  if (hasVisibleColumn) {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        id, category_id, model_name, label, tooltip, is_default, admin_only, 
                        system_prompt, visible, display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                      RETURNING id`,
                      [
                        effectiveDbId,
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  } else {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        id, category_id, model_name, label, tooltip, is_default, admin_only, 
                        system_prompt, display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                      RETURNING id`,
                      [
                        effectiveDbId,
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  }
                }
                // Record dbId of newly inserted model
                if (insertResult.rows.length > 0) {
                  providedModelDbIds.add(insertResult.rows[0].id);
                  persistedModelId = insertResult.rows[0].id;
                }

                if (persistedModelId && hasPiiColumns) {
                  await client.query(
                    `UPDATE models
                     SET pii_filter_request = $1,
                         pii_filter_response = $2
                     WHERE id = $3`,
                    [
                      model.piiFilterRequest || false,
                      model.piiFilterResponse || false,
                      persistedModelId,
                    ]
                  );
                }

                if (persistedModelId && hasPiiOptionColumns) {
                  await client.query(
                    `UPDATE models
                     SET pii_request_mxt_vrf = $1,
                         pii_request_mask_opt = $2,
                         pii_response_mxt_vrf = $3,
                         pii_response_mask_opt = $4
                     WHERE id = $5`,
                    [
                      model.piiRequestMxtVrf !== false,
                      model.piiRequestMaskOpt !== false,
                      model.piiResponseMxtVrf !== false,
                      model.piiResponseMaskOpt !== false,
                      persistedModelId,
                    ]
                  );
                }
              }
            } else {
              // Register new if no dbId (id auto-generated)
              // Prefer modelName, fall back to id
              // actualModelName is computed above
              let insertResult;
              if (hasEndpointColumn) {
                if (hasMultiturnColumns) {
                  if (hasVisibleColumn) {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        category_id, model_name, label, tooltip, is_default, admin_only,
                        system_prompt, endpoint, api_config, api_key, multi_turn_limit, multi_turn_unlimited,
                        visible, display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                      RETURNING id`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.endpoint || null,
                        model.apiConfig || null,
                        model.apiKey || null,
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  } else {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        category_id, model_name, label, tooltip, is_default, admin_only,
                        system_prompt, endpoint, api_config, api_key, multi_turn_limit, multi_turn_unlimited,
                        display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                      RETURNING id`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.endpoint || null,
                        model.apiConfig || null,
                        model.apiKey || null,
                        model.multiturnLimit ?? null,
                        model.multiturnUnlimited || false,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  }
                } else {
                  if (hasVisibleColumn) {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        category_id, model_name, label, tooltip, is_default, admin_only,
                        system_prompt, endpoint, api_config, api_key, visible,
                        display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                      RETURNING id`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.endpoint || null,
                        model.apiConfig || null,
                        model.apiKey || null,
                        visibleValue,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  } else {
                    insertResult = await client.query(
                      `INSERT INTO models (
                        category_id, model_name, label, tooltip, is_default, admin_only,
                        system_prompt, endpoint, api_config, api_key, display_order, created_at, updated_at
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                      RETURNING id`,
                      [
                        categoryId,
                        actualModelName,
                        model.label,
                        model.tooltip || null,
                        model.isDefault || false,
                        model.adminOnly || false,
                        model.systemPrompt || [],
                        model.endpoint || null,
                        model.apiConfig || null,
                        model.apiKey || null,
                        modelOrder++,
                        new Date(),
                        new Date(),
                      ]
                    );
                  }
                }
              } else if (hasMultiturnColumns) {
                if (hasVisibleColumn) {
                  insertResult = await client.query(
                    `INSERT INTO models (
                      category_id, model_name, label, tooltip, is_default, admin_only, 
                      system_prompt, multi_turn_limit, multi_turn_unlimited, visible,
                      display_order, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    RETURNING id`,
                    [
                      categoryId,
                      actualModelName,
                      model.label,
                      model.tooltip || null,
                      model.isDefault || false,
                      model.adminOnly || false,
                      model.systemPrompt || [],
                      model.multiturnLimit ?? null,
                      model.multiturnUnlimited || false,
                      visibleValue,
                      modelOrder++,
                      new Date(),
                      new Date(),
                    ]
                  );
                } else {
                  insertResult = await client.query(
                    `INSERT INTO models (
                      category_id, model_name, label, tooltip, is_default, admin_only, 
                      system_prompt, multi_turn_limit, multi_turn_unlimited,
                      display_order, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING id`,
                    [
                      categoryId,
                      actualModelName,
                      model.label,
                      model.tooltip || null,
                      model.isDefault || false,
                      model.adminOnly || false,
                      model.systemPrompt || [],
                      model.multiturnLimit ?? null,
                      model.multiturnUnlimited || false,
                      modelOrder++,
                      new Date(),
                      new Date(),
                    ]
                  );
                }
              } else {
                if (hasVisibleColumn) {
                  insertResult = await client.query(
                    `INSERT INTO models (
                      category_id, model_name, label, tooltip, is_default, admin_only, 
                      system_prompt, visible, display_order, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id`,
                    [
                      categoryId,
                      actualModelName,
                      model.label,
                      model.tooltip || null,
                      model.isDefault || false,
                      model.adminOnly || false,
                      model.systemPrompt || [],
                      visibleValue,
                      modelOrder++,
                      new Date(),
                      new Date(),
                    ]
                  );
                } else {
                  insertResult = await client.query(
                    `INSERT INTO models (
                      category_id, model_name, label, tooltip, is_default, admin_only, 
                      system_prompt, display_order, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id`,
                    [
                      categoryId,
                      actualModelName,
                      model.label,
                      model.tooltip || null,
                      model.isDefault || false,
                      model.adminOnly || false,
                      model.systemPrompt || [],
                      modelOrder++,
                      new Date(),
                      new Date(),
                    ]
                  );
                }
              }
              // Record dbId of newly inserted model
              if (insertResult.rows.length > 0) {
                const insertedId = insertResult.rows[0].id;
                providedModelDbIds.add(insertedId);
                persistedModelId = insertedId;
              }

              if (persistedModelId && hasPiiColumns) {
                await client.query(
                  `UPDATE models
                   SET pii_filter_request = $1,
                       pii_filter_response = $2
                   WHERE id = $3`,
                  [
                    model.piiFilterRequest || false,
                    model.piiFilterResponse || false,
                    persistedModelId,
                  ]
                );
              }

              if (persistedModelId && hasPiiOptionColumns) {
                await client.query(
                  `UPDATE models
                   SET pii_request_mxt_vrf = $1,
                       pii_request_mask_opt = $2,
                       pii_response_mxt_vrf = $3,
                       pii_response_mask_opt = $4
                   WHERE id = $5`,
                  [
                    model.piiRequestMxtVrf !== false,
                    model.piiRequestMaskOpt !== false,
                    model.piiResponseMxtVrf !== false,
                    model.piiResponseMaskOpt !== false,
                    persistedModelId,
                  ]
                );
              }
            }
          } catch (error) {
            // When an error occurs within a transaction, the transaction enters an aborted state.
            // Attempting additional queries in the catch block causes "current transaction is aborted" error.
            // Therefore, throw the error immediately to rollback the transaction.

            // Detailed error logging on foreign key constraint violation
            if (error.code === '23503') {
              logger.error(
                `[modelTables] Foreign key constraint violation: category_id=${categoryId}does not exist in model_categories table.`
              );
              logger.error(
                `[modelTables] Category key: ${categoryKey}, Model ID: ${model.id}`
              );
              // Transaction already aborted, cannot execute additional queries
              // Throw error immediately to rollback transaction
              throw new Error(
                `Category ID ${categoryId} does not exist. Category insert may have failed. Original error: ${error.message}`
              );
            }

            // Also throw other errors immediately
            throw error;
          }
        }

        // Delete models not received for this category (keep only received models)
        // Delete by comparing received model dbIds with existing model ids
        const modelsToDelete = Array.from(existingModelIdsInCategory).filter(
          (id) => !providedModelDbIds.has(id)
        );

        if (modelsToDelete.length > 0) {
          logger.info(
            `[modelTables] Category ${categoryKey}: ${modelsToDelete.length} model(s) deleted`
          );
          await client.query(`DELETE FROM models WHERE id = ANY($1::uuid[])`, [
            modelsToDelete,
          ]);
        }
      }
    }

    return { success: true };
  });
}
