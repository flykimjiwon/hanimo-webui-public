import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult, verifyToken } from '@/lib/auth';
import {
  createAuthError,
  createValidationError,
  createServerError,
} from '@/lib/errorHandler';
import {
  maskCustomEndpointSecrets,
  resolveCustomEndpointSecret,
} from '@/lib/security/settings-secrets.mjs';
import {
  decryptProviderEndpoints,
  encryptProviderEndpoints,
  encryptProviderSecret,
} from '@/lib/security/provider-credentials.mjs';
import { validateProviderEndpoint } from '@/lib/security/provider-outbound.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_SITE_TITLE = 'Hanimo';
const DEFAULT_SITE_DESCRIPTION = 'Self-hosted AI workspace';
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

async function ensureSettingsColumns() {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'settings'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  const missing = [];

  if (!columns.has('max_images_per_message')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS max_images_per_message INTEGER DEFAULT 5'
    );
  }
  if (!columns.has('max_user_question_length')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS max_user_question_length INTEGER DEFAULT 300000'
    );
  }
  if (!columns.has('image_analysis_model')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS image_analysis_model VARCHAR(255)'
    );
  }
  if (!columns.has('image_analysis_prompt')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS image_analysis_prompt VARCHAR(500)'
    );
  }
  if (!columns.has('profile_edit_enabled')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS profile_edit_enabled BOOLEAN DEFAULT false'
    );
  }
  if (!columns.has('manual_preset_base_url')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS manual_preset_base_url VARCHAR(500) DEFAULT 'https://api.openai.com'"
    );
  }
  if (!columns.has('manual_preset_api_base')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS manual_preset_api_base VARCHAR(500) DEFAULT 'https://api.openai.com'"
    );
  }
  if (!columns.has('board_enabled')) {
    missing.push('ADD COLUMN IF NOT EXISTS board_enabled BOOLEAN DEFAULT true');
  }
  if (!columns.has('support_contacts')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS support_contacts JSONB DEFAULT '[]'::jsonb"
    );
  }
  if (!columns.has('support_contacts_enabled')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS support_contacts_enabled BOOLEAN DEFAULT true'
    );
  }
  if (!columns.has('login_type')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS login_type VARCHAR(20) DEFAULT 'local'"
    );
  }
  if (!columns.has('api_config_example')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS api_config_example TEXT'
    );
  }
  if (!columns.has('api_curl_example')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS api_curl_example TEXT'
    );
  }
  if (!columns.has('draw_enabled')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS draw_enabled BOOLEAN DEFAULT false'
    );
  }
  if (!columns.has('draw_model')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS draw_model VARCHAR(255)'
    );
  }
  if (!columns.has('draw_system_prompt')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS draw_system_prompt TEXT'
    );
  }
  if (!columns.has('theme_preset')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS theme_preset VARCHAR(30) DEFAULT 'amber-soft'"
    );
  }
  if (!columns.has('theme_colors')) {
    missing.push(
      "ADD COLUMN IF NOT EXISTS theme_colors JSONB DEFAULT '{}'::jsonb"
    );
  }
  if (!columns.has('ghost_mode_enabled')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS ghost_mode_enabled BOOLEAN DEFAULT false'
    );
  }
  if (!columns.has('ghost_bubble_enabled')) {
    missing.push(
      'ADD COLUMN IF NOT EXISTS ghost_bubble_enabled BOOLEAN DEFAULT true'
    );
  }

  if (missing.length > 0) {
    await query(`ALTER TABLE settings ${missing.join(', ')}`);
  }
}

// Fetch settings (readable by regular users too)
export async function GET(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
    // Fetch settings
    let settingsResult = await query(
      'SELECT * FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );
    let settings = settingsResult.rows[0] || null;

    // Convert snake_case to camelCase
    if (settings) {
      settings = {
        configType: settings.config_type,
        tooltipEnabled: settings.tooltip_enabled,
        tooltipMessage: settings.tooltip_message,
        chatWidgetEnabled: settings.chat_widget_enabled,
        profileEditEnabled: settings.profile_edit_enabled,
        manualPresetBaseUrl: settings.manual_preset_base_url,
        manualPresetApiBase: settings.manual_preset_api_base,
        boardEnabled: settings.board_enabled,
        supportContacts: settings.support_contacts,
        supportContactsEnabled: settings.support_contacts_enabled,
        siteTitle: settings.site_title,
        siteDescription: settings.site_description,
        faviconUrl: settings.favicon_url,
        roomNameGenerationModel: settings.room_name_generation_model,
        maxImagesPerMessage: settings.max_images_per_message,
        maxUserQuestionLength: settings.max_user_question_length,
        imageAnalysisModel: settings.image_analysis_model,
        imageAnalysisPrompt: settings.image_analysis_prompt,
        ollamaEndpoints: settings.ollama_endpoints,
        endpointType: settings.endpoint_type,
        openaiCompatBase: settings.openai_compat_base,
        openaiCompatApiKey: settings.openai_compat_api_key,
        customEndpoints: settings.custom_endpoints,
        loginType: settings.login_type,
        apiConfigExample: settings.api_config_example,
        apiCurlExample: settings.api_curl_example,
        drawEnabled: settings.draw_enabled,
        drawModel: settings.draw_model,
        drawSystemPrompt: settings.draw_system_prompt,
        themePreset: settings.theme_preset,
        themeColors: settings.theme_colors,
        ghostModeEnabled: settings.ghost_mode_enabled,
        ghostBubbleEnabled: settings.ghost_bubble_enabled,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at,
      };
    }

    // Create default settings if missing
    if (!settings) {
      const defaultSettings = {
        configType: 'general',
        tooltipEnabled: true,
        tooltipMessage: 'You can also use higher-performance models',
        chatWidgetEnabled: false,
        profileEditEnabled: false,
        manualPresetBaseUrl: 'https://api.openai.com',
        manualPresetApiBase: 'https://api.openai.com',
        boardEnabled: true,
        supportContacts: [],
        supportContactsEnabled: true,
        siteTitle: DEFAULT_SITE_TITLE,
        siteDescription: DEFAULT_SITE_DESCRIPTION,
        faviconUrl: null,
        roomNameGenerationModel: 'gemma3:4b',
        maxUserQuestionLength: 300000,
        // Model server endpoints (comma-separated string)
        ollamaEndpoints: 'http://localhost:11434',
        // LLM model server type: 'ollama' | 'openai-compatible'
        endpointType: 'ollama',
        // OpenAI-compatible model server settings (store apiKey, exclude from GET response)
        openaiCompatBase: process.env.OPENAI_COMPAT_BASE || '',
        openaiCompatApiKey: process.env.OPENAI_COMPAT_API_KEY || '',
        // Custom model server config array [{name,url,provider}]
        customEndpoints: [],
        // Login type ('local' | 'sso')
        loginType: 'local',
        // API key page configuration examples
        apiConfigExample: `name: Local Agent
version: 1.0.0
schema: v1
models:
  - title: "My Chat Model"
    provider: "openai"
    model: "gemma3:4b"
    apiKey: "YOUR_API_KEY"
    baseUrl: "http://localhost:3000/v1"`,
        apiCurlExample: `curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_API_KEY" ^
  -d "{\\\"model\\\": \\\"gemma3:4b\\\", \\\"messages\\\": [{\\\"role\\\": \\\"user\\\", \\\"content\\\": \\\"Hello!\\\"}], \\\"stream\\\": true}"`,
        createdAt: new Date(),
        updatedAt: new Date(),
        themePreset: 'amber-soft',
        themeColors: {
          light: {
            '--primary': '#e5a63b',
            '--primary-foreground': '#ffffff',
            '--ring': '#f5be5b',
            '--chart-1': '#e5a63b',
            '--chart-3': '#f5be5b',
            '--sidebar-primary': '#e5a63b',
            '--sidebar-ring': '#f5be5b'
          },
          dark: {
            '--primary': '#f5be5b',
            '--primary-foreground': '#1c1917',
            '--ring': '#fcd480',
            '--chart-1': '#f5be5b',
            '--chart-3': '#fcd480',
            '--sidebar-primary': '#f5be5b',
            '--sidebar-ring': '#fcd480'
          }
        },
      };

      await query(
        `INSERT INTO settings (
          config_type, tooltip_enabled, tooltip_message,
          chat_widget_enabled, profile_edit_enabled, board_enabled, manual_preset_base_url, manual_preset_api_base, site_title, site_description, favicon_url,
          room_name_generation_model, max_user_question_length, ollama_endpoints,
          endpoint_type, openai_compat_base, openai_compat_api_key, custom_endpoints, support_contacts,
          support_contacts_enabled,
          theme_preset, theme_colors,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
        [
          'general',
          defaultSettings.tooltipEnabled,
          defaultSettings.tooltipMessage,
          defaultSettings.chatWidgetEnabled,
          defaultSettings.profileEditEnabled,
          defaultSettings.boardEnabled,
          defaultSettings.manualPresetBaseUrl,
          defaultSettings.manualPresetApiBase,
          defaultSettings.siteTitle,
          defaultSettings.siteDescription,
          defaultSettings.faviconUrl,
          defaultSettings.roomNameGenerationModel,
          defaultSettings.maxUserQuestionLength,
          defaultSettings.ollamaEndpoints,
          defaultSettings.endpointType,
          defaultSettings.openaiCompatBase,
          defaultSettings.openaiCompatApiKey,
          JSON.stringify(defaultSettings.customEndpoints),
          JSON.stringify(defaultSettings.supportContacts || []),
          defaultSettings.supportContactsEnabled,
          defaultSettings.createdAt,
          defaultSettings.updatedAt,
          defaultSettings.themePreset,
          JSON.stringify(defaultSettings.themeColors),
        ]
      );

      settings = defaultSettings;
    }

    // Build customEndpoints response (infer from ollamaEndpoints if missing)
    let customEndpoints =
      Array.isArray(settings.customEndpoints) &&
      settings.customEndpoints.length > 0
        ? settings.customEndpoints
        : (settings.ollamaEndpoints || '')
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
            .map((entry) => {
              const m = entry.match(/^(.*?)\s*[|=｜＝]\s*(https?:\/\/.+)$/i);
              if (m) {
                return {
                  name: m[1].trim(),
                  url: m[2].trim(),
                  provider: 'ollama',
                };
              }
              return { name: '', url: entry, provider: 'ollama' };
            });

    return NextResponse.json(
      {
        tooltipEnabled:
          settings.tooltipEnabled !== undefined ? settings.tooltipEnabled : true,
        tooltipMessage:
          settings.tooltipMessage || 'You can also use higher-performance models',
        chatWidgetEnabled:
          settings.chatWidgetEnabled !== undefined
            ? settings.chatWidgetEnabled
            : false,
        profileEditEnabled:
          settings.profileEditEnabled !== undefined
            ? settings.profileEditEnabled
            : false,
        manualPresetBaseUrl:
          settings.manualPresetBaseUrl || 'https://api.openai.com',
        manualPresetApiBase:
          settings.manualPresetApiBase || 'https://api.openai.com',
        boardEnabled:
          settings.boardEnabled !== undefined ? settings.boardEnabled : true,
        supportContacts: Array.isArray(settings.supportContacts)
          ? settings.supportContacts
          : [],
        supportContactsEnabled:
          settings.supportContactsEnabled !== undefined
            ? settings.supportContactsEnabled
            : true,
        siteTitle: settings.siteTitle || DEFAULT_SITE_TITLE,
        siteDescription: settings.siteDescription || DEFAULT_SITE_DESCRIPTION,
        faviconUrl: settings.faviconUrl || null,
        roomNameGenerationModel:
          settings.roomNameGenerationModel || 'gemma3:4b',
        maxImagesPerMessage: settings.maxImagesPerMessage || 5,
        maxUserQuestionLength: settings.maxUserQuestionLength || 300000,
        imageAnalysisModel: settings.imageAnalysisModel || null,
        imageAnalysisPrompt:
          settings.imageAnalysisPrompt || 'Describe this image.',
        // Prefer DB value, otherwise use default
        ollamaEndpoints: settings.ollamaEndpoints || 'http://localhost:11434',
        // Model server type and OpenAI-compatible settings (sensitive data excluded)
        endpointType:
          settings.endpointType === 'openai-compatible'
            ? 'openai-compatible'
            : 'ollama',
        openaiCompatBase: settings.openaiCompatBase || '',
        openaiCompatApiKeySet: !!settings.openaiCompatApiKey,
        customEndpoints: maskCustomEndpointSecrets(customEndpoints),
        // Login type setting
        loginType: settings.loginType || 'local',
        // API key page example settings
        apiConfigExample: settings.apiConfigExample || '',
        apiCurlExample: settings.apiCurlExample || '',
        drawEnabled:
          settings.drawEnabled !== undefined ? settings.drawEnabled : false,
        drawModel: settings.drawModel || '',
        drawSystemPrompt: settings.drawSystemPrompt || '',
        themePreset: settings.themePreset || 'amber-soft',
        themeColors: settings.themeColors || {},
        ghostModeEnabled:
          settings.ghostModeEnabled !== undefined ? settings.ghostModeEnabled : false,
        ghostBubbleEnabled:
          settings.ghostBubbleEnabled !== undefined ? settings.ghostBubbleEnabled : true,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return createServerError(error, 'Failed to load settings.');
  }
}

// Update settings
export async function PUT(request) {
  try {
    // Verify admin privileges
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    await ensureSettingsColumns();

    const {
      tooltipEnabled,
      tooltipMessage,
      chatWidgetEnabled,
      profileEditEnabled,
      manualPresetBaseUrl,
      manualPresetApiBase,
      boardEnabled,
      supportContacts,
      supportContactsEnabled,
      siteTitle,
      siteDescription,
      faviconUrl,
      roomNameGenerationModel,
      maxImagesPerMessage,
      maxUserQuestionLength,
      imageAnalysisModel,
      imageAnalysisPrompt,
      ollamaEndpoints,
      endpointType,
      openaiCompatBase,
      openaiCompatApiKey,
      customEndpoints,
      loginType,
      apiConfigExample,
      apiCurlExample,
      drawEnabled,
      drawModel,
      drawSystemPrompt,
      themePreset,
      themeColors,
      ghostModeEnabled,
      ghostBubbleEnabled,
    } = await request.json();

    // Validate input values
    const updateData = {};


    if (tooltipEnabled !== undefined) {
      if (typeof tooltipEnabled !== 'boolean') {
        return createValidationError('Tooltip enabled must be a boolean value.');
      }
      updateData.tooltipEnabled = tooltipEnabled;
    }

    if (tooltipMessage !== undefined) {
      if (typeof tooltipMessage !== 'string' || tooltipMessage.length > 100) {
        return createValidationError(
          'Tooltip message must be a string of 100 characters or fewer.'
        );
      }
      updateData.tooltipMessage = tooltipMessage;
    }

    if (chatWidgetEnabled !== undefined) {
      if (typeof chatWidgetEnabled !== 'boolean') {
        return createValidationError(
          'Chat widget enabled must be a boolean value.'
        );
      }
      updateData.chatWidgetEnabled = chatWidgetEnabled;
    }

    if (profileEditEnabled !== undefined) {
      if (typeof profileEditEnabled !== 'boolean') {
        return createValidationError(
          'Profile edit menu enabled must be a boolean value.'
        );
      }
      updateData.profileEditEnabled = profileEditEnabled;
    }

    if (manualPresetBaseUrl !== undefined) {
      if (
        manualPresetBaseUrl !== null &&
        typeof manualPresetBaseUrl !== 'string'
      ) {
        return createValidationError(
          'Preset baseUrl must be a string or null.'
        );
      }
      updateData.manualPresetBaseUrl = manualPresetBaseUrl;
    }

    if (manualPresetApiBase !== undefined) {
      if (
        manualPresetApiBase !== null &&
        typeof manualPresetApiBase !== 'string'
      ) {
        return createValidationError(
          'Preset apiBase must be a string or null.'
        );
      }
      updateData.manualPresetApiBase = manualPresetApiBase;
    }

    if (boardEnabled !== undefined) {
      if (typeof boardEnabled !== 'boolean') {
        return createValidationError(
          'Board enabled must be a boolean value.'
        );
      }
      updateData.boardEnabled = boardEnabled;
    }

    if (supportContacts !== undefined) {
      if (!Array.isArray(supportContacts)) {
        return createValidationError('Support contact list must be an array.');
      }
      const normalized = supportContacts
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const department =
            typeof item.department === 'string'
              ? item.department.trim().slice(0, 100)
              : '';
          const name =
            typeof item.name === 'string'
              ? item.name.trim().slice(0, 50)
              : '';
          const phone =
            typeof item.phone === 'string'
              ? item.phone.trim().slice(0, 30)
              : '';
          if (!department && !name && !phone) return null;
          return { department, name, phone };
        })
        .filter(Boolean);
      updateData.supportContacts = normalized;
    }

    if (supportContactsEnabled !== undefined) {
      if (typeof supportContactsEnabled !== 'boolean') {
        return createValidationError(
          'Support contacts enabled must be a boolean value.'
        );
      }
      updateData.supportContactsEnabled = supportContactsEnabled;
    }


    if (siteTitle !== undefined) {
      if (typeof siteTitle !== 'string' || siteTitle.length > 50) {
        return createValidationError(
          'Site title must be a string of 50 characters or fewer.'
        );
      }
      updateData.siteTitle = siteTitle;
    }

    if (siteDescription !== undefined) {
      if (typeof siteDescription !== 'string' || siteDescription.length > 200) {
        return createValidationError(
          'Site description must be a string of 200 characters or fewer.'
        );
      }
      updateData.siteDescription = siteDescription;
    }

    if (faviconUrl !== undefined) {
      if (
        faviconUrl !== null &&
        (typeof faviconUrl !== 'string' || faviconUrl.length > 500)
      ) {
        return createValidationError(
          'Favicon URL must be a string of 500 characters or fewer.'
        );
      }
      updateData.faviconUrl = faviconUrl;
    }

    if (roomNameGenerationModel !== undefined) {
      if (typeof roomNameGenerationModel !== 'string') {
        return createValidationError(
          'Room name generation model must be a string.'
        );
      }
      updateData.roomNameGenerationModel = roomNameGenerationModel;
    }

    if (maxImagesPerMessage !== undefined) {
      if (
        typeof maxImagesPerMessage !== 'number' ||
        maxImagesPerMessage < 1 ||
        maxImagesPerMessage > 20
      ) {
        return createValidationError(
          'Maximum images per message must be a number between 1 and 20.'
        );
      }
      updateData.maxImagesPerMessage = maxImagesPerMessage;
    }

    if (maxUserQuestionLength !== undefined) {
      if (
        typeof maxUserQuestionLength !== 'number' ||
        maxUserQuestionLength < 1000 ||
        maxUserQuestionLength > 1000000
      ) {
        return createValidationError(
          'Question length limit must be a number between 1,000 and 1,000,000.'
        );
      }
      updateData.maxUserQuestionLength = maxUserQuestionLength;
    }

    if (imageAnalysisModel !== undefined) {
      if (
        imageAnalysisModel !== null &&
        typeof imageAnalysisModel !== 'string'
      ) {
        return createValidationError(
          'Image analysis model must be a string or null.'
        );
      }
      updateData.imageAnalysisModel = imageAnalysisModel;
    }

    if (imageAnalysisPrompt !== undefined) {
      if (
        imageAnalysisPrompt !== null &&
        typeof imageAnalysisPrompt !== 'string'
      ) {
        return createValidationError(
          'Image analysis prompt must be a string or null.'
        );
      }
      updateData.imageAnalysisPrompt = imageAnalysisPrompt;
    }

    if (ollamaEndpoints !== undefined) {
      if (typeof ollamaEndpoints !== 'string' || ollamaEndpoints.length < 7) {
        return createValidationError(
          'Model server endpoints must be a string (comma-separated).'
        );
      }
      updateData.ollamaEndpoints = ollamaEndpoints
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)
        .join(',');
    }

    // Validate and save model server type
    if (endpointType !== undefined) {
      if (!['ollama', 'openai-compatible'].includes(endpointType)) {
        return createValidationError(
          "endpointType must be either 'ollama' or 'openai-compatible'."
        );
      }
      updateData.endpointType = endpointType;
    }

    // Validate and save OpenAI-compatible settings
    if (openaiCompatBase !== undefined) {
      if (typeof openaiCompatBase !== 'string') {
        return createValidationError('openaiCompatBase must be a string.');
      }
      updateData.openaiCompatBase = openaiCompatBase.trim();
    }

    if (openaiCompatApiKey !== undefined) {
      if (
        openaiCompatApiKey !== null &&
        typeof openaiCompatApiKey !== 'string'
      ) {
        return createValidationError(
          'openaiCompatApiKey must be a string or null.'
        );
      }
      // Sending null removes the key
      updateData.openaiCompatApiKey = encryptProviderSecret(
        openaiCompatApiKey ? openaiCompatApiKey.trim() : ''
      );
    }

    // Validate and synchronize custom model servers
    if (customEndpoints !== undefined) {
      if (!Array.isArray(customEndpoints)) {
        return createValidationError('customEndpoints must be an array.');
      }
      const existingEndpointResult = await query(
        'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
        ['general']
      );
      const existingCustomEndpoints = decryptProviderEndpoints(
        existingEndpointResult.rows[0]?.custom_endpoints || []
      );
      const sanitized = [];
      const seenNames = new Set(); // For duplicate name checking
      for (const item of customEndpoints) {
        if (!item || typeof item !== 'object') continue;
        const name =
          typeof item.name === 'string' ? item.name.trim().slice(0, 50) : '';
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        const provider =
          item.provider === 'openai-compatible'
            ? 'openai-compatible'
            : item.provider === 'gemini'
            ? 'gemini'
            : 'ollama';
        const apiKey = resolveCustomEndpointSecret(
          item,
          existingCustomEndpoints
        );
        if (item.apiKeySet === true && !apiKey && item.clearApiKey !== true) {
          return createValidationError(
            'Re-enter the model server API key when changing its URL.'
          );
        }
        // API key is required for Gemini provider
        if (provider === 'gemini' && !apiKey) {
          return createValidationError(
            'Gemini provider requires an API key.'
          );
        }
        if (!url) continue;
        if (!name) {
          return createValidationError('Model server name is required.');
        }
        // Check duplicate names (case-insensitive)
        const normalizedName = name.toLowerCase();
        if (seenNames.has(normalizedName)) {
          return createValidationError(`Duplicate model server name: ${name}`);
        }
        seenNames.add(normalizedName);
        try {
          await validateProviderEndpoint(url, { provider });
        } catch (error) {
          logger.warn('[Catch] Error occurred:', error.message);
          return createValidationError(error.message);
        }
        const isActive =
          item.isActive !== undefined ? Boolean(item.isActive) : true; // Default is active
        sanitized.push({ name, url, provider, apiKey, isActive });
      }
      updateData.customEndpoints = encryptProviderEndpoints(sanitized);
      // Also sync ollama-only list for compatibility
      const ollamaOnly = sanitized
        .filter((e) => e.provider === 'ollama')
        .map((e) => (e.name ? `${e.name}|${e.url}` : e.url))
        .join(',');
      updateData.ollamaEndpoints = ollamaOnly;
    }

    // Validate and save login type
    if (loginType !== undefined) {
      if (!['local', 'sso'].includes(loginType)) {
        return createValidationError(
          "loginType must be either 'local' or 'sso'."
        );
      }
      updateData.loginType = loginType;
    }

    // API key page config example
    if (apiConfigExample !== undefined) {
      if (apiConfigExample !== null && typeof apiConfigExample !== 'string') {
        return createValidationError(
          'API config example must be a string or null.'
        );
      }
      updateData.apiConfigExample = apiConfigExample || '';
    }

    // API key page curl example
    if (apiCurlExample !== undefined) {
      if (apiCurlExample !== null && typeof apiCurlExample !== 'string') {
        return createValidationError(
          'API curl example must be a string or null.'
        );
      }
      updateData.apiCurlExample = apiCurlExample || '';
    }

    if (drawEnabled !== undefined) {
      if (typeof drawEnabled !== 'boolean') {
        return createValidationError(
          'Draw enabled must be a boolean value.'
        );
      }
      updateData.drawEnabled = drawEnabled;
    }

    if (drawModel !== undefined) {
      if (drawModel !== null && typeof drawModel !== 'string') {
        return createValidationError(
          'Draw model must be a string or null.'
        );
      }
      updateData.drawModel = drawModel || '';
    }

    if (drawSystemPrompt !== undefined) {
      if (
        drawSystemPrompt !== null &&
        typeof drawSystemPrompt !== 'string'
      ) {
        return createValidationError(
          'Draw system prompt must be a string or null.'
        );
      }
      updateData.drawSystemPrompt = drawSystemPrompt || '';
    }

    // Validate and save theme preset
    if (themePreset !== undefined) {
      const VALID_PRESETS = ['amber-soft', 'blue', 'green', 'purple', 'rose', 'slate', 'custom'];
      if (typeof themePreset !== 'string' || !VALID_PRESETS.includes(themePreset)) {
        return createValidationError(
          `themePreset must be one of: ${VALID_PRESETS.join(', ')}.`
        );
      }
      updateData.themePreset = themePreset;
    }

    // Validate and save theme colors
    if (themeColors !== undefined) {
      if (typeof themeColors !== 'object' || themeColors === null) {
        return createValidationError('themeColors must be an object.');
      }
      const ALLOWED_VARS = [
        '--primary', '--primary-foreground', '--ring',
        '--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5',
        '--sidebar-primary', '--sidebar-primary-foreground', '--sidebar-ring'
      ];
      const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
      for (const mode of ['light', 'dark']) {
        if (themeColors[mode]) {
          if (typeof themeColors[mode] !== 'object') {
            return createValidationError(`themeColors.${mode} must be an object.`);
          }
          for (const [varName, value] of Object.entries(themeColors[mode])) {
            if (!ALLOWED_VARS.includes(varName)) {
              return createValidationError(`CSS variable '${varName}' is not allowed.`);
            }
            if (!HEX_REGEX.test(value)) {
              return createValidationError(`Invalid HEX color '${value}' for '${varName}'. Use format #RRGGBB.`);
            }
          }
        }
      }
      updateData.themeColors = themeColors;
    }

    if (ghostModeEnabled !== undefined) {
      if (typeof ghostModeEnabled !== 'boolean') {
        return createValidationError(
          'Ghost mode enabled must be a boolean value.'
        );
      }
      updateData.ghostModeEnabled = ghostModeEnabled;
    }

    if (ghostBubbleEnabled !== undefined) {
      if (typeof ghostBubbleEnabled !== 'boolean') {
        return createValidationError(
          'Ghost bubble enabled must be a boolean value.'
        );
      }
      updateData.ghostBubbleEnabled = ghostBubbleEnabled;
    }

    // Build PostgreSQL update query
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    // Build SET clause by converting each field to snake_case
    for (const [key, value] of Object.entries(updateData)) {
      if (key === 'updatedAt') continue; // updated_at handled separately

      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();

      if (key === 'customEndpoints' || key === 'supportContacts' || key === 'themeColors') {
        // JSONB fields use JSON.stringify
        setClauses.push(`${snakeKey} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else {
        setClauses.push(`${snakeKey} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    }

    if (setClauses.length === 0) {
      // When there are no fields to update
      return NextResponse.json({
        success: true,
        message: 'Settings have been updated.',
      });
    }

    // Add updated_at
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    // Add room_name_generation_model column if missing (legacy DB compatibility)
    try {
      await query(
        `ALTER TABLE settings 
         ADD COLUMN IF NOT EXISTS room_name_generation_model VARCHAR(255)`
      );
    } catch (alterError) {
      // Ignore if column already exists or fails for another reason
      logger.warn(
        '[Settings] Failed to add column (ignored):',
        alterError.message
      );
    }

    // Check existing record
    const existingResult = await query(
      'SELECT id FROM settings WHERE config_type = $1',
      ['general']
    );

    if (existingResult.rows.length > 0) {
      // UPDATE query
      await query(
        `UPDATE settings SET ${setClauses.join(', ')} WHERE config_type = $${
          params.length + 1
        }`,
        [...params, 'general']
      );
    } else {
      // INSERT query
      const insertColumns = [
        'config_type',
        ...Object.keys(updateData)
          .filter((k) => k !== 'updatedAt')
          .map((k) => k.replace(/([A-Z])/g, '_$1').toLowerCase()),
        'updated_at',
      ];
      const insertValues = ['general', ...params, 'CURRENT_TIMESTAMP'];
      const insertPlaceholders = insertValues
        .map((_, i) => `$${i + 1}`)
        .join(', ');

      await query(
        `INSERT INTO settings (${insertColumns.join(
          ', '
        )}) VALUES (${insertPlaceholders})`,
        insertValues
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Settings have been updated.',
      ...updateData,
    });
  } catch (error) {
    logger.error('Failed to update settings:', error);
    return createServerError(
      error,
      `Failed to update settings: ${error.message || 'Unknown error'}`
    );
  }
}
