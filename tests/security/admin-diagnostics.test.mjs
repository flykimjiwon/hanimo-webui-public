import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

async function readOwnedFile(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function loadRouteExports() {
  const routePath = path.join(root, 'app/api/admin/env/route.js');
  const source = await readFile(routePath, 'utf8');
  const withoutImports = source.replace(/^import .+;\n/gm, '');
  const moduleUrl = `data:text/javascript,${encodeURIComponent(withoutImports)}#${Date.now()}`;
  return import(moduleUrl);
}

test('admin env diagnostics source omits raw URI, raw value, and project root response fields', async () => {
  const routeSource = await readOwnedFile('app/api/admin/env/route.js');
  const pageSource = await readOwnedFile('app/admin/env/page.js');
  const combined = `${routeSource}\n${pageSource}`;

  for (const forbidden of [
    'postgresUriValue',
    'nodeEnvValue',
    'postgresUriMatchedFiles',
    'nodeEnvMatchedFiles',
    'projectRoot',
    'POSTGRES_URI (runtime)',
  ]) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `forbidden admin diagnostics field leaked in source: ${forbidden}`
    );
  }

  assert.doesNotMatch(
    routeSource,
    /runtime:\s*\{[\s\S]*postgresUri\s*,[\s\S]*\}/,
    'runtime response must not include raw postgresUri'
  );
  assert.doesNotMatch(
    routeSource,
    /runtime:\s*\{[\s\S]*nodeEnv\s*,[\s\S]*\}/,
    'runtime response must not include raw nodeEnv'
  );
});

test('client token diagnostics never include token previews or raw token snippets', async () => {
  const mainSource = await readOwnedFile('app/page.js');
  const ssoSource = await readOwnedFile('app/sso/page.js');
  const combined = `${mainSource}\n${ssoSource}`;

  for (const forbidden of ['preview:', 'tokenPreview', 'substring(0']) {
    assert.equal(
      combined.includes(forbidden),
      false,
      `forbidden token preview leaked in source: ${forbidden}`
    );
  }

  assert.match(combined, /tokenLength|length:\s*token\?\.length/);
});

test('sanitizePostgresUri returns safe connection diagnostics without credentials or query strings', async () => {
  const { sanitizePostgresUri } = await loadRouteExports();
  const rawUri =
    'postgresql://user:super-secret-password@db.internal.example:6543/app_db?sslmode=require&password=query-secret';

  const diagnostic = sanitizePostgresUri(rawUri);

  assert.deepEqual(diagnostic, {
    configured: true,
    parseError: false,
    protocol: 'postgresql',
    hostname: 'db.internal.example',
    port: 6543,
    database: 'app_db',
  });

  const serialized = JSON.stringify(diagnostic);
  for (const leaked of [
    'user',
    'super-secret-password',
    'sslmode',
    'query-secret',
    '?',
    '@',
  ]) {
    assert.equal(serialized.includes(leaked), false, `sanitized URI leaked ${leaked}`);
  }
});

test('sanitizePostgresUri redacts malformed values by returning only parse status', async () => {
  const { sanitizePostgresUri } = await loadRouteExports();
  const diagnostic = sanitizePostgresUri('not a postgres://user:secret@example/db?x=y');

  assert.deepEqual(diagnostic, {
    configured: true,
    parseError: true,
    protocol: null,
    hostname: null,
    port: null,
    database: null,
  });

  assert.equal(JSON.stringify(diagnostic).includes('secret'), false);
});

test('admin diagnostics test stays tied to the owned route file', () => {
  assert.equal(
    pathToFileURL(path.join(root, 'app/api/admin/env/route.js')).protocol,
    'file:'
  );
});
