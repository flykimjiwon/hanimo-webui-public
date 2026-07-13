const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const rootDir = path.join(__dirname, '..');

test('Given the POST-only chat route, when smoke checks authentication, then it sends POST JSON', () => {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/smoke-routes.js'), 'utf8');
  assert.match(
    source,
    /\['\/api\/v1\/chat\/completions', 401, \{[\s\S]*method: 'POST'[\s\S]*'Content-Type': 'application\/json'/
  );
});

test('Given a fresh database, when the users table is created, then final auth constraints exist', () => {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/create-postgres-schema.js'), 'utf8');
  const usersTable = source.match(/CREATE TABLE users \([\s\S]*?\n\s*\)/)?.[0] || '';

  assert.match(usersTable, /auth_type VARCHAR\(20\) DEFAULT 'local'/);
  assert.match(usersTable, /password_hash VARCHAR\(255\)(?:,|\n)/);
  assert.doesNotMatch(usersTable, /password_hash VARCHAR\(255\) NOT NULL/);
  assert.match(usersTable, /role VARCHAR\(50\) DEFAULT 'user' CHECK \(role IN \('user', 'admin', 'manager'\)\)/);
});

test('Given a fresh database, chat_rooms includes every custom-instruction field selected by the room route', () => {
  const schemaSource = fs.readFileSync(path.join(rootDir, 'scripts/create-postgres-schema.js'), 'utf8');
  const routeSource = fs.readFileSync(path.join(rootDir, 'app/api/webapp-chat/room/route.js'), 'utf8');
  const chatRoomsTable = schemaSource.match(/CREATE TABLE chat_rooms \([\s\S]*?\n\s*\)/)?.[0] || '';

  assert.match(routeSource, /custom_instruction, custom_instruction_active/);
  assert.match(chatRoomsTable, /custom_instruction TEXT DEFAULT ''/);
  assert.match(chatRoomsTable, /custom_instruction_active BOOLEAN DEFAULT false/);
});

test('Given a fresh database, final runtime columns exist before route-level migrations', () => {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/create-postgres-schema.js'), 'utf8');
  const table = (name) => source.match(new RegExp(`CREATE TABLE ${name} \\([\\s\\S]*?\\n\\s*\\)`))?.[0] || '';

  assert.match(table('chat_history'), /draw_mode BOOLEAN DEFAULT false/);
  assert.match(table('settings'), /draw_enabled BOOLEAN DEFAULT false/);
  assert.match(table('settings'), /draw_system_prompt TEXT/);
  assert.match(table('models'), /multi_turn_limit INTEGER/);
  assert.match(table('models'), /multi_turn_unlimited BOOLEAN DEFAULT false/);
  assert.match(table('notices'), /views INTEGER DEFAULT 0/);
});

test('Given a fresh database, refresh-token rotation storage exists before the first login', () => {
  const source = fs.readFileSync(path.join(rootDir, 'scripts/create-postgres-schema.js'), 'utf8');
  const refreshTable = source.match(/CREATE TABLE refresh_tokens \([\s\S]*?\n\s*\)/)?.[0] || '';

  assert.match(refreshTable, /token_hash\s+VARCHAR\(64\) NOT NULL UNIQUE/);
  assert.match(refreshTable, /revoked\s+BOOLEAN DEFAULT FALSE/);
  assert.match(refreshTable, /revoked_at\s+TIMESTAMP/);
  assert.match(refreshTable, /expires_at\s+TIMESTAMP NOT NULL/);
});

test('Given auto-migration core tables, the fresh schema creates every one before first use', () => {
  const autoMigrateSource = fs.readFileSync(path.join(rootDir, 'app/lib/autoMigrate.js'), 'utf8');
  const freshSchemaSource = fs.readFileSync(path.join(rootDir, 'scripts/create-postgres-schema.js'), 'utf8');
  const coreTables = [...autoMigrateSource.matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*sql:\s*`CREATE TABLE IF NOT EXISTS/g)]
    .map((match) => match[1]);
  const freshTables = new Set(
    [...freshSchemaSource.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)/g)]
      .map((match) => match[1])
  );
  const missingTables = coreTables.filter((tableName) => !freshTables.has(tableName));

  assert.ok(coreTables.includes('refresh_tokens'), 'refresh_tokens must remain auth-critical core schema');
  assert.deepEqual(missingTables, []);
});

test('Given required DB coverage, when prerequisites are absent, then the integration check fails', () => {
  const env = {
    ...process.env,
    API_TOKEN_DB_TEST_REQUIRED: 'true',
    API_TOKEN_DB_TEST_DISABLE_ENV_FILES: 'true',
  };
  delete env.POSTGRES_URI;
  delete env.DATABASE_URL;
  delete env.JWT_SECRET;

  const result = spawnSync(process.execPath, ['scripts/test-api-token-db.js'], {
    cwd: rootDir,
    env,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(`${result.stdout}${result.stderr}`, /required/i);
});

test('Given an injected fixture failure, when cleanup runs, then no temporary database or mock remains', async () => {
  const pool = new Pool({ connectionString: 'postgresql:///postgres', max: 1 });
  const listDatabases = async () => {
    const result = await pool.query(
      "SELECT datname FROM pg_database WHERE datname LIKE 'hanimo_e2e_%' ORDER BY datname"
    );
    return result.rows.map((row) => row.datname);
  };
  const before = await listDatabases();

  const result = spawnSync(process.execPath, ['scripts/check-local-release.js'], {
    cwd: rootDir,
    env: { ...process.env, LOCAL_RELEASE_FIXTURE_FAIL_AT: 'after-mock' },
    encoding: 'utf8',
    timeout: 30000,
  });

  const after = await listDatabases();
  await pool.end();
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 1);
  assert.match(output, /cleanup verified/);
  assert.match(output, /Injected fixture failure/);
  assert.deepEqual(after, before);
});
