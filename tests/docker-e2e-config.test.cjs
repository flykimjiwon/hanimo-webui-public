const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const rootDir = path.join(__dirname, '..');
const {
  assertStaticComposeConfiguration,
  buildDockerE2eContext,
} = require('../scripts/lib/docker-e2e-config');

const fixture = Object.freeze({
  appPort: 43123,
  mockPort: 43124,
  suffix: 'a1b2c3d4',
  processId: 987,
  postgresPassword: 'postgres-test-secret',
  jwtSecret: 'jwt-test-secret',
  credentialEncryptionKey: 'credential-test-secret',
  adminPassword: 'admin-test-secret',
});

test('dynamic request Origin and Compose public URL use the exact same loopback URL', () => {
  const context = buildDockerE2eContext(fixture);

  assert.equal(context.baseUrl, 'http://127.0.0.1:43123');
  assert.equal(context.requestOrigin, context.baseUrl);
  assert.equal(context.env.HANIMO_PUBLIC_URL, context.requestOrigin);
  assert.equal(context.env.PORT, '43123');
  assert.equal(context.env.OLLAMA_ENDPOINTS, 'http://host.docker.internal:43124');
});

test('static Compose validation rejects a stale public URL and published PostgreSQL port', () => {
  const context = buildDockerE2eContext(fixture);
  const composeSource = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');

  assert.doesNotThrow(() => assertStaticComposeConfiguration(composeSource, context));
  assert.throws(
    () => assertStaticComposeConfiguration(
      composeSource,
      { ...context, env: { ...context.env, HANIMO_PUBLIC_URL: 'http://localhost:3000' } }
    ),
    /request Origin and HANIMO_PUBLIC_URL must match/
  );
  assert.throws(
    () => assertStaticComposeConfiguration(
      composeSource.replace(
        'HANIMO_PUBLIC_URL: ${HANIMO_PUBLIC_URL:-http://localhost:3000}',
        'HANIMO_PUBLIC_URL: http://localhost:3000'
      ),
      context
    ),
    /HANIMO_PUBLIC_URL must be forwarded/
  );
  assert.throws(
    () => assertStaticComposeConfiguration(
      composeSource.replace(
        '    healthcheck:',
        '    ports:\n      - "5432:5432"\n    healthcheck:'
      ),
      context
    ),
    /PostgreSQL must not publish/
  );
});

test('malformed or stale ports fail closed', () => {
  for (const appPort of [0, 65536, '43123x', '', null, undefined]) {
    assert.throws(() => buildDockerE2eContext({ ...fixture, appPort }), /appPort/);
  }
  assert.throws(
    () => buildDockerE2eContext({ ...fixture, mockPort: 'not-a-port' }),
    /mockPort/
  );
});

test('--validate-only succeeds without Docker CLI and never claims runtime Docker passed', () => {
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'hanimo-no-docker-path-'));
  const result = spawnSync(process.execPath, ['scripts/check-docker-install.js', '--validate-only'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, PATH: emptyPath },
  });
  fs.rmdirSync(emptyPath);

  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /Static Docker E2E configuration validation passed/);
  assert.match(output, /Docker CLI unavailable/);
  assert.match(output, /Docker runtime NOT run/);
  assert.doesNotMatch(output, /Docker clean-install E2E passed/);
  assert.doesNotMatch(output, /install, login, hmo_ key, models, chat proxy/);
});

test('--validate-only detects but never invokes an available Docker CLI', () => {
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), 'hanimo-fake-docker-'));
  const fakeDocker = path.join(fakeBin, 'docker');
  const invocationLog = path.join(fakeBin, 'invoked.log');
  fs.writeFileSync(fakeDocker, `#!/bin/sh\nprintf invoked >> '${invocationLog}'\nexit 99\n`, { mode: 0o700 });

  const result = spawnSync(process.execPath, ['scripts/check-docker-install.js', '--validate-only'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, PATH: fakeBin },
  });
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /Docker CLI available; it was not invoked/);
  assert.equal(fs.existsSync(invocationLog), false, 'validate-only must invoke zero Docker commands');

  fs.unlinkSync(fakeDocker);
  fs.rmdirSync(fakeBin);
});

test('--validate-only is repeatable after interruption-like repeated invocations', () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = spawnSync(process.execPath, ['scripts/check-docker-install.js', '--validate-only'], {
      cwd: rootDir,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/nonexistent' },
    });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  }
});

test('the default no-flag path retains the full Docker E2E workload after validate-only returns', () => {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/check-docker-install.js'), 'utf8');
  const validateReturn = source.indexOf("console.log(`${cliStatus} Docker runtime NOT run.`);");
  const daemonProbe = source.indexOf("commandAvailable('docker', ['info'])");
  const composeUp = source.indexOf("[...compose, 'up', '--detach', '--build']");
  const composeDown = source.indexOf("[...compose, 'down', '--volumes', '--remove-orphans']");

  assert.ok(validateReturn >= 0 && validateReturn < daemonProbe);
  assert.ok(daemonProbe < composeUp && composeUp < composeDown);
});
