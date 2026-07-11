import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGeminiModelsUrl,
  buildGeminiGenerateUrl,
  chooseOpenAICompatibleKey,
  decryptProviderEndpoints,
  encryptProviderEndpoints,
} from '../../app/lib/security/provider-credentials.mjs';

const env = {
  HANIMO_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

test('Gemini discovery accepts both service-root and v1beta base URLs', () => {
  assert.equal(
    buildGeminiModelsUrl('https://generativelanguage.googleapis.com'),
    'https://generativelanguage.googleapis.com/v1beta/models'
  );
  assert.equal(
    buildGeminiModelsUrl('https://generativelanguage.googleapis.com/v1beta'),
    'https://generativelanguage.googleapis.com/v1beta/models'
  );
});

test('Gemini generation normalizes versioned base URLs', () => {
  assert.equal(
    buildGeminiGenerateUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  );
});

test('endpoint OpenAI-compatible credentials take precedence over legacy defaults', () => {
  assert.equal(chooseOpenAICompatibleKey('endpoint', 'global', 'env'), 'endpoint');
  assert.equal(chooseOpenAICompatibleKey('', 'global', 'env'), 'global');
  assert.equal(chooseOpenAICompatibleKey('', '', 'env'), 'env');
});

test('provider endpoint credentials are encrypted at rest and decrypted only for runtime use', () => {
  const stored = encryptProviderEndpoints([
    { name: 'Cloud', url: 'https://provider.example/v1', provider: 'openai-compatible', apiKey: 'secret-key', isActive: true },
  ], { env });
  assert.notEqual(stored[0].apiKey, 'secret-key');
  assert.match(stored[0].apiKey, /^hmo_box_v1\./);
  assert.deepEqual(decryptProviderEndpoints(stored, { env }), [
    { name: 'Cloud', url: 'https://provider.example/v1', provider: 'openai-compatible', apiKey: 'secret-key', isActive: true },
  ]);
});
