import logger from '@/lib/logger';
import { query } from '@/lib/postgres';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  legacyHashApiToken as legacySha256Hash,
} from '@/lib/security/tokens.mjs';
import {
  getNextModelServerEndpointWithIndex,
  getModelServerEndpointByName,
  getModelServerEndpointByLabel,
  parseModelName,
} from '@/lib/modelServers';

export function hashApiToken(token) {
  return hashOpaqueToken(token);
}

export function legacyHashApiToken(token) {
  return legacySha256Hash(token);
}

export function generateApiToken() {
  return generateOpaqueToken('hmo_');
}

function toISOString(dateValue) {
  if (!dateValue) return null;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function verifyApiToken(token) {
  try {
    const fullTokenHash = hashApiToken(token);
    const legacyTokenHash = legacyHashApiToken(token);
    const tokenHashes =
      fullTokenHash === legacyTokenHash
        ? [fullTokenHash]
        : [fullTokenHash, legacyTokenHash];
    const hashPlaceholders = tokenHashes.map((_, index) => `$${index + 1}`).join(', ');
    const tokenResult = await query(
      `SELECT
         api_tokens.id,
         api_tokens.user_id,
         api_tokens.token_hash,
         api_tokens.name AS token_name,
         api_tokens.expires_at,
         api_tokens.is_active,
         api_tokens.created_at,
         users.email,
         users.name AS user_name,
         users.department,
         users.cell,
         users.role
       FROM api_tokens
       INNER JOIN users ON users.id = api_tokens.user_id
       WHERE api_tokens.token_hash IN (${hashPlaceholders})
       ORDER BY LENGTH(api_tokens.token_hash) DESC
       LIMIT 1`,
      tokenHashes
    );

    if (tokenResult.rows.length === 0) {
      return { valid: false, error: 'API token not found.' };
    }

    const apiToken = tokenResult.rows[0];
    const userId = apiToken.user_id?.toString?.() || apiToken.user_id;

    if (!apiToken.is_active) {
      return { valid: false, error: 'API token is inactive.' };
    }

    if (apiToken.expires_at && new Date(apiToken.expires_at) < new Date()) {
      return { valid: false, error: 'API token has expired.' };
    }

    await query('UPDATE api_tokens SET last_used_at = $1 WHERE id = $2', [
      new Date(),
      apiToken.id,
    ]);

    const tokenHash = apiToken.token_hash || fullTokenHash;

    return {
      valid: true,
      userInfo: {
        userId,
        email: apiToken.email,
        name: apiToken.user_name,
        role: apiToken.role,
        department: apiToken.department,
        cell: apiToken.cell,
      },
      tokenInfo: {
        tokenHash,
        tokenId: apiToken.id?.toString() || null,
        userId,
        name: apiToken.token_name,
        issuedAt: toISOString(apiToken.created_at),
        expiresAt: toISOString(apiToken.expires_at),
        isLegacyHash: tokenHash.length === 16,
      },
    };
  } catch (error) {
    logger.error('[API Token Verification] Error:', error);
    return { valid: false, error: 'Invalid API token.' };
  }
}

export async function resolveEndpoint(modelId) {
  if (modelId) {
    const { serverName, modelName } = parseModelName(modelId);
    if (serverName) {
      const serverEndpoint = await getModelServerEndpointByName(serverName);
      if (serverEndpoint) {
        return { ...serverEndpoint, modelName };
      }
    }

    const labelEndpoint = await getModelServerEndpointByLabel(modelId);
    if (labelEndpoint) {
      return { ...labelEndpoint, modelName: modelId };
    }
  }

  const fallback = await getNextModelServerEndpointWithIndex();
  if (!fallback?.endpoint) {
    return null;
  }
  return { ...fallback, modelName: modelId };
}

export function buildOpenAiUrl(endpoint, path) {
  const trimmed = endpoint.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}${path}`;
  }
  return `${trimmed}/v1${path}`;
}

export function getValueByPath(source, path) {
  if (!source || !path) return undefined;
  const tokens = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let current = source;
  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token];
  }
  return current;
}

export function applyTemplate(value, context) {
  if (typeof value === 'string') {
    if (value === '{{prompt}}') return context.prompt;
    let output = value;
    if (output.includes('{{OPENAI_API_KEY}}')) {
      output = output.replaceAll('{{OPENAI_API_KEY}}', context.apiKey || '');
    }
    if (output.includes('{{prompt}}')) {
      output = output.replaceAll(
        '{{prompt}}',
        typeof context.prompt === 'string'
          ? context.prompt
          : JSON.stringify(context.prompt || '')
      );
    }
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => applyTemplate(item, context));
  if (value && typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([key, val]) => {
      next[key] = applyTemplate(val, context);
    });
    return next;
  }
  return value;
}

export async function getModelConfig() {
  try {
    const { getModelsFromTables } = await import('@/lib/modelTables');
    let categories = await getModelsFromTables();
    if (!categories) {
      const { query: pgQuery } = await import('@/lib/postgres');
      const modelConfigResult = await pgQuery(
        'SELECT config FROM model_config WHERE config_type = $1 LIMIT 1',
        ['models']
      );
      categories = modelConfigResult.rows[0]?.config?.categories || null;
    }
    return categories ? { categories } : null;
  } catch (error) {
    logger.warn('[Model Config] Failed to load model config:', error.message);
    return null;
  }
}

export async function findModelRecord(modelId) {
  if (!modelId) return null;
  const modelConfig = await getModelConfig();
  if (!modelConfig?.categories) return null;
  const allModels = [];
  Object.values(modelConfig.categories).forEach((category) => {
    if (category.models && Array.isArray(category.models)) allModels.push(...category.models);
  });
  let found = allModels.find((m) => m.id === modelId);
  if (!found) found = allModels.find((m) => m.modelName === modelId);
  if (!found) {
    found = allModels.find(
      (m) => m.label && m.label.toLowerCase() === String(modelId).toLowerCase()
    );
  }
  if (!found) {
    const modelBase = String(modelId).split(':')[0];
    found = allModels.find((m) => {
      if (!m.modelName) return false;
      const mNameLower = m.modelName.toLowerCase();
      return (
        mNameLower.includes(String(modelId).toLowerCase()) ||
        mNameLower.startsWith(modelBase.toLowerCase() + ':')
      );
    });
  }
  return found || null;
}
