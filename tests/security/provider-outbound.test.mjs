import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

import {
  fetchWithProviderPolicy,
  getProviderTimeoutMs,
  validateProviderEndpoint,
} from '../../app/lib/security/provider-outbound.mjs';

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];

test('provider transport pins named local engines with the Node lookup contract', async (t) => {
  // Given: a real local HTTP engine reached through a Docker-style hostname.
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ models: [{ name: 'gemma3:1b' }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(typeof address, 'object');

  // When: the production transport pins the named endpoint to its resolved address.
  const response = await fetchWithProviderPolicy(
    `http://host.docker.internal:${address.port}/api/tags`,
    {},
    {
      provider: 'model-server',
      resolveHostname: async () => [{ address: '127.0.0.1', family: 4 }],
    }
  );

  // Then: Node receives a valid lookup result and the request reaches the engine.
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { models: [{ name: 'gemma3:1b' }] });
});

test('provider policy permits explicit local engines but rejects metadata and untrusted private networks', async () => {
  // Given: built-in local engines and sensitive or arbitrary private targets.
  const localOptions = { provider: 'openai-compatible', resolveHostname: async () => [{ address: '127.0.0.1', family: 4 }] };

  // When/Then: exact loopback and Docker host targets are trusted, while other private targets fail closed.
  assert.equal(await validateProviderEndpoint('http://localhost:1234/v1', localOptions), 'http://localhost:1234/v1');
  assert.equal(await validateProviderEndpoint('http://host.docker.internal:11434', localOptions), 'http://host.docker.internal:11434/');
  await assert.rejects(() => validateProviderEndpoint('http://169.254.169.254/latest/meta-data', localOptions), /비공개|로컬/);
  await assert.rejects(() => validateProviderEndpoint('http://10.0.0.8:8000/v1', localOptions), /비공개|로컬/);
  assert.equal(
    await validateProviderEndpoint('http://10.0.0.8:8000/v1', {
      ...localOptions,
      env: { HANIMO_PROVIDER_LOCAL_ALLOWLIST: '10.0.0.8' },
    }),
    'http://10.0.0.8:8000/v1'
  );
  await assert.rejects(() => validateProviderEndpoint('http://engine.local:8000/v1', localOptions), /비공개|로컬/);
  await assert.rejects(
    () => validateProviderEndpoint('http://engine.local:8000/v1', {
      ...localOptions,
      env: { HANIMO_PROVIDER_LOCAL_ALLOWLIST: 'engine.local' },
      resolveHostname: async () => [{ address: '169.254.169.254', family: 4 }],
    }),
    /비공개|로컬/
  );
  for (const address of ['::ffff:169.254.169.254', '::ffff:a9fe:a9fe']) {
    await assert.rejects(
      () => validateProviderEndpoint('http://engine.local:8000/v1', {
        ...localOptions,
        env: { HANIMO_PROVIDER_LOCAL_ALLOWLIST: 'engine.local' },
        resolveHostname: async () => [{ address, family: 6 }],
      }),
      /비공개|로컬/
    );
  }
});

test('provider private-LAN opt-in never permits reserved, multicast, or documentation targets', async () => {
  const rejectedTargets = [
    '0.0.0.0',
    '100.64.0.1',
    '192.0.2.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '2001:db8::1',
    'ff02::1',
  ];

  for (const address of rejectedTargets) {
    const url = `http://${address.includes(':') ? `[${address}]` : address}:8000/v1`;
    await assert.rejects(
      () => validateProviderEndpoint(url, {
        env: { HANIMO_PROVIDER_LOCAL_ALLOWLIST: address },
      }),
      /비공개|로컬/
    );
  }
});

test('provider validation normalizes malformed URLs to the policy error type', async () => {
  await assert.rejects(
    () => validateProviderEndpoint('%%%'),
    (error) => error?.name === 'OutboundSecurityError' && /올바른/.test(error.message)
  );
});

test('provider timeout preserves long-running model calls while retaining a hard cap', () => {
  assert.equal(getProviderTimeoutMs({}), 600000);
  assert.equal(getProviderTimeoutMs({ HANIMO_PROVIDER_TIMEOUT_MS: '120000' }), 120000);
  assert.equal(getProviderTimeoutMs({ HANIMO_PROVIDER_TIMEOUT_MS: '1800000' }), 900000);
});

test('official environment and Compose surfaces expose provider timeout and private-LAN opt-in', async () => {
  const [envExample, compose, readme] = await Promise.all([
    readFile(new URL('../../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../../docker-compose.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../README.md', import.meta.url), 'utf8'),
  ]);
  for (const source of [envExample, compose, readme]) {
    assert.match(source, /HANIMO_PROVIDER_TIMEOUT_MS/);
    assert.match(source, /HANIMO_PROVIDER_LOCAL_ALLOWLIST/);
  }
});

test('provider policy blocks public-to-private redirects and strips secrets across public origins', async () => {
  // Given: a public provider request carrying its configured API key.
  const requests = [];

  // When/Then: a redirect into loopback is rejected even though loopback is valid as an explicit initial local endpoint.
  await assert.rejects(
    () => fetchWithProviderPolicy('https://provider.example/v1/models', {
      headers: { Authorization: 'Bearer provider-secret' },
    }, {
      provider: 'openai-compatible',
      resolveHostname: publicResolver,
      fetch: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1:8000/private' } }),
    }),
    /비공개|로컬/
  );

  await fetchWithProviderPolicy('https://provider.example/v1/models', {
    headers: { Authorization: 'Bearer provider-secret', 'x-goog-api-key': 'gemini-secret' },
  }, {
    provider: 'openai-compatible',
    resolveHostname: publicResolver,
    fetch: async (url, init) => {
      const headers = new Headers(init.headers);
      requests.push({
        url,
        authorization: headers.get('authorization'),
        geminiKey: headers.get('x-goog-api-key'),
      });
      return requests.length === 1
        ? new Response('', { status: 302, headers: { location: 'https://other.example/models' } })
        : new Response('{}', { status: 200 });
    },
  });

  assert.deepEqual(requests, [
    { url: 'https://provider.example/v1/models', authorization: 'Bearer provider-secret', geminiKey: 'gemini-secret' },
    { url: 'https://other.example/models', authorization: null, geminiKey: null },
  ]);
});

test('provider settings discovery and chat routes use the shared provider transport', async () => {
  // Given: every route that accepts or calls configured provider URLs.
  const paths = [
    '../../app/api/admin/settings/route.js',
    '../../app/api/model-servers/models/route.js',
    '../../app/api/v1/models/route.js',
    '../../app/api/v1/chat/completions/route.js',
    '../../app/api/v1/completions/route.js',
    '../../app/api/v1/embeddings/route.js',
    '../../app/api/v1/rerank/route.js',
    '../../app/api/admin/get-local-models/route.js',
    '../../app/api/admin/user-memories/route.js',
    '../../app/api/webapp-generate/route.js',
    '../../app/api/user/memory/route.js',
    '../../app/api/webapp-chat/generate-room-name/route.js',
    '../../app/lib/retryUtils.js',
    '../../app/lib/modelServerMonitor.js',
  ];

  // When: their production source is inspected as an integration boundary.
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

  // Then: registration validates and runtime calls use the redirect-safe provider transport.
  assert.match(sources[0], /validateProviderEndpoint\(url, \{ provider \}\)/);
  for (const source of sources.slice(1)) {
    assert.match(source, /fetchWithProviderPolicy\(/);
  }
  for (const source of sources.slice(2)) {
    assert.doesNotMatch(source, /await fetch\(/);
  }
});

test('retry transport cancels a retryable response before switching endpoints', async () => {
  const retryUtils = await readFile(new URL('../../app/lib/retryUtils.js', import.meta.url), 'utf8');
  const retryBranch = retryUtils.slice(
    retryUtils.indexOf('if (isRetryableHttpError'),
    retryUtils.indexOf('// Return response if HTTP error is not retryable')
  );

  assert.match(retryBranch, /await cancelProviderResponse\(response\)/);
  assert.ok(
    retryBranch.indexOf('await cancelProviderResponse(response)') < retryBranch.indexOf('continue;'),
    'the response lifecycle must be released before the next fetch starts'
  );
});
