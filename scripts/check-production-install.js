const { spawn } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rootDir = path.join(__dirname, '..');
const appPort = process.env.PRODUCTION_CHECK_PORT || '3130';
const mockPort = process.env.PRODUCTION_CHECK_MOCK_PORT || '19035';
const appUrl = `http://127.0.0.1:${appPort}`;
const mockUrl = `http://127.0.0.1:${mockPort}`;
const mockApiKey = 'hanimo-production-check-upstream-key';

function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function startProcess(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (error) => {
    console.error(error);
  });
  return child;
}

async function waitFor(url, label) {
  const deadline = Date.now() + 30000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const suffix = lastError ? `: ${lastError.message}` : '';
  throw new Error(`${label} did not become ready at ${url}${suffix}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  let mockServer = null;
  let appServer = null;

  try {
    console.log('[production-check] build standalone app');
    await runCommand('npm', ['run', 'build'], {
      NODE_ENV: 'production',
      SKIP_DB_CONNECTION: 'true',
    });

    console.log(`[production-check] start mock Ollama at ${mockUrl}`);
    mockServer = startProcess('node', ['scripts/mock-ollama.js', mockPort, 'production-check-mock'], {
      MOCK_LOADING_MS: '1',
      MOCK_API_KEY: mockApiKey,
    });
    await waitFor(`${mockUrl}/api/version`, 'mock Ollama');

    console.log(`[production-check] start standalone app at ${appUrl}`);
    appServer = startProcess('npm', ['run', 'start'], {
      NODE_ENV: 'production',
      PORT: appPort,
      OLLAMA_ENDPOINTS: mockUrl,
      SKIP_DB_CONNECTION: 'false',
    });
    await waitFor(`${appUrl}/api/public/settings`, 'standalone app');

    await runCommand('npm', ['run', 'smoke'], {
      SMOKE_BASE_URL: appUrl,
    });
    await runCommand('npm', ['run', 'test:api-tokens:db'], {
      API_TOKEN_DB_TEST_BASE_URL: appUrl,
      API_TOKEN_DB_TEST_MODEL_SERVER_URL: `${mockUrl}/v1`,
      API_TOKEN_DB_TEST_MODEL_SERVER_PROVIDER: 'openai-compatible',
      API_TOKEN_DB_TEST_MODEL_SERVER_API_KEY: mockApiKey,
    });

    console.log('[production-check] production install check passed');
  } finally {
    await stopProcess(appServer);
    await stopProcess(mockServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
