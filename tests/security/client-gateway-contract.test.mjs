import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildModelsUpstreamRequest,
  buildOpenAiEndpoint,
  normalizeModelsResponse,
} from '../../app/lib/openai-gateway.mjs';
import { isLabsPath } from '../../app/lib/release-surface.mjs';

test('official client base URL resolves to stable v1 routes outside Labs', async () => {
  const nextConfig = await readFile(new URL('../../next.config.mjs', import.meta.url), 'utf8');

  for (const path of ['/v1/models', '/v1/chat/completions', '/v1/completions']) {
    assert.equal(isLabsPath(path), false, path);
  }
  assert.match(nextConfig, /source:\s*['"]\/v1\/models['"]/);
  assert.match(nextConfig, /destination:\s*['"]\/api\/v1\/models['"]/);
  assert.match(nextConfig, /source:\s*['"]\/v1\/chat\/completions['"]/);
  assert.match(nextConfig, /destination:\s*['"]\/api\/v1\/chat\/completions['"]/);
});

test('OpenAI-compatible upstream requests use the configured key and normalized base URL', () => {
  const request = buildModelsUpstreamRequest({
    endpoint: 'https://models.example.test/api/v1/',
    provider: 'openai-compatible',
    apiKey: 'upstream-secret',
  });

  assert.equal(request.url, 'https://models.example.test/api/v1/models');
  assert.equal(request.headers.Authorization, 'Bearer upstream-secret');
  assert.equal(
    buildOpenAiEndpoint('https://models.example.test/v3/openai', '/chat/completions'),
    'https://models.example.test/v3/openai/chat/completions'
  );
  assert.equal(
    buildOpenAiEndpoint('https://models.example.test', '/chat/completions'),
    'https://models.example.test/v1/chat/completions'
  );
});

test('Ollama and Gemini model discovery use their native endpoints', () => {
  const ollama = buildModelsUpstreamRequest({
    endpoint: 'http://localhost:11434/v1',
    provider: 'model-server',
  });
  assert.equal(ollama.url, 'http://localhost:11434/api/tags');
  assert.equal(ollama.headers.Authorization, undefined);

  const gemini = buildModelsUpstreamRequest({
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    provider: 'gemini',
    apiKey: 'gemini-secret',
  });
  assert.equal(
    gemini.url,
    'https://generativelanguage.googleapis.com/v1beta/models'
  );
  assert.equal(gemini.headers['x-goog-api-key'], 'gemini-secret');
  assert.equal(new URL(gemini.url).search, '');
});

test('model discovery normalizes OpenAI, Ollama, and Gemini responses', () => {
  assert.deepEqual(
    normalizeModelsResponse(
      { data: [{ id: 'gpt-compatible', object: 'model', created: 123, owned_by: 'vendor' }] },
      'openai-compatible'
    ),
    {
      object: 'list',
      data: [{ id: 'gpt-compatible', object: 'model', created: 123, owned_by: 'vendor' }],
    }
  );

  const ollama = normalizeModelsResponse(
    { models: [{ name: 'qwen:test', modified_at: '2026-01-01T00:00:00Z' }] },
    'model-server'
  );
  assert.equal(ollama.data[0].id, 'qwen:test');
  assert.equal(ollama.data[0].owned_by, 'ollama');
  assert.equal(ollama.data[0].created, 1767225600);

  const gemini = normalizeModelsResponse(
    {
      models: [
        { name: 'models/gemini-chat', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-only', supportedGenerationMethods: ['embedContent'] },
      ],
    },
    'gemini'
  );
  assert.deepEqual(gemini.data.map((model) => model.id), ['models/gemini-chat']);
});

test('gateway routes authenticate hmo bearer callers and never forward caller credentials', async () => {
  const [modelsRoute, chatRoute] = await Promise.all([
    readFile(new URL('../../app/api/v1/models/route.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/v1/chat/completions/route.js', import.meta.url), 'utf8'),
  ]);

  assert.match(modelsRoute, /verifyApiToken\(token\)/);
  assert.match(modelsRoute, /buildModelsUpstreamRequest/);
  assert.match(chatRoute, /buildUpstreamHeaders\(provider, apiKey\)/);
  assert.match(chatRoute, /buildProxyHeaders/);
  assert.doesNotMatch(chatRoute, /headers:\s*request\.headers/);
});
