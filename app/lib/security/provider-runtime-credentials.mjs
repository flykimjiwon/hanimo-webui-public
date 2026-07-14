import { decryptProviderSecret } from './provider-credentials.mjs';

async function loadGlobalOpenAICompatibleKey() {
  const { query } = await import('../postgres.js');
  const result = await query(
    'SELECT openai_compat_api_key FROM settings WHERE config_type = $1 LIMIT 1',
    ['general']
  );
  return decryptProviderSecret(result.rows[0]?.openai_compat_api_key || '');
}

export async function resolveOpenAICompatibleKey(
  endpointKey,
  { env = process.env, loadGlobalKey = loadGlobalOpenAICompatibleKey } = {}
) {
  const configuredEndpointKey = String(endpointKey || '').trim();
  if (configuredEndpointKey) return configuredEndpointKey;

  try {
    const globalKey = String(await loadGlobalKey() || '').trim();
    if (globalKey) return globalKey;
  } catch {}

  return String(env.OPENAI_COMPAT_API_KEY || '').trim();
}
