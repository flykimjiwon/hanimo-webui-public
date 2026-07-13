import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

import { withSchemaMigrationLock } from '../app/lib/schema-migration-lock.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(import.meta.dirname, '..');

test('database advisory lock serializes concurrent relation creation across clients', async () => {
  const database = `hanimo_lock_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
  const admin = new Pool({ connectionString: 'postgresql:///postgres', max: 1 });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    const pool = new Pool({ connectionString: `postgresql:///${database}`, max: 12 });
    const clients = await Promise.all(Array.from({ length: 12 }, () => pool.connect()));
    const failures = [];
    await Promise.all(clients.map(async (client) => {
      try {
        await withSchemaMigrationLock(client, () =>
          client.query('CREATE TABLE IF NOT EXISTS locked_relation (id BIGSERIAL PRIMARY KEY)')
        );
      } catch (error) {
        failures.push({ code: error.code, constraint: error.constraint });
      } finally {
        client.release();
      }
    }));
    await pool.end();
    assert.deepEqual(failures, []);
  } finally {
    if (created) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1', [database]);
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    }
    await admin.end();
  }
});

test('every fresh-schema lazy DDL path uses the shared lock', () => {
  const directLockSources = [
    'app/lib/autoMigrate.js',
    'app/api/user/memory/route.js',
    'app/api/admin/user-memories/route.js',
    'app/api/admin/init-schema/route.js',
    'app/lib/appErrorLogger.js',
    'app/lib/modelTables.js',
    'scripts/create-postgres-schema.js',
  ].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);

  for (const [file, source] of directLockSources) {
    assert.match(source, /schema-migration-lock|SCHEMA_MIGRATION_LOCK/, `${file} lock contract`);
  }

  const postgres = fs.readFileSync(path.join(root, 'app/lib/postgres.js'), 'utf8');
  assert.match(postgres, /schemaMutation[\s\S]*withSchemaMigrationLock/);

  const autoMigrate = fs.readFileSync(path.join(root, 'app/lib/autoMigrate.js'), 'utf8');
  assert.match(autoMigrate, /withSchemaMigrationLock\(client,[\s\S]*runColumnMigrations\(client\)/);

  const models = fs.readFileSync(path.join(root, 'app/lib/modelTables.js'), 'utf8');
  assert.match(models, /transaction\(async \(client\)[\s\S]*ensureTablesExist\(client\)[\s\S]*fixForeignKeyConstraints\(client\)/);

  const querySerializedEntrypoints = [
    'app/lib/modelServerMonitor.js',
    'app/api/user/memory/route.js',
    'app/api/admin/user-memories/route.js',
  ];
  for (const file of querySerializedEntrypoints) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /CREATE TABLE IF NOT EXISTS/);
    assert.match(source, /(?:@\/lib\/postgres|\.\/postgres)/);
  }
});
