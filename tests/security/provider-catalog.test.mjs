import assert from 'node:assert/strict';
import test from 'node:test';
import { PROVIDER_CATALOG, searchProviderCatalog } from '../../app/lib/provider-catalog.mjs';
import { buildOpenAiEndpoint } from '../../app/lib/openai-gateway.mjs';

test('provider catalog has unique ids and normalized URLs', () => {
  assert.ok(PROVIDER_CATALOG.length >= 40);
  assert.equal(new Set(PROVIDER_CATALOG.map(({ id }) => id)).size, PROVIDER_CATALOG.length);
  for (const entry of PROVIDER_CATALOG) {
    assert.ok(['ollama', 'openai-compatible', 'gemini'].includes(entry.provider));
    assert.equal(entry.url.endsWith('/'), false);
  }
});

test('catalog search uses aliases and categories', () => {
  assert.deepEqual(searchProviderCatalog('grok').map(({ id }) => id), ['xai']);
  assert.ok(searchProviderCatalog('', 'local').every(({ category }) => category === 'local'));
});

test('known transport traps are not advertised as compatible presets', () => {
  const ids = new Set(PROVIDER_CATALOG.map(({ id }) => id));
  for (const unsupported of ['anthropic', 'kimi-coding', 'bedrock', 'vertex-ai']) {
    assert.equal(ids.has(unsupported), false);
  }
});

test('versioned provider bases preserve their API prefix during model discovery', () => {
  assert.equal(buildOpenAiEndpoint('https://api.example.test/v3', '/models'), 'https://api.example.test/v3/models');
  assert.equal(buildOpenAiEndpoint('https://api.example.test/api/paas/v4', '/models'), 'https://api.example.test/api/paas/v4/models');
});
