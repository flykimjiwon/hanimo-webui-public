import logger from '@/lib/logger';
import { decryptProviderEndpoints } from '@/lib/security/provider-credentials.mjs';
let endpoints = []; // Store in [{ url, provider }] format

function normalizeEndpointForRuntime(url) {
  if (!url) return url;
  // Prevent using host.docker.internal in local (non-Docker) runtime
  if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST) {
    return url;
  }
  return url
    .replace('http://host.docker.internal', 'http://localhost')
    .replace('https://host.docker.internal', 'https://localhost');
}

/**
 * Fetch model config (direct DB query)
 */
async function getModelConfig() {
  try {
    // 1. Try querying from the new table structure
    const { getModelsFromTables } = await import('@/lib/modelTables');
    let categories = await getModelsFromTables();

    // 2. If no data in new tables, query legacy model_config
    if (!categories) {
      const { query } = await import('@/lib/postgres');
      const modelConfigResult = await query(
        'SELECT config FROM model_config WHERE config_type = $1',
        ['models']
      );

      if (modelConfigResult.rows.length > 0) {
        categories = modelConfigResult.rows[0].config?.categories || null;
      }
    }

    return categories ? { configType: 'models', categories } : null;
  } catch (error) {
    logger.warn('[Model Config] Model settings query failed:', error.message);
    return null;
  }
}

/**
 * Fetch settings (direct DB query)
 */
async function getSettings() {
  try {
    const { query } = await import('@/lib/postgres');
    const settingsResult = await query(
      'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
      ['general']
    );

    return settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;
  } catch (error) {
    logger.warn('[Settings] Failed to fetch settings:', error.message);
    return null;
  }
}

/**
 * Default model mapping by environment
 * Development: gemma2:1b (single model)
 * Production: gpt-oss:20b, gpt-oss:120b (multiple models)
 */
export const MODEL_CONFIG = {
  development: {
    models: [
      { id: 'gemma3:1b', label: 'Gemma 3 1B' },
      { id: 'gpt-oss:20b', label: 'GPT-OSS 20B' },
      { id: 'gpt-oss:120b', label: 'GPT-OSS 120B' },
    ],
    defaultModel: 'gemma3:1b',
  },
  production: {
    models: [
      { id: 'gpt-oss:20b', label: 'GPT-OSS 20B' },
      { id: 'gpt-oss:120b', label: 'GPT-OSS 120B' },
    ],
    defaultModel: 'gpt-oss:20b',
  },
};

/**
 * Get current environment
 */
export function getEnvironment() {
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

/**
 * Return model options for current environment
 */
export function getModelOptions() {
  const env = getEnvironment();
  return MODEL_CONFIG[env].models;
}

/**
 * Return default model for current environment
 */
export function getDefaultModel() {
  const env = getEnvironment();
  return MODEL_CONFIG[env].defaultModel;
}

/**
 * Convert model name (display name, UUID, or model id) to actual modelName
 * @param {string} modelName - display name, UUID, or model name
 * @returns {Promise<string>} actual model name (e.g., gemma3:1b)
 */
export async function resolveModelId(modelName) {
  if (!modelName) {
    return getDefaultModel();
  }

  try {
    // Use cached model config
    const modelConfig = await getModelConfig();

    if (modelConfig && modelConfig.categories) {
      // Find models across all categories
      const allModels = [];
      Object.values(modelConfig.categories).forEach((category) => {
        if (category.models && Array.isArray(category.models)) {
          allModels.push(...category.models);
        }
      });

      // 1. Find by UUID (when id field is UUID)
      let foundModel = allModels.find((m) => m.id === modelName);
      if (foundModel) {
        // If found by UUID, return modelName (actual model id)
        if (foundModel.modelName) {
          logger.info(
            `[Model Resolver] Converted UUID "${modelName}" to model name "${foundModel.modelName}"`
          );
          return foundModel.modelName;
        }
        // Backward compatibility: return id if modelName is missing
        return foundModel.id;
      }

      // 2. Find by modelName field (legacy or direct model name input)
      foundModel = allModels.find((m) => m.modelName === modelName);
      if (foundModel) {
        return foundModel.modelName;
      }

      // 3. Find by display name (label)
      foundModel = allModels.find(
        (m) => m.label && m.label.toLowerCase() === modelName.toLowerCase()
      );
      if (foundModel) {
        const resultModelName = foundModel.modelName || foundModel.id;
        logger.info(
          `[Model Resolver] Converted display name "${modelName}" to model name "${resultModelName}"`
        );
        return resultModelName;
      }

      // 4. Find by partial match (case-insensitive)
      foundModel = allModels.find(
        (m) =>
          (m.label &&
            m.label.toLowerCase().includes(modelName.toLowerCase())) ||
          (m.modelName &&
            m.modelName.toLowerCase().includes(modelName.toLowerCase()))
      );
      if (foundModel) {
        const resultModelName = foundModel.modelName || foundModel.id;
        logger.info(
          `[Model Resolver] Converted partial match "${modelName}" to model name "${resultModelName}"`
        );
        return resultModelName;
      }
    }
  } catch (error) {
    logger.warn(
      '[Model Resolver] Model settings query failed, using original name:',
      error.message
    );
  }

  // Return original name when no mapping is found (it may already be valid)
  logger.info(
    `[Model Resolver] Model mapping not found, using original name: "${modelName}"`
  );
  return modelName;
}

/**
 * Find server name from model ID (UUID or model name) using DB settings
 * Finds the server group for models with the same display label.
 * @param {string} modelId - model ID (UUID or model name)
 * @returns {Promise<string | null>} server name or null
 */
export async function getServerNameForModel(modelId) {
  if (!modelId) {
    return null;
  }

  try {
    // Use cached model config
    const modelConfig = await getModelConfig();

    if (modelConfig && modelConfig.categories) {
      // Find models across all categories
      const allModels = [];
      Object.values(modelConfig.categories).forEach((category) => {
        if (category.models && Array.isArray(category.models)) {
          allModels.push(...category.models);
        }
      });

      // 1. Exact match by UUID
      let foundModel = allModels.find((m) => m.id === modelId);

      if (!foundModel) {
        // 2. Find by modelName
        foundModel = allModels.find((m) => m.modelName === modelId);
      }

      if (!foundModel) {
        // 3. Try partial matching (based on modelName)
        const modelBase = modelId.split(':')[0];
        foundModel = allModels.find((m) => {
          if (!m.modelName) return false;
          const mNameLower = m.modelName.toLowerCase();
          const modelIdLower = modelId.toLowerCase();
          // Included exactly, or base name matches
          return (
            mNameLower.includes(modelIdLower) ||
            mNameLower.startsWith(modelBase.toLowerCase() + ':')
          );
        });
      }
      if (!foundModel) {
        // 4. Try reverse matching (configured modelName included in requested model ID)
        // Example: modelId is "gemma3:27b-it-qat" and config has "gemma3:27b"
        foundModel = allModels.find(
          (m) =>
            m.modelName &&
            modelId.toLowerCase().includes(m.modelName.toLowerCase())
        );
      }

      if (foundModel && foundModel.label) {
        // Find all models with the same display label
        const targetLabel = foundModel.label.trim().toLowerCase();
        logger.info(
          `[Model Server Resolver] Search model "${modelId}" - found model:`,
          {
            id: foundModel.id,
            modelName: foundModel.modelName,
            label: foundModel.label,
            targetLabel,
          }
        );
        logger.info(
          `[Model Server Resolver] Total models: ${allModels.length}, labels by model:`,
          allModels.map((m) => ({
            id: m.id,
            modelName: m.modelName,
            label: m.label,
            labelTrimmed: m.label?.trim().toLowerCase(),
          }))
        );

        const sameLabelModels = allModels.filter(
          (m) => m.label && m.label.trim().toLowerCase() === targetLabel
        );

        logger.info(
          `[Model Server Resolver] Found ${sameLabelModels.length} model(s) with same display label "${foundModel.label}":`,
          sameLabelModels.map((m) => ({
            id: m.id,
            modelName: m.modelName,
            label: m.label,
            serverName: m.serverName,
            endpoint: normalizeEndpointForRuntime(m.endpoint),
          }))
        );

        // Collect server names from models with same label
        const serverNames = new Set();
        for (const model of sameLabelModels) {
          // Use serverName from model config when available
          if (model.serverName) {
            serverNames.add(model.serverName);
          } else {
            // Parse server name from modelName
            const modelNameToParse = model.modelName || model.id;
            const { serverName } = parseModelName(modelNameToParse);
            if (serverName) {
              serverNames.add(serverName);
            }
          }
        }

        // Check whether models with same label belong to same server group
        if (serverNames.size === 1) {
          const serverName = Array.from(serverNames)[0];
          logger.info(
            `[Model Server Resolver] Model "${modelId}" (display label: "${foundModel.label}") -> server group "${serverName}" (${sameLabelModels.length} model(s) with same display label)`
          );
          return serverName;
        } else if (serverNames.size > 1) {
          logger.warn(
            `[Model Server Resolver] Model "${modelId}" (display label: "${
              foundModel.label
            }") belongs to multiple server groups: ${Array.from(
              serverNames
            ).join(', ')}`
          );
          // Return the first server name (or most common)
          return Array.from(serverNames)[0];
        } else {
          // If server name is not found, try parsing directly from modelName
          const modelNameToParse = foundModel.modelName || foundModel.id;
          const { serverName } = parseModelName(modelNameToParse);
          if (serverName) {
            // Verify parsed server name actually exists
            const serverEndpoints = await getModelServerEndpointsByName(
              serverName
            );
            if (serverEndpoints && serverEndpoints.length > 0) {
              logger.info(
                `[Model Server Resolver] Model "${modelId}" -> server group "${serverName}" (parsed and validated from model name)`
              );
              return serverName;
            } else {
              logger.warn(
                `[Model Server Resolver] Parsed server name "${serverName}" from model "${modelId}" does not actually exist.`
              );
            }
          }
        }
      }
    }
  } catch (error) {
    logger.warn('[Model Server Resolver] Model settings query failed:', error.message);
  }

  return null;
}

/**
 * Detect Docker environment
 */
function isDockerEnvironment() {
  // Detect Docker environment: check env vars or filesystem
  if (typeof process !== 'undefined') {
    // Check Docker Compose/Kubernetes env vars (most reliable)
    if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST) {
      return true;
    }

    // Check /.dockerenv file existence (sync)
    try {
      // Works only in Node.js environment
      if (typeof require !== 'undefined') {
        const fs = require('fs');
        if (fs.existsSync && fs.existsSync('/.dockerenv')) {
          return true;
        }
      }
    } catch (e) {
      logger.debug(
        '[Model Servers] Docker env check failed:',
        e.message
      );
    }
  }
  return false;
}

/**
 * Parse LLM_ENDPOINTS from DB settings and store in global array.
 * Development: http://localhost:11434 (single instance)
 * Production: multiple instances (load balancing)
 * Return format: [{ url, provider }]
 */
export async function initModelServerEndpoints() {
  let parsed = [];

  // In server environment, load from DB settings only
  if (typeof window === 'undefined') {
    try {
      const { query } = await import('@/lib/postgres');
      const settingsResult = await query(
        `SELECT 
          custom_endpoints, ollama_endpoints, 
          COALESCE(ollama_endpoints, '') as llm_endpoints
         FROM settings 
         WHERE config_type = 'general' 
         LIMIT 1`
      );
      const settings =
        settingsResult.rows.length > 0 ? settingsResult.rows[0] : null;

      // Prefer customEndpoints; fallback to legacy fields if absent
      // PostgreSQL query() returns snake_case — use custom_endpoints first
      const customEps = decryptProviderEndpoints(
        settings?.custom_endpoints || settings?.customEndpoints || []
      );
      if (
        Array.isArray(customEps) &&
        customEps.length > 0
      ) {
        parsed = customEps
          .filter((e) => e?.url)
          .map((e) => {
            const url = e.url.trim().toLowerCase();
            // Auto-detect provider from URL (priority: URL > configured provider)
            let provider = e.provider;

            if (url.includes('generativelanguage.googleapis.com')) {
              // Gemini URL is always treated as gemini
              provider = 'gemini';
              if (e.provider && e.provider !== 'gemini') {
                logger.warn(
                  `[Model Servers] Gemini URL detected but provider is set to '${e.provider}'. Auto-correcting to 'gemini'.`,
                  { url: e.url, originalProvider: e.provider }
                );
              }
            } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
              // OpenAI-compatible URL is always treated as openai-compatible
              provider = 'openai-compatible';
              if (e.provider && e.provider !== 'openai-compatible') {
                logger.warn(
                  `[Model Servers] OpenAI-compatible URL detected but provider is set to '${e.provider}'. Auto-correcting to 'openai-compatible'.`,
                  { url: e.url, originalProvider: e.provider }
                );
              }
            } else if (!provider || provider === 'model-server') {
              // If provider is missing or 'model-server', use default
              provider = 'model-server';
            }
            // Otherwise, keep configured provider as-is

            return {
              url: e.url.trim(),
              provider,
              apiKey: e.apiKey || '', // Include API key
            };
          })
          .filter((e) => e.url);
      } else {
        const rawDb = settings?.llm_endpoints || settings?.ollama_endpoints || settings?.llmEndpoints || settings?.ollamaEndpoints || '';
        const urlList = rawDb
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
           // Support name|url or name=url; extract URL only
          .map((entry) => {
            const m = entry.match(/^(.*?)\s*[|=｜＝]\s*(https?:\/\/.+)$/i);
            return m ? m[2].trim() : entry;
          });
        parsed = urlList.map((url) => ({
          url,
            provider: 'model-server', // Treat all legacy values as model-server
        }));
      }
    } catch (e) {
      logger.warn(
        '[Model Servers] Failed to load model servers from DB:',
        e?.message || e
      );
    }
  }

  // Check OLLAMA_ENDPOINTS from environment variables (useful in Docker)
  if (
    parsed.length === 0 &&
    typeof process !== 'undefined' &&
    process.env.OLLAMA_ENDPOINTS
  ) {
    const envEndpoints = process.env.OLLAMA_ENDPOINTS.split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (envEndpoints.length > 0) {
      parsed = envEndpoints.map((url) => ({
        url,
        provider: 'model-server', // Treat all env values as model-server
      }));
      logger.info(
        '[Model Servers] Loaded model servers from OLLAMA_ENDPOINTS env var:',
        parsed.map((e) => e.url)
      );
    }
  }

  // Final fallback defaults (only when DB has no settings)
  if (parsed.length === 0) {
    const env = getEnvironment();
    const isDocker = isDockerEnvironment();

    if (env === 'development') {
      // Use host.docker.internal in Docker environment
      if (isDocker) {
        parsed = [
          {
            url: 'http://host.docker.internal:11434',
            provider: 'model-server',
          },
        ];
        logger.info(
          '[Development/Docker] No DB settings found, using default model server: http://host.docker.internal:11434'
        );
      } else {
        parsed = [{ url: 'http://localhost:11434', provider: 'model-server' }];
        logger.info(
          '[Development] No DB settings found, using default model server: http://localhost:11434'
        );
      }
    } else {
      // In production, provide fallback only when running in Docker
      if (isDocker) {
        parsed = [
          {
            url: 'http://host.docker.internal:11434',
            provider: 'model-server',
          },
        ];
        logger.warn(
          '[Production/Docker] No DB settings found, using default model server: http://host.docker.internal:11434'
        );
        logger.warn(
          '[Production/Docker] Register model servers in admin settings is recommended.'
        );
      } else {
        logger.warn(
          '[Production] Model server settings not found in DB. Please register model servers in admin settings.'
        );
        // Do not use fallback defaults in production
        parsed = [];
      }
    }
  }

  endpoints = parsed;
  if (endpoints.length > 0) {
    logger.info(
      `[${getEnvironment()}] Model servers initialized:`,
      endpoints.map((e) => `${e.url} (${e.provider})`)
    );
  } else {
    logger.warn(`[${getEnvironment()}] Model servers are not configured.`);
  }
}

/**
 * Find all model server endpoints by server name
 * @param {string} serverName - server name (e.g., "spark-ollama")
 * @returns {Promise<Array<{endpoint: string, provider: string}>>} found endpoint list
 */
export async function getModelServerEndpointsByName(serverName) {
  if (!serverName) return [];

  try {
    // Use cached settings
    const settings = await getSettings();
    const customEndpoints = decryptProviderEndpoints(settings?.custom_endpoints || []);

    if (customEndpoints && Array.isArray(customEndpoints)) {
      const found = customEndpoints
        .filter(
          (e) =>
            e?.name &&
            e.name.trim().toLowerCase() === serverName.trim().toLowerCase() &&
            e?.url &&
            e.isActive !== false // Exclude disabled servers (default is enabled)
        )
        .map((e) => ({
          endpoint: e.url.trim(),
          provider:
            e.provider === 'openai-compatible'
              ? 'openai-compatible'
              : e.provider === 'gemini'
              ? 'gemini'
              : 'model-server',
          apiKey: e.apiKey || '', // Include API key
        }));

      return found;
    }
  } catch (error) {
    logger.warn(
      '[Model Servers] Failed to find endpoints by server name:',
      error.message
    );
  }

  return [];
}

/**
 * Collect endpoints for models that share the same display label
 * @param {string} modelId - model ID
 * @returns {Promise<Array<{endpoint: string, provider: string}>>} endpoint list
 */
export async function getEndpointsByLabel(modelId) {
  if (!modelId) return [];

  try {
    // Use cached model config
    const modelConfig = await getModelConfig();

    if (!modelConfig || !modelConfig.categories) {
      return [];
    }

    // Find models across all categories
    const allModels = [];
    Object.values(modelConfig.categories).forEach((category) => {
      if (category.models && Array.isArray(category.models)) {
        allModels.push(...category.models);
      }
    });

    // 1. Exact match by UUID
    let foundModel = allModels.find((m) => m.id === modelId);

    if (!foundModel) {
      // 2. Find by modelName
      foundModel = allModels.find((m) => m.modelName === modelId);
    }

    if (!foundModel) {
      // 3. Try partial matching (based on modelName)
      const modelBase = modelId.split(':')[0];
      foundModel = allModels.find((m) => {
        if (!m.modelName) return false;
        const mNameLower = m.modelName.toLowerCase();
        const modelIdLower = modelId.toLowerCase();
        return (
          mNameLower.includes(modelIdLower) ||
          mNameLower.startsWith(modelBase.toLowerCase() + ':')
        );
      });
    }

    if (!foundModel) {
      // 4. Try reverse matching
      foundModel = allModels.find(
        (m) =>
          m.modelName &&
          modelId.toLowerCase().includes(m.modelName.toLowerCase())
      );
    }

    if (!foundModel || !foundModel.label) {
      logger.info(
        `[getEndpointsByLabel] Model "${modelId}" - foundModel or label is missing`
      );
      return [];
    }

    // Find all models with the same display label
    const targetLabel = foundModel.label.trim().toLowerCase();
    logger.info(`[getEndpointsByLabel] Search model "${modelId}" - found model:`, {
      id: foundModel.id,
      modelName: foundModel.modelName,
      label: foundModel.label,
      targetLabel,
        endpoint: normalizeEndpointForRuntime(foundModel.endpoint),
    });
    logger.info(
      `[getEndpointsByLabel] Total models: ${allModels.length}, label and endpoint by model:`,
      allModels.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        label: m.label,
        labelTrimmed: m.label?.trim().toLowerCase(),
        endpoint: normalizeEndpointForRuntime(m.endpoint),
      }))
    );

    const sameLabelModels = allModels.filter(
      (m) => m.label && m.label.trim().toLowerCase() === targetLabel
    );

    logger.info(
      `[getEndpointsByLabel] Found ${sameLabelModels.length} model(s) with same display label "${foundModel.label}":`,
      sameLabelModels.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        label: m.label,
        endpoint: m.endpoint,
      }))
    );

    if (sameLabelModels.length === 0) {
      logger.info(
        `[getEndpointsByLabel] No models found with the same display label`
      );
      return [];
    }

    // Collect endpoints from all matching models
    const endpoints = [];
    const endpointSet = new Set(); // For deduplication

    for (const model of sameLabelModels) {
      if (!model.endpoint) continue;

      const endpoint = normalizeEndpointForRuntime(model.endpoint.trim());
      if (endpointSet.has(endpoint)) continue; // Skip already-added endpoint

      // Determine provider for endpoint (URL auto-detect + customEndpoints lookup)
      let provider = 'model-server'; // Default value

      // Auto-detect provider by URL (priority: URL > DB settings)
      const url = endpoint.toLowerCase();
      if (url.includes('generativelanguage.googleapis.com')) {
        provider = 'gemini';
      } else if (url.includes('/v1/models') || url.includes('/v1/chat')) {
        provider = 'openai-compatible';
      } else {
        // If URL-based detection fails, check cached settings
        try {
          const settings = await getSettings();
          const customEndpoints = decryptProviderEndpoints(settings?.custom_endpoints || []);

          if (customEndpoints && Array.isArray(customEndpoints)) {
            const epConfig = customEndpoints.find(
              (e) => e.url && e.url.trim() === endpoint
            );
            if (epConfig && epConfig.provider) {
              // Re-validate DB provider using URL-based rules
              const dbUrl = epConfig.url.toLowerCase();
              if (dbUrl.includes('generativelanguage.googleapis.com')) {
                provider = 'gemini';
              } else if (
                dbUrl.includes('/v1/models') ||
                dbUrl.includes('/v1/chat')
              ) {
                provider = 'openai-compatible';
              } else {
                provider =
                  epConfig.provider === 'openai-compatible'
                    ? 'openai-compatible'
                    : epConfig.provider === 'gemini'
                    ? 'gemini'
                    : 'model-server';
              }
            }
          }
        } catch (e) {
          logger.warn(
            '[getEndpointsByLabel] Failed to resolve provider:',
            e.message
          );
        }
      }

      endpoints.push({
        endpoint,
        provider,
        apiKey: model.apiKey || '',
      });
      endpointSet.add(endpoint);
    }

    if (endpoints.length > 0) {
      logger.info(
        `[Model Server Resolver] Model "${modelId}" (display label: "${foundModel.label}") -> ${endpoints.length} endpoint(s) (${sameLabelModels.length} model(s) with same display label)`
      );
    }

    return endpoints;
  } catch (error) {
    logger.warn(
      '[Model Server Resolver] Failed to fetch endpoints by display label:',
      error.message
    );
    return [];
  }
}

/**
 * Find model server endpoint by server name (backward compatibility)
 * If multiple servers have the same name, choose via round-robin
 * @param {string} serverName - server name (e.g., "spark-ollama")
 * @returns {Promise<{endpoint: string, provider: string, index: number} | null>} found endpoint info or null
 */
const serverNameCursors = new Map(); // Round-robin cursor by server name

export async function getModelServerEndpointByName(serverName) {
  if (!serverName) return null;

  const endpoints = await getModelServerEndpointsByName(serverName);

  if (endpoints.length === 0) {
    return null;
  }

  // Round-robin when multiple servers share same name
  if (endpoints.length > 1) {
    const currentCursor = serverNameCursors.get(serverName) || 0;
    const selectedIndex = currentCursor % endpoints.length;
    const selected = endpoints[selectedIndex];

    // Update cursor
    serverNameCursors.set(serverName, (currentCursor + 1) % endpoints.length);

    logger.info(
      `[Model Servers] Server "${serverName}" round-robin: ${selectedIndex + 1}/${
        endpoints.length
      } -> ${selected.endpoint}`
    );

    return {
      endpoint: selected.endpoint,
      provider: selected.provider,
      apiKey: selected.apiKey || '',
      index: selectedIndex,
    };
  }

  // If only one server exists, return it directly
  return {
    endpoint: endpoints[0].endpoint,
    provider: endpoints[0].provider,
    apiKey: endpoints[0].apiKey || '',
    index: 0,
  };
}

/**
 * Pick one endpoint via round-robin among models with same display label
 * @param {string} modelId - model ID
 * @returns {Promise<{endpoint: string, provider: string, index: number} | null>} selected endpoint info or null
 */
const labelCursors = new Map(); // Round-robin cursor by display label

export async function getModelServerEndpointByLabel(modelId) {
  if (!modelId) return null;

  try {
    // Use cached model config
    const modelConfig = await getModelConfig();

    if (!modelConfig || !modelConfig.categories) {
      return null;
    }

    // Find models across all categories
    const allModels = [];
    Object.values(modelConfig.categories).forEach((category) => {
      if (category.models && Array.isArray(category.models)) {
        allModels.push(...category.models);
      }
    });

    // 1. Exact match by UUID
    let foundModel = allModels.find((m) => m.id === modelId);

    if (!foundModel) {
      // 2. Find by modelName
      foundModel = allModels.find((m) => m.modelName === modelId);
    }

    if (!foundModel) {
      // 3. Try partial matching (based on modelName)
      const modelBase = modelId.split(':')[0];
      foundModel = allModels.find((m) => {
        if (!m.modelName) return false;
        const mNameLower = m.modelName.toLowerCase();
        const modelIdLower = modelId.toLowerCase();
        return (
          mNameLower.includes(modelIdLower) ||
          mNameLower.startsWith(modelBase.toLowerCase() + ':')
        );
      });
    }

    if (!foundModel) {
      // 4. Try reverse matching
      foundModel = allModels.find(
        (m) =>
          m.modelName &&
          modelId.toLowerCase().includes(m.modelName.toLowerCase())
      );
    }

    if (!foundModel || !foundModel.label) {
      return null;
    }

    // Use display label as key
    const labelKey = foundModel.label.trim().toLowerCase();
    const endpoints = await getEndpointsByLabel(modelId);

    if (endpoints.length === 0) {
      return null;
    }

    // Round-robin if multiple endpoints share same display label
    if (endpoints.length > 1) {
      const currentCursor = labelCursors.get(labelKey) || 0;
      const selectedIndex = currentCursor % endpoints.length;
      const selected = endpoints[selectedIndex];

      // Update cursor (using display label as key)
      labelCursors.set(labelKey, (currentCursor + 1) % endpoints.length);

      logger.info(
        `[Model Servers] Display-label-based round-robin (display label "${
          foundModel.label
        }", model "${modelId}"): ${selectedIndex + 1}/${endpoints.length} -> ${
          selected.endpoint
        }`
      );

      return {
        endpoint: selected.endpoint,
        provider: selected.provider,
        apiKey: selected.apiKey || '',
        index: selectedIndex,
      };
    }

    // If only one endpoint exists, return it directly
    return {
      endpoint: endpoints[0].endpoint,
      provider: endpoints[0].provider,
      apiKey: endpoints[0].apiKey || '',
      index: 0,
    };
  } catch (error) {
    logger.warn(
      '[Model Server Resolver] Failed to select endpoint by display label:',
      error.message
    );
    return null;
  }
}

/**
 * Parse server name and actual model name from model name
 * Format: {server-name}-{model-name} or {server-name}:{model-name}
 * Example: "spark-ollama-gemma3:27b" -> { serverName: "spark-ollama", modelName: "gemma3:27b" }
 * @param {string} modelName - full model name
 * @returns {{ serverName: string | null, modelName: string }} parsed server name and model name
 */
export function parseModelName(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return { serverName: null, modelName: modelName || '' };
  }

  // Format 1: {server-name}-{model-name} (hyphen-separated)
  // Model name starts after the last hyphen (model name may include hyphens)
  // Server name still needs to remain clearly separable
  // Example: "spark-ollama-gemma3:27b" -> server: "spark-ollama", model: "gemma3:27b"

  // First check whether a colon (:) exists (model names may include colons)
  const colonIndex = modelName.lastIndexOf(':');

  if (colonIndex > 0) {
    // If colon exists, find server name from the part before colon
    const beforeColon = modelName.substring(0, colonIndex);
    const afterColon = modelName.substring(colonIndex + 1);

    // Find hyphen-separated boundary (before last hyphen may be server name)
    const lastHyphenIndex = beforeColon.lastIndexOf('-');

    if (lastHyphenIndex > 0) {
      const potentialServerName = beforeColon.substring(0, lastHyphenIndex);
      const potentialModelPrefix = beforeColon.substring(lastHyphenIndex + 1);

      // Parse succeeds if server name has at least 2 chars and model part exists
      if (potentialServerName.length >= 2 && potentialModelPrefix.length > 0) {
        return {
          serverName: potentialServerName,
          modelName: `${potentialModelPrefix}:${afterColon}`,
        };
      }
    }
  } else {
    // If no colon, split only by hyphen
    // Split by last hyphen (server name must be at least 2 chars)
    const parts = modelName.split('-');
    if (parts.length >= 3) {
      // Use everything except last part as server name
      const serverNameParts = parts.slice(0, -1);
      const modelNamePart = parts[parts.length - 1];

      if (serverNameParts.join('-').length >= 2 && modelNamePart.length > 0) {
        return {
          serverName: serverNameParts.join('-'),
          modelName: modelNamePart,
        };
      }
    }
  }

  // If parsing fails, no server name is available
  return { serverName: null, modelName: modelName };
}

/**
 * Return the next model server via round-robin.
 * On first call, initModelServerEndpoints() runs automatically.
 * @returns {Promise<string>} model server URL
 */
let cursor = 0;
export async function getNextModelServerEndpoint() {
  if (endpoints.length === 0) await initModelServerEndpoints();

  // When model servers are not configured
  if (endpoints.length === 0) {
    logger.warn('[Model Servers] Model servers are not configured.');
    return null;
  }

  const ep = endpoints[cursor];
  cursor = (cursor + 1) % endpoints.length;

  // Handle when ep is undefined
  if (!ep) {
    logger.warn('[Model Servers] Model server endpoint not found.');
    return null;
  }

  return ep.url || ep; // Backward compatibility: support both object and string
}

// Return current round-robin index (for logging)
export function getCurrentRoundRobinIndex() {
  return cursor;
}

// Return round-robin index with model server (for detailed logging)
// @returns {Promise<{ endpoint: string, provider: string, index: number }>}
export async function getNextModelServerEndpointWithIndex() {
  if (endpoints.length === 0) await initModelServerEndpoints();
  if (endpoints.length === 0) return null;
  const currentIndex = cursor;
  const ep = endpoints[cursor];
  if (!ep) return null;
  cursor = (cursor + 1) % endpoints.length;
  return {
    endpoint: ep.url || ep, // Backward compatibility
    provider: ep.provider || 'model-server', // Default is model-server
    apiKey: ep.apiKey || '',
    index: currentIndex,
  };
}

// Aliases for backward compatibility (gradual migration)
export const initLlmEndpoints = initModelServerEndpoints;
export const getNextLlmEndpoint = getNextModelServerEndpoint;
export const getNextLlmEndpointWithIndex = getNextModelServerEndpointWithIndex;
export const initOllamaEndpoints = initModelServerEndpoints;
export const getNextOllamaEndpoint = getNextModelServerEndpoint;
export const getNextOllamaEndpointWithIndex =
  getNextModelServerEndpointWithIndex;
