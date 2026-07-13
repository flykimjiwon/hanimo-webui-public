const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');

const rootDir = path.join(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function captureProcess(command, args, env, output) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  child.once('error', (error) => {
    child.startError = error;
  });
  return child;
}

function runCommand(command, args, env, output, showOutputOnFailure = false) {
  return new Promise((resolve, reject) => {
    const outputStart = output.length;
    const child = captureProcess(command, args, env, output);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, 60000);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const operation = args[0] || command;
      const detail = showOutputOnFailure
        ? `\n${output.slice(outputStart).join('').trim()}`
        : '';
      reject(new Error(`${operation} failed (code=${code ?? 'none'}, signal=${signal ?? 'none'})${detail}`));
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitFor(url, label, child) {
  const deadline = Date.now() + 60000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.startError) throw child.startError;
    if (child?.exitCode !== null) throw new Error(`${label} exited before becoming ready`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${label} readiness failed: ${lastError?.name || 'timeout'}`);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { response, body };
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    const closed = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once('error', closed);
    socket.once('timeout', closed);
  });
}

async function runLocalReleaseFixture({ failAt = process.env.LOCAL_RELEASE_FIXTURE_FAIL_AT } = {}) {
  const suffix = `${process.pid}_${crypto.randomBytes(5).toString('hex')}`;
  const databaseName = `hanimo_e2e_${suffix}`;
  const adminEmail = `admin-${suffix}@hanimo.test`;
  const adminPassword = `Hmo-E2E-${crypto.randomBytes(24).toString('base64url')}!`;
  const jwtSecret = crypto.randomBytes(48).toString('base64url');
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const appPort = await getFreePort();
  let mockPort = await getFreePort();
  while (mockPort === appPort) mockPort = await getFreePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const mockUrl = `http://127.0.0.1:${mockPort}`;
  const postgresUri = `postgresql:///${databaseName}`;
  const adminPool = new Pool({
    connectionString: process.env.LOCAL_RELEASE_POSTGRES_ADMIN_URI || 'postgresql:///postgres',
    connectionTimeoutMillis: 5000,
    max: 1,
  });
  const output = [];
  const secrets = [adminPassword, jwtSecret, encryptionKey];
  let app = null;
  let mock = null;
  let databaseCreated = false;
  let originalError = null;

  const fixtureEnv = {
    NODE_ENV: 'production',
    PORT: String(appPort),
    POSTGRES_URI: postgresUri,
    JWT_SECRET: jwtSecret,
    HANIMO_CREDENTIAL_ENCRYPTION_KEY: encryptionKey,
    HANIMO_ADMIN_EMAIL: adminEmail,
    HANIMO_ADMIN_PASSWORD: adminPassword,
    HANIMO_ADMIN_NAME: 'Hanimo Local Release Admin',
    HANIMO_ENABLE_DESTRUCTIVE_ADMIN: 'false',
    HANIMO_ENABLE_LABS: 'false',
    HANIMO_PUBLIC_URL: appUrl,
    HANIMO_ALLOWED_ORIGINS: appUrl,
    OLLAMA_ENDPOINTS: mockUrl,
    SKIP_DB_CONNECTION: 'false',
  };

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    if (failAt === 'after-database') throw new Error('Injected fixture failure after database creation');

    await runCommand(process.execPath, ['scripts/create-postgres-schema.js'], fixtureEnv, output);
    await runCommand(process.execPath, ['scripts/create-admin.js'], fixtureEnv, output);

    mock = captureProcess(process.execPath, ['scripts/mock-ollama.js', String(mockPort), 'local-release-fixture'], {
      MOCK_LOADING_MS: '1',
    }, output);
    await waitFor(`${mockUrl}/api/version`, 'mock provider', mock);
    if (failAt === 'after-mock') throw new Error('Injected fixture failure after mock startup');

    app = captureProcess(process.execPath, ['scripts/start-standalone.js'], fixtureEnv, output);
    await waitFor(`${appUrl}/api/public/settings`, 'production app', app);

    await runCommand(process.execPath, ['scripts/smoke-routes.js'], {
      ...fixtureEnv,
      SMOKE_BASE_URL: appUrl,
    }, output, true);

    const malformedLogin = await fetch(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appUrl },
      body: '{not-json',
      signal: AbortSignal.timeout(15000),
    });
    assert(malformedLogin.status === 400, 'Malformed login JSON must return 400');

    const unauthenticated = await requestJson(`${appUrl}/api/v1/models`);
    assert(unauthenticated.response.status === 401, 'Unauthenticated models request must return 401');

    const foreignOrigin = await requestJson(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    assert(foreignOrigin.response.status === 403, 'Foreign-origin login must return 403');

    const wrongPassword = await requestJson(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appUrl },
      body: JSON.stringify({ email: adminEmail, password: `${adminPassword}-wrong` }),
    });
    assert(wrongPassword.response.status === 401, 'Wrong password must return 401');

    const login = await requestJson(`${appUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appUrl },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    assert(login.response.status === 200 && login.body?.token, 'Correct-origin admin login must return 200');
    secrets.push(login.body.token);

    const issued = await requestJson(`${appUrl}/api/user/api-tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.body.token}`, 'Content-Type': 'application/json', Origin: appUrl },
      body: JSON.stringify({ name: 'Local Release E2E', expiresInDays: 1 }),
    });
    const apiToken = issued.body?.data?.token;
    assert(issued.response.status === 200, 'API token issuance must return 200');
    assert(typeof apiToken === 'string' && apiToken.startsWith('hmo_'), 'API token must use hmo_ prefix');
    secrets.push(apiToken);

    const models = await requestJson(`${appUrl}/api/v1/models`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    assert(models.response.status === 200 && Array.isArray(models.body?.data), 'Authenticated models must return 200');

    const chat = await requestJson(`${appUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:1b', messages: [{ role: 'user', content: 'release fixture ping' }], stream: false }),
    });
    assert(chat.response.status === 200, 'Non-stream chat must return 200');
    assert(chat.body?.choices?.[0]?.message?.content?.includes('Hello from local-release-fixture'), 'Chat must contain the mock marker');

    await runCommand(process.execPath, ['scripts/test-api-token-db.js'], {
      ...fixtureEnv,
      API_TOKEN_DB_TEST_REQUIRED: 'true',
      API_TOKEN_DB_TEST_DISABLE_ENV_FILES: 'true',
      API_TOKEN_DB_TEST_BASE_URL: appUrl,
      API_TOKEN_DB_TEST_MODEL_SERVER_URL: `${mockUrl}/v1`,
      API_TOKEN_DB_TEST_MODEL_SERVER_PROVIDER: 'openai-compatible',
    }, output);
    if (failAt === 'after-e2e') throw new Error('Injected fixture failure after E2E checks');

    console.log('Local release fixture passed: origin, login, hmo_ issuance, models, chat, required DB coverage.');
  } catch (error) {
    originalError = error;
  } finally {
    await stopProcess(app);
    await stopProcess(mock);
    if (databaseCreated) {
      await adminPool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
    const databaseResult = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    await adminPool.end();
    assert(databaseResult.rowCount === 0, 'Temporary database cleanup failed');
    assert(!(await isPortOpen(appPort)) && !(await isPortOpen(mockPort)), 'Fixture child-process cleanup failed');
    const captured = output.join('');
    assert(secrets.every((secret) => !captured.includes(secret)), 'Captured output exposed a generated secret');
    console.log('Local release cleanup verified: child ports closed and temporary database dropped.');
  }

  if (originalError) throw originalError;
}

module.exports = { runLocalReleaseFixture };
