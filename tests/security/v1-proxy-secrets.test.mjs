import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'app/api/v1/chat/completions/route.js'), 'utf8');

test('stable v1 Gemini proxy keeps API keys out of URLs and diagnostics', () => {
  assert.doesNotMatch(source, /\?key=\$\{(?:apiKey|nextApiKey)\}/);
  assert.match(source, /x-goog-api-key/);
  assert.match(source, /redactEndpointForLog\(modelServerUrl\)/);
  assert.doesNotMatch(source, /url:\s*modelServerUrl/);
  assert.doesNotMatch(
    source,
    /details:\s*\{\s*endpoint:\s*redactEndpointForLog\(modelServerUrl\),\s*error:\s*errorMessage/s
  );
  assert.doesNotMatch(source, /userFriendlyMessage\s*=\s*`[^`]*\$\{errorMessage\}/);
  assert.match(source, /const correlationId = crypto\.randomUUID\(\)/);
  assert.match(source, /createProviderFailure\(error, userFriendlyMessage, correlationId\)/);
  assert.match(source, /failure\.openAI/);
  assert.match(source, /\.\.\.failure\.headers/);
});

test('manual provider failures use the same correlation contract as routed providers', () => {
  const failureStart = source.lastIndexOf(
    'const failure = createProviderFailure',
    source.indexOf('Manual provider connection failed')
  );
  const manualFailure = source.slice(
    failureStart,
    source.indexOf('const responseTime', source.indexOf('Manual provider connection failed'))
  );

  assert.match(
    manualFailure,
    /createProviderFailure\(\s*error,\s*['"]Unable to connect to the configured model provider\.['"],\s*correlationId\s*\)/
  );
  assert.match(manualFailure, /failure\.openAI/);
  assert.match(manualFailure, /\.\.\.failure\.headers/);
});

test('manual non-success responses never read the later responseContent binding', () => {
  const manualStart = source.indexOf('let manualRes');
  const branchStart = source.indexOf('if (!manualRes.ok)', manualStart);
  const nonSuccessBranch = source.slice(
    branchStart,
    source.indexOf('if (manualStreamEnabled)', branchStart)
  );

  assert.doesNotMatch(nonSuccessBranch, /responseContent/);
  assert.match(nonSuccessBranch, /messages,/);
});

test('stable v1 authentication failures share one OpenAI-compatible error type', async () => {
  const paths = [
    '../../app/api/v1/chat/completions/route.js',
    '../../app/api/v1/completions/route.js',
    '../../app/api/v1/embeddings/route.js',
    '../../app/api/v1/rerank/route.js',
    '../../app/api/v1/models/route.js',
  ];
  const sources = await Promise.all(
    paths.map((path) => fs.promises.readFile(new URL(path, import.meta.url), 'utf8'))
  );

  for (const routeSource of sources) {
    const authTypes = [...routeSource.matchAll(
      /error:\s*\{[\s\S]{0,300}?type:\s*['"]([^'"]+)['"][\s\S]{0,120}?status:\s*401/g
    )].map((match) => match[1]);
    assert.ok(authTypes.length > 0);
    assert.deepEqual([...new Set(authTypes)], ['authentication_error']);
  }
  assert.match(sources[0], /status:\s*401,\s*headers:\s*corsHeaders/);
});

test('provider-facing stable routes never serialize raw runtime error messages', async () => {
  const paths = [
    '../../app/api/v1/completions/route.js',
    '../../app/api/v1/embeddings/route.js',
    '../../app/api/v1/rerank/route.js',
    '../../app/api/webapp-generate/route.js',
    '../../app/api/webapp-chat/generate-room-name/route.js',
  ];
  const sources = await Promise.all(
    paths.map((path) => fs.promises.readFile(new URL(path, import.meta.url), 'utf8'))
  );

  for (const routeSource of sources) {
    assert.match(routeSource, /createProviderFailure/);
    assert.doesNotMatch(routeSource, /details:\s*(?:err|error)\.message/);
    assert.doesNotMatch(routeSource, /message:\s*(?:err|error)\.message\s*\|\|\s*['"]Internal server error['"]/);
  }
});

test('provider failure helper keeps runtime details out of public payloads', async () => {
  const { createProviderFailure } = await import('../../app/lib/security/provider-errors.mjs');
  const sentinel = 'connect ECONNREFUSED http://10.0.0.8:11434?api_key=secret';

  const failure = createProviderFailure(new Error(sentinel), 'Provider unavailable.');

  assert.equal(failure.openAI.error.message, 'Provider unavailable.');
  assert.equal(failure.web.error, 'Provider unavailable.');
  assert.equal(failure.headers['X-Request-Id'], failure.correlationId);
  assert.equal(failure.openAI.error.correlation_id, failure.correlationId);
  assert.equal(failure.web.correlation_id, failure.correlationId);
  assert.doesNotMatch(JSON.stringify(failure.openAI), /10\.0\.0\.8|secret/);
  assert.doesNotMatch(JSON.stringify(failure.web), /10\.0\.0\.8|secret/);
  assert.match(failure.log.message, /\[REDACTED\]/);
});
