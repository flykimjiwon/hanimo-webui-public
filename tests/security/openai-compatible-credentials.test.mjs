import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resolveOpenAICompatibleKey } from '../../app/lib/security/provider-runtime-credentials.mjs';

test('OpenAI-compatible credentials prefer endpoint, then settings, then provider environment', async () => {
  let settingsLoads = 0;
  const loadSettings = async () => {
    settingsLoads += 1;
    return 'settings';
  };
  assert.equal(await resolveOpenAICompatibleKey('endpoint', {
    env: { OPENAI_COMPAT_API_KEY: 'env' },
    loadGlobalKey: loadSettings,
  }), 'endpoint');
  assert.equal(settingsLoads, 0);
  assert.equal(await resolveOpenAICompatibleKey('', {
    env: { OPENAI_COMPAT_API_KEY: 'env' },
    loadGlobalKey: loadSettings,
  }), 'settings');
  assert.equal(await resolveOpenAICompatibleKey('', {
    env: { OPENAI_COMPAT_API_KEY: 'env' },
    loadGlobalKey: async () => '',
  }), 'env');
  assert.equal(await resolveOpenAICompatibleKey('', {
    env: { OPENAI_COMPAT_API_KEY: 'env' },
    loadGlobalKey: async () => { throw new Error('database unavailable'); },
  }), 'env');
  assert.equal(await resolveOpenAICompatibleKey('', {
    env: {},
    loadGlobalKey: async () => '',
  }), '');
});

test('stable OpenAI-compatible routes use the shared credential precedence', async () => {
  const paths = [
    '../../app/api/v1/embeddings/route.js',
    '../../app/api/v1/rerank/route.js',
    '../../app/api/v1/completions/route.js',
    '../../app/api/v1/models/route.js',
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8'))
  );
  for (const source of sources) {
    assert.match(source, /resolveOpenAICompatibleKey\(/);
    assert.doesNotMatch(source, /provider === 'openai-compatible'[\s\S]{0,160}process\.env\.OPENAI_COMPAT_API_KEY/);
  }

  const chat = await readFile(
    new URL('../../app/api/v1/chat/completions/route.js', import.meta.url),
    'utf8'
  );
  assert.match(chat, /apiKey = await resolveOpenAICompatibleKey\(endpointApiKey\)/);
  assert.match(chat, /nextApiKey = await resolveOpenAICompatibleKey\(nextApiKey\)/);
});
