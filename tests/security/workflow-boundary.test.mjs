import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareWorkflowEndpoint } from '../../app/lib/security/workflow-endpoint.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('workflow endpoint registration encrypts credentials and validates outbound URLs', () => {
  const source = read('app/api/workflows/[id]/endpoints/route.js');
  assert.match(source, /prepareWorkflowEndpoint\(\{ endpointUrl, apiKey \}\)/);
  assert.match(read('app/lib/security/workflow-endpoint.mjs'), /encryptOptionalSecret\(apiKey, options\)/);
  assert.match(source, /api_key_encrypted/);
  assert.doesNotMatch(source, /\[id, name\.trim\(\), endpointUrl\.trim\(\), apiKey/);
});

test('workflow endpoint preparation is executable and fails closed without a key', async () => {
  const prepared = await prepareWorkflowEndpoint({ endpointUrl: 'https://api.example.com/v1', apiKey: '' }, {
    resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }],
    env: {},
  });
  assert.equal(prepared.normalizedEndpoint, 'https://api.example.com/v1');
  assert.equal(prepared.encryptedApiKey, '');
  await assert.rejects(
    () => prepareWorkflowEndpoint({ endpointUrl: 'https://api.example.com/v1', apiKey: 'secret' }, {
      resolveHostname: async () => [{ address: '93.184.216.34', family: 4 }],
      env: {},
    }),
    /HANIMO_CREDENTIAL_ENCRYPTION_KEY/
  );
});

test('workflow execution rejects legacy plaintext and validates every outbound redirect', () => {
  const source = read('app/lib/workflow-engine.js');
  assert.match(source, /decryptOptionalSecret\(ep\.api_key_encrypted \|\| ''\)/);
  assert.match(source, /fetchWithOutboundPolicy\(apiUrl/);
  assert.match(source, /HANIMO_WORKFLOW_ENDPOINT_TIMEOUT_MS/);
  assert.doesNotMatch(source, /apiKey = ep\.api_key \|\| ''/);
});
