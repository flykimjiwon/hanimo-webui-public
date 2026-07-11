import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  maskCustomEndpointSecrets,
  resolveCustomEndpointSecret,
} from '../../app/lib/security/settings-secrets.mjs';

test('custom endpoint settings expose only apiKeySet metadata', () => {
  const [masked] = maskCustomEndpointSecrets([
    {
      name: 'provider',
      url: 'https://models.example/v1',
      provider: 'openai-compatible',
      apiKey: 'upstream-secret',
    },
  ]);

  assert.equal(masked.apiKeySet, true);
  assert.equal(Object.hasOwn(masked, 'apiKey'), false);
  assert.equal(JSON.stringify(masked).includes('upstream-secret'), false);
});

test('masked settings updates preserve, replace, or explicitly clear existing keys', () => {
  const existing = [
    {
      name: 'provider',
      url: 'https://models.example/v1/',
      apiKey: 'existing-secret',
    },
  ];

  assert.equal(
    resolveCustomEndpointSecret(
      { name: 'renamed-provider', url: 'https://models.example/v1', apiKeySet: true },
      existing
    ),
    'existing-secret'
  );
  assert.equal(
    resolveCustomEndpointSecret(
      { name: 'provider', url: 'https://other.example/v1', apiKeySet: true },
      existing
    ),
    ''
  );
  assert.equal(
    resolveCustomEndpointSecret(
      { name: 'provider', url: 'https://models.example/v1', apiKey: 'replacement' },
      existing
    ),
    'replacement'
  );
  assert.equal(
    resolveCustomEndpointSecret(
      { name: 'provider', url: 'https://models.example/v1', clearApiKey: true },
      existing
    ),
    ''
  );
});

test('Gemini API keys stay in headers across stable and admin model paths', async () => {
  const files = await Promise.all(
    [
      '../../app/api/v1/chat/completions/route.js',
      '../../app/api/webapp-generate/route.js',
      '../../app/api/admin/get-local-models/route.js',
      '../../app/api/model-servers/models/route.js',
      '../../app/lib/modelServerMonitor.js',
    ].map((relativePath) =>
      readFile(new URL(relativePath, import.meta.url), 'utf8')
    )
  );

  for (const source of files) {
    assert.doesNotMatch(source, /[?&]key=\$\{/);
    assert.match(source, /x-goog-api-key/);
  }

  const chatRoute = files[0];
  assert.doesNotMatch(chatRoute, /headers:\s*\{\s*\.\.\.\(options\.headers/);
});
