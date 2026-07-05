const assert = require('assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.MOCK_OLLAMA_PORT || 19034);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(3000),
  });
  const body = await response.json();
  return { body, response };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const { response } = await requestJson('/api/version');
      if (response.ok) return;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        await wait(100);
        continue;
      }
      await wait(100);
    }
  }
  throw new Error(`Mock Ollama did not start on ${BASE_URL}`);
}

async function main() {
  const serverPath = path.join(__dirname, 'mock-ollama.js');
  const child = spawn(process.execPath, [serverPath, String(PORT), 'test-mock'], {
    env: { ...process.env, MOCK_LOADING_MS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();

    const tags = await requestJson('/api/tags');
    assert.equal(tags.response.status, 200);
    assert.equal(Array.isArray(tags.body.models), true);
    assert.equal(tags.body.models[0].name, 'gemma3:1b');

    const models = await requestJson('/v1/models');
    assert.equal(models.response.status, 200);
    assert.equal(models.body.object, 'list');
    assert.equal(models.body.data[0].id, 'gemma3:1b');

    const chat = await requestJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:1b',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      }),
    });
    assert.equal(chat.response.status, 200);
    assert.equal(chat.body.done, true);
    assert.match(chat.body.message.content, /Hello from test-mock/);

    const generate = await requestJson('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma3:1b', prompt: 'ping', stream: false }),
    });
    assert.equal(generate.response.status, 200);
    assert.equal(generate.body.done, true);
    assert.match(generate.body.response, /Hello from test-mock/);

    const completions = await requestJson('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:1b',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      }),
    });
    assert.equal(completions.response.status, 200);
    assert.equal(completions.body.choices[0].message.role, 'assistant');
    assert.equal(completions.body.usage.total_tokens, 13);

    console.log('mock Ollama endpoint tests passed');
  } finally {
    child.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
