const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { configureModelServer, restoreModelServer } = require('./lib/api-token-db-model-server');

for (const envFile of ['.env.local', '.env.development', '.env']) {
  const envPath = path.join(__dirname, '..', envFile);
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }
}

const POSTGRES_URI = process.env.POSTGRES_URI || process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = (
  process.env.API_TOKEN_DB_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://127.0.0.1:3000'
).replace(/\/+$/, '');
const MODEL_SERVER_URL = (process.env.API_TOKEN_DB_TEST_MODEL_SERVER_URL || '').replace(/\/+$/, '');
const MODEL_SERVER_PROVIDER =
  process.env.API_TOKEN_DB_TEST_MODEL_SERVER_PROVIDER || 'model-server';
const MODEL_SERVER_API_KEY = process.env.API_TOKEN_DB_TEST_MODEL_SERVER_API_KEY || '';

function hashApiToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function legacyHashApiToken(token) {
  return hashApiToken(token).substring(0, 16);
}

function skip(message) {
  console.log(`API token DB integration skipped: ${message}`);
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchModels(token, apiBase = '/api/v1') {
  const response = await fetch(`${BASE_URL}${apiBase}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.text();
  return { response, body };
}

async function fetchChatCompletion(token, apiBase = '/api/v1') {
  const response = await fetch(`${BASE_URL}${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemma3:1b',
      messages: [{ role: 'user', content: 'ping from api token smoke' }],
      stream: false,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  return { response, body };
}

async function probeServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.status !== 401) {
      throw new Error(`expected unauthenticated /api/v1/models to return 401, got ${response.status}`);
    }
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED' || error.name === 'AbortError') {
      skip(`Next server is not reachable at ${BASE_URL}`);
    }
    throw error;
  }
}

async function insertToken(client, { userId, tokenHash, name, isActive = true, expiresAt }) {
  const id = crypto.randomUUID();
  await client.query(
    `INSERT INTO api_tokens
      (id, user_id, token_hash, name, expires_at, is_active, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $2, NOW(), NOW())`,
    [id, userId, tokenHash, name, expiresAt, isActive]
  );
  return id;
}

async function expectAccepted(token, label) {
  if (MODEL_SERVER_URL) {
    for (const apiBase of ['/api/v1', '/v1']) {
      const { response, body } = await fetchModels(token, apiBase);
      assert(response.status === 200, `${label} ${apiBase}/models should return 200; got ${response.status} with body: ${body}`);
      const models = JSON.parse(body);
      assert(Array.isArray(models.data), `${label} ${apiBase}/models should return OpenAI model list; body: ${body}`);

      const chat = await fetchChatCompletion(token, apiBase);
      assert(
        chat.response.status === 200,
        `${label} ${apiBase}/chat/completions should return 200; got ${chat.response.status} with body: ${chat.body}`
      );
      const chatBody = JSON.parse(chat.body);
      const message = chatBody.choices?.[0]?.message?.content || '';
      assert(message.includes('Hello from'), `${label} chat response should come from mock provider; body: ${chat.body}`);
    }
    return;
  }

  const { response, body } = await fetchModels(token);
  assert(response.status !== 401, `${label} should pass API-token authentication; got 401 with body: ${body}`);
}

async function waitForTokenUsage(client, userId, expectedCount) {
  const deadline = Date.now() + 3000;
  let observed = [];
  while (Date.now() < deadline) {
    const usageResult = await client.query(
      `SELECT id, last_used_at FROM api_tokens WHERE user_id = $1`,
      [userId]
    );
    observed = usageResult.rows.map((row) => ({
      id: row.id,
      hasLastUsedAt: Boolean(row.last_used_at),
    }));
    if (usageResult.rows.length === expectedCount && usageResult.rows.every((row) => row.last_used_at)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`accepted API tokens should update last_used_at; observed=${JSON.stringify(observed)}`);
}

async function expectRejected(token, expectedText, label) {
  const { response, body } = await fetchModels(token);
  assert(response.status === 401, `${label} should return 401; got ${response.status} with body: ${body}`);
  assert(body.includes(expectedText), `${label} should mention "${expectedText}"; body: ${body}`);
}

async function verifyMaskedEndpointSettings(client, userId) {
  if (!MODEL_SERVER_API_KEY || MODEL_SERVER_PROVIDER !== 'openai-compatible') {
    return;
  }

  const adminAccessToken = jwt.sign(
    { sub: userId, role: 'admin', type: 'access' },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const response = await fetch(`${BASE_URL}/api/admin/settings`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  const responseText = await response.text();
  assert(response.status === 200, `masked settings GET failed: ${response.status} ${responseText}`);
  assert(!responseText.includes(MODEL_SERVER_API_KEY), 'settings response exposed the upstream API key');

  const settings = JSON.parse(responseText);
  const endpoint = settings.customEndpoints?.find(
    (item) => item.url?.replace(/\/+$/, '') === MODEL_SERVER_URL
  );
  assert(endpoint?.apiKeySet === true, 'settings response should expose only apiKeySet=true');
  assert(!Object.hasOwn(endpoint, 'apiKey'), 'settings response must omit apiKey');

  const updateResponse = await fetch(`${BASE_URL}/api/admin/settings`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customEndpoints: settings.customEndpoints }),
    signal: AbortSignal.timeout(5000),
  });
  const updateBody = await updateResponse.text();
  assert(updateResponse.status === 200, `masked settings PUT failed: ${updateResponse.status} ${updateBody}`);

  const stored = await client.query(
    'SELECT custom_endpoints FROM settings WHERE config_type = $1 LIMIT 1',
    ['general']
  );
  const storedEndpoint = stored.rows[0]?.custom_endpoints?.find(
    (item) => item.url?.replace(/\/+$/, '') === MODEL_SERVER_URL
  );
  const { decryptProviderSecret } = await import(
    '../app/lib/security/provider-credentials.mjs'
  );
  assert(
    decryptProviderSecret(storedEndpoint?.apiKey || '') === MODEL_SERVER_API_KEY,
    'masked settings update should preserve the existing upstream API key'
  );
}

async function main() {
  if (!POSTGRES_URI) skip('POSTGRES_URI or DATABASE_URL is not configured');
  if (!JWT_SECRET) skip('JWT_SECRET is not configured');

  await probeServer();

  const pool = new Pool({ connectionString: POSTGRES_URI, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const email = `api-token-db-test-${Date.now()}@example.test`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  let modelServerSnapshot = null;

  try {
    await client.query('BEGIN');
    modelServerSnapshot = await configureModelServer(client, MODEL_SERVER_URL, {
      provider: MODEL_SERVER_PROVIDER,
      apiKey: MODEL_SERVER_API_KEY,
    });
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [userId, email, 'api-token-db-test', 'API token DB test', 'user']
    );

    const fullToken = jwt.sign(
      { sub: userId, email, name: 'API token DB test', role: 'user', type: 'api_token', jti: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const fullTokenId = await insertToken(client, {
      userId,
      tokenHash: hashApiToken(fullToken),
      name: 'full hash test token',
      expiresAt,
    });

    const legacyToken = jwt.sign(
      { sub: userId, email, name: 'API token DB test', role: 'user', type: 'api_token', jti: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    const legacyTokenId = await insertToken(client, {
      userId,
      tokenHash: legacyHashApiToken(legacyToken),
      name: 'legacy hash test token',
      expiresAt,
    });

    await client.query('COMMIT');

    await verifyMaskedEndpointSettings(client, userId);

    await expectAccepted(fullToken, 'full hash token');
    await expectAccepted(legacyToken, 'legacy hash token');

    await waitForTokenUsage(client, userId, 2);

    await client.query('UPDATE api_tokens SET is_active = false WHERE id = $1', [fullTokenId]);
    await expectRejected(fullToken, 'inactive', 'inactive token');

    await client.query(
      `UPDATE api_tokens
       SET is_active = true, expires_at = NOW() - INTERVAL '1 minute'
       WHERE id = $1`,
      [legacyTokenId]
    );
    await expectRejected(legacyToken, 'expired', 'expired database token');

    console.log('API token DB integration checks passed.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.warn(`Rollback failed: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    await restoreModelServer(client, modelServerSnapshot)
      .catch((cleanupError) => console.warn(`Model server settings cleanup failed: ${cleanupError.message}`));
    await client
      .query('DELETE FROM api_tokens WHERE user_id = $1', [userId])
      .catch((cleanupError) => console.warn(`API token cleanup failed: ${cleanupError.message}`));
    await client
      .query('DELETE FROM users WHERE id = $1', [userId])
      .catch((cleanupError) => console.warn(`User cleanup failed: ${cleanupError.message}`));
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
