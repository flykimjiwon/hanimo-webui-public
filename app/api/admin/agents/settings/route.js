import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createServerError } from '@/lib/errorHandler';
import { getModelsFromTables } from '@/lib/modelTables';

const DEFAULT_SETTINGS = {
  selectedModelId: '',
  defaultSlideCount: 8,
  defaultTheme: 'light',
  defaultTone: 'business',
  allowUserModelOverride: false,
};

const ALLOWED_THEMES = new Set(['light', 'dark']);
const ALLOWED_TONES = new Set(['business', 'casual']);
const VALID_AGENT_IDS = new Set(['7']);

async function ensureAgentSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS agent_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id VARCHAR(50) NOT NULL UNIQUE,
      selected_model_id VARCHAR(255),
      default_slide_count INTEGER DEFAULT 8,
      default_theme VARCHAR(20) DEFAULT 'light',
      default_tone VARCHAR(20) DEFAULT 'business',
      allow_user_model_override BOOLEAN DEFAULT false,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(
    'CREATE INDEX IF NOT EXISTS idx_agent_settings_agent_id ON agent_settings(agent_id)'
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_agent_settings_selected_model ON agent_settings(selected_model_id)'
  );
  await query(`
    ALTER TABLE agent_settings
    ADD COLUMN IF NOT EXISTS extra_config JSONB DEFAULT '{}'
  `).catch(() => {});
}

function flattenModels(categories) {
  if (!categories || typeof categories !== 'object') return [];

  const result = [];

  for (const [categoryKey, category] of Object.entries(categories)) {
    const models = Array.isArray(category?.models) ? category.models : [];
    for (const model of models) {
      if (!model) continue;
      const canonicalId = String(model.modelName || model.id || '').trim();
      if (!canonicalId) continue;

      result.push({
        id: canonicalId,
        dbId: model.dbId || '',
        label: model.label || model.modelName || model.id || canonicalId,
        modelName: model.modelName || model.id || canonicalId,
        categoryKey,
        categoryLabel: category?.label || categoryKey,
        isDefault: model.isDefault === true,
        visible: model.visible !== false,
        adminOnly: model.adminOnly === true,
      });
    }
  }

  return result;
}

async function getModelOptions() {
  const categories = await getModelsFromTables();
  const allModels = flattenModels(categories);
  return allModels.filter((model) => model.visible);
}

function normalizeSettingsInput(settings) {
  const selectedModelId = String(settings?.selectedModelId || '').trim();
  const defaultSlideCount = Number(settings?.defaultSlideCount);
  const defaultTheme = String(settings?.defaultTheme || '').trim();
  const defaultTone = String(settings?.defaultTone || '').trim();
  const allowUserModelOverride = settings?.allowUserModelOverride === true;

  if (!Number.isInteger(defaultSlideCount) || defaultSlideCount < 1 || defaultSlideCount > 30) {
    return { error: 'Default slide count must be an integer between 1 and 30.' };
  }
  if (!ALLOWED_THEMES.has(defaultTheme)) {
    return { error: 'Default theme must be light or dark.' };
  }
  if (!ALLOWED_TONES.has(defaultTone)) {
    return { error: 'Default tone must be business or casual.' };
  }

  return {
    value: {
      selectedModelId,
      defaultSlideCount,
      defaultTheme,
      defaultTone,
      allowUserModelOverride,
    },
  };
}

export async function GET(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    await ensureAgentSettingsTable();

    const [settingsResult, modelOptions] = await Promise.all([
      query(
        `SELECT agent_id, selected_model_id, default_slide_count, default_theme, default_tone, allow_user_model_override, extra_config
         FROM agent_settings`
      ),
      getModelOptions(),
    ]);

    const settingsByAgent = {};
    for (const row of settingsResult.rows) {
      settingsByAgent[row.agent_id] = {
        selectedModelId: row.selected_model_id || '',
        defaultSlideCount: row.default_slide_count || DEFAULT_SETTINGS.defaultSlideCount,
        defaultTheme: row.default_theme || DEFAULT_SETTINGS.defaultTheme,
        defaultTone: row.default_tone || DEFAULT_SETTINGS.defaultTone,
        allowUserModelOverride: row.allow_user_model_override === true,
        extraConfig: row.extra_config || {},
      };
    }

    return NextResponse.json({
      settingsByAgent,
      modelOptions,
      defaultSettings: DEFAULT_SETTINGS,
    });
  } catch (error) {
    logger.error('[GET /api/admin/agents/settings] error:', error);
    return createServerError(error);
  }
}

export async function POST(request) {
  try {
    const authResult = await verifyAdminWithResult(request);
    if (!authResult.valid) {
      const status = authResult.error?.includes('Admin') ? 403 : 401;
      return NextResponse.json({ error: authResult.error }, { status });
    }

    await ensureAgentSettingsTable();

    const body = await request.json();
    const agentId = String(body?.agentId || '').trim();
    const settings = body?.settings;

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required.' }, { status: 400 });
    }
    if (!VALID_AGENT_IDS.has(agentId)) {
      return NextResponse.json(
        { error: 'Invalid agentId.' },
        { status: 400 }
      );
    }
    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'settings object is required.' }, { status: 400 });
    }

    const normalized = normalizeSettingsInput(settings);
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const modelOptions = await getModelOptions();
    const modelIds = new Set(modelOptions.map((model) => model.id));
    const modelDbIds = new Set(
      modelOptions.map((model) => model.dbId).filter(Boolean)
    );
    if (
      normalized.value.selectedModelId &&
      !modelIds.has(normalized.value.selectedModelId) &&
      !modelDbIds.has(normalized.value.selectedModelId)
    ) {
      return NextResponse.json(
        { error: 'Only registered models can be selected.' },
        { status: 400 }
      );
    }

    const normalizedSelectedModel = modelOptions.find(
      (model) =>
        model.id === normalized.value.selectedModelId ||
        model.dbId === normalized.value.selectedModelId
    )?.id;

    const extraConfig = normalized.value.extraConfig || {};

    const result = await query(
      `INSERT INTO agent_settings (
         agent_id,
         selected_model_id,
         default_slide_count,
         default_theme,
         default_tone,
         allow_user_model_override,
         extra_config,
         updated_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (agent_id)
       DO UPDATE SET
         selected_model_id = EXCLUDED.selected_model_id,
         default_slide_count = EXCLUDED.default_slide_count,
         default_theme = EXCLUDED.default_theme,
         default_tone = EXCLUDED.default_tone,
         allow_user_model_override = EXCLUDED.allow_user_model_override,
         extra_config = EXCLUDED.extra_config,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING agent_id, selected_model_id, default_slide_count, default_theme, default_tone, allow_user_model_override, extra_config`,
      [
        agentId,
        normalizedSelectedModel || null,
        normalized.value.defaultSlideCount,
        normalized.value.defaultTheme,
        normalized.value.defaultTone,
        normalized.value.allowUserModelOverride,
        JSON.stringify(extraConfig),
        authResult.user.id,
      ]
    );

    const row = result.rows[0];
    return NextResponse.json({
      message: 'Agent settings saved.',
      settings: {
        selectedModelId: row.selected_model_id || '',
        defaultSlideCount: row.default_slide_count,
        defaultTheme: row.default_theme,
        defaultTone: row.default_tone,
        allowUserModelOverride: row.allow_user_model_override === true,
      },
    });
  } catch (error) {
    logger.error('[POST /api/admin/agents/settings] error:', error);
    return createServerError(error);
  }
}
