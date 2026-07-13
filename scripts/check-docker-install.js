const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  assertStaticComposeConfiguration,
  buildDockerE2eContext,
  findExecutableOnPath,
} = require('./lib/docker-e2e-config');

const rootDir = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'ignore' });
  return result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }
  return result;
}

function start(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (error) => console.error(error));
  return child;
}

async function stop(child) {
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

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, label, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.status < 500) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message || 'timeout'}`);
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
    body = { raw: text };
  }
  return { response, body };
}

function writePrivateEnv(directory, values) {
  const envPath = path.join(directory, 'hanimo-e2e.env');
  const contents = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, `${contents}\n`, { mode: 0o600 });
  return envPath;
}

async function main() {
  const validateOnly = process.argv.slice(2).includes('--validate-only');
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--validate-only');
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument: ${unknownArgs[0]}`);
  }

  const [appPort, mockPort] = await Promise.all([getFreePort(), getFreePort()]);
  const suffix = crypto.randomBytes(4).toString('hex');
  const context = buildDockerE2eContext({
    appPort,
    mockPort,
    suffix,
    processId: process.pid,
    postgresPassword: crypto.randomBytes(24).toString('base64url'),
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    credentialEncryptionKey: crypto.randomBytes(32).toString('hex'),
    adminPassword: `Hmo-E2E-${crypto.randomBytes(18).toString('base64url')}!`,
  });
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  assertStaticComposeConfiguration(composeSource, context);

  if (validateOnly) {
    const cliStatus = findExecutableOnPath('docker')
      ? 'Docker CLI available; it was not invoked.'
      : 'Docker CLI unavailable; static validation remains available.';
    console.log(`Static Docker E2E configuration validation passed: Origin=${context.requestOrigin}; PostgreSQL host ports=none.`);
    console.log(`${cliStatus} Docker runtime NOT run.`);
    return;
  }

  if (!commandAvailable('docker', ['info'])) {
    console.error('Docker daemon is unavailable. Install/start Docker, then rerun `npm run test:docker-install`.');
    process.exit(127);
  }
  if (!commandAvailable('docker', ['compose', 'version'])) {
    console.error('Docker Compose v2 is required.');
    process.exit(127);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hanimo-webui-e2e-'));
  const envPath = writePrivateEnv(tempDir, context.env);

  const compose = ['compose', '-p', context.projectName, '--env-file', envPath];
  let mockServer = null;
  try {
    const config = run('docker', [...compose, 'config', '--format', 'json'], { capture: true });
    const parsedConfig = JSON.parse(config.stdout);
    assert(!parsedConfig.services?.db?.ports, 'PostgreSQL must not publish a host port by default.');
    assert(
      parsedConfig.services?.app?.environment?.HANIMO_PUBLIC_URL === context.baseUrl,
      'Compose HANIMO_PUBLIC_URL must match the dynamic request Origin.'
    );

    mockServer = start(process.execPath, ['scripts/mock-ollama.js', String(mockPort), 'docker-e2e'], {
      MOCK_HOST: '0.0.0.0',
      MOCK_LOADING_MS: '1',
    });
    await waitFor(`http://127.0.0.1:${mockPort}/api/version`, 'mock model server', 15000);

    run('docker', [...compose, 'up', '--detach', '--build']);
    const baseUrl = context.baseUrl;
    await waitFor(`${baseUrl}/api/public/settings`, 'Docker app');

    const labs = await fetch(`${baseUrl}/workflow`, { redirect: 'manual' });
    assert(labs.status === 404, `Labs must be default-off; /workflow returned ${labs.status}.`);

    const login = await requestJson(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: context.requestOrigin },
      body: JSON.stringify({ email: context.adminEmail, password: context.adminPassword }),
    });
    assert(login.response.status === 200, `Admin login failed with ${login.response.status}.`);
    assert(login.body?.token, 'Admin login did not return an access token.');

    const issued = await requestJson(`${baseUrl}/api/user/api-tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${login.body.token}`,
        'Content-Type': 'application/json',
        Origin: context.requestOrigin,
      },
      body: JSON.stringify({ name: 'Docker E2E', expiresInDays: 1 }),
    });
    assert(issued.response.status === 200, `API key issuance failed with ${issued.response.status}.`);
    const apiKey = issued.body?.data?.token;
    assert(typeof apiKey === 'string' && apiKey.startsWith('hmo_'), 'Issued API key must use the hmo_ prefix.');

    const models = await requestJson(`${baseUrl}/api/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    assert(models.response.status === 200, `/api/v1/models failed with ${models.response.status}.`);
    assert(Array.isArray(models.body?.data), '/api/v1/models did not return an OpenAI-compatible list.');

    const chat = await requestJson(`${baseUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemma3:1b',
        messages: [{ role: 'user', content: 'Hanimo Docker E2E' }],
        stream: false,
      }),
    });
    assert(chat.response.status === 200, `/api/v1/chat/completions failed with ${chat.response.status}.`);
    assert(
      chat.body?.choices?.[0]?.message?.content?.includes('Hello from docker-e2e'),
      'Chat response did not come through the configured model proxy.'
    );

    console.log('Docker clean-install E2E passed: install, login, hmo_ key, models, chat proxy, Labs default-off.');
  } finally {
    run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { allowFailure: true });
    await stop(mockServer);
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
    try {
      fs.rmdirSync(tempDir);
    } catch {
      // Keep a non-empty temporary directory for inspection instead of deleting unknown files.
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
