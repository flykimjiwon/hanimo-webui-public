const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadScreenSecurityModule() {
  const modulePath = path.join(__dirname, '..', 'app', 'lib', 'screen-security.mjs');
  return import(pathToFileURL(modulePath).href);
}

function assertShareApiIsPublicAtMiddleware() {
  const middlewarePath = path.join(__dirname, '..', 'middleware.js');
  const middlewareSource = fs.readFileSync(middlewarePath, 'utf8');
  assert.match(
    middlewareSource,
    /['"]\/api\/screens\/share['"]/,
    'Public screen share API must reach its route-level access policy'
  );
}

function assertScreenSchemaAcceptsJwtUserIds() {
  const screenRoutePath = path.join(__dirname, '..', 'app', 'api', 'screens', 'route.js');
  const screenRouteSource = fs.readFileSync(screenRoutePath, 'utf8');
  assert.match(
    screenRouteSource,
    /user_id TEXT NOT NULL/,
    'screens.user_id must accept JWT subject UUID strings'
  );
  assert.match(
    screenRouteSource,
    /CREATE TABLE IF NOT EXISTS screen_access_logs/,
    'screen access logging table must be initialized with the screen schema'
  );
  assert.match(
    screenRouteSource,
    /await ensureScreensSchema\(\);[\s\S]*const \{ name, description \}/,
    'screen creation must initialize schema before inserting rows'
  );
}

async function main() {
  assertShareApiIsPublicAtMiddleware();
  assertScreenSchemaAcceptsJwtUserIds();

  const {
    assertAllowedOutboundUrl,
    readLimitedEndpointJson,
    redactDefinitionForShare,
    redactScreenForShare,
  } = await loadScreenSecurityModule();

  const definition = {
    components: [
      {
        id: 'button-1',
        type: 'Button',
        label: 'Run',
        endpointId: 'custom-1',
        apiKey: 'client-secret',
        children: [{ id: 'child', type: 'Paragraph', text: 'hello', headers: { Authorization: 'Bearer x' } }],
      },
    ],
    endpoints: [
      {
        id: 'custom-1',
        type: 'custom',
        url: 'https://api.example.com/private',
        apiKey: 'server-secret',
        inputMapping: { prompt: 'prompt' },
        outputMapping: { answer: 'data.answer' },
      },
    ],
    apiConfig: { headers: { Authorization: 'Bearer secret' } },
    theme: { primary: '#f5a623' },
  };

  const redacted = redactDefinitionForShare(definition);
  assert.deepEqual(redacted.endpoints, [], 'Shared definitions must not expose endpoint configs');
  assert.equal(redacted.components[0].endpointId, 'custom-1', 'Button wiring can stay visible');
  assert.equal('apiKey' in redacted.components[0], false, 'Component secrets are removed');
  assert.equal('headers' in redacted.components[0].children[0], false, 'Nested headers are removed');
  assert.equal('apiConfig' in redacted, false, 'Top-level API config is removed');
  assert.deepEqual(redacted.theme, definition.theme, 'Non-sensitive presentation fields remain');

  const safeScreen = redactScreenForShare({
    id: 'screen-1',
    name: 'Shared screen',
    access_password_hash: 'hash',
    definition,
  });
  assert.equal('access_password_hash' in safeScreen, false, 'Password hash is never returned');
  assert.deepEqual(safeScreen.definition.endpoints, [], 'Screen share helper redacts endpoint configs');

  const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];
  const privateResolver = async () => [{ address: '10.0.0.7', family: 4 }];
  const env = { HANIMO_SCREEN_ENDPOINT_ALLOWLIST: '' };

  assert.equal(
    await assertAllowedOutboundUrl('https://api.example.com/hook', { env, resolveHostname: publicResolver }),
    'https://api.example.com/hook',
    'Public https endpoints are allowed'
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('file:///etc/passwd', { env, resolveHostname: publicResolver }),
    /http\/https/,
    'Non-http schemes are rejected'
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('http://127.0.0.1:3000/hook', { env, resolveHostname: publicResolver }),
    /비공개 네트워크|로컬/,
    'Loopback addresses are rejected'
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('http://169.254.169.254/latest/meta-data', { env, resolveHostname: publicResolver }),
    /비공개 네트워크|로컬/,
    'Cloud metadata IPs are rejected'
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('https://internal.example.com/hook', { env, resolveHostname: privateResolver }),
    /비공개 네트워크/,
    'DNS records resolving to private IPs are rejected'
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('https://evil.example/hook', {
      env: { HANIMO_SCREEN_ENDPOINT_ALLOWLIST: 'api.example.com,.trusted.test' },
      resolveHostname: publicResolver,
    }),
    /허용된/,
    'Configured host allowlist is enforced'
  );
  assert.equal(
    await assertAllowedOutboundUrl('https://worker.trusted.test/hook', {
      env: { HANIMO_SCREEN_ENDPOINT_ALLOWLIST: 'api.example.com,.trusted.test' },
      resolveHostname: publicResolver,
    }),
    'https://worker.trusted.test/hook',
    'Allowlist suffix entries allow trusted subdomains'
  );

  await assert.rejects(
    () => readLimitedEndpointJson(new Response('{"too":"large"}'), 8),
    /너무 큽니다/,
    'Oversized endpoint responses are rejected'
  );

  console.log('screen security tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
