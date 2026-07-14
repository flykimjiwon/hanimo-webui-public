import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  FIRST_ADMIN_LOCK,
  createFirstAdminLocked,
  lockFirstAdminTransaction,
} from '../../app/lib/first-admin-lock.mjs';

test('first-admin setup takes a transaction-scoped advisory lock', async () => {
  const calls = [];
  const client = {
    query: async (text, params) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  await lockFirstAdminTransaction(client);
  assert.deepEqual(calls, [{
    text: 'SELECT pg_advisory_xact_lock($1, $2)',
    params: FIRST_ADMIN_LOCK,
  }]);
});

test('create-first-admin checks and inserts on the locked transaction client', async () => {
  const source = await readFile(
    new URL('../../app/api/auth/create-first-admin/route.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /transaction\(\(client\) => createFirstAdminLocked\(client/);
  assert.match(source, /consumeRateLimit/);
  assert.match(source, /password\.length > 128/);
  assert.match(source, /await query\([\s\S]*SELECT COUNT[\s\S]*bcryptjs\.hash/);
  assert.match(source, /bcryptjs\.hash[\s\S]*transaction\(\(client\) => createFirstAdminLocked/);
});

test('two concurrent first-admin transactions create exactly one administrator', async () => {
  const administrators = [];
  let lockTail = Promise.resolve();
  let inserts = 0;

  async function transaction(work) {
    let release;
    const acquired = new Promise((resolve) => { release = resolve; });
    const previous = lockTail;
    lockTail = acquired;
    const client = {
      async query(text, params = []) {
        if (text.includes('pg_advisory_xact_lock')) await previous;
        if (text.includes("COUNT(*)") && text.includes("role = 'admin'")) {
          return { rows: [{ count: String(administrators.length) }] };
        }
        if (text.startsWith('SELECT id FROM users')) {
          return { rows: administrators.filter((user) => user.email === params[0]) };
        }
        if (text.includes('INSERT INTO users')) {
          inserts += 1;
          const user = { id: inserts, name: params[0], email: params[1], role: 'admin' };
          administrators.push(user);
          return { rows: [user] };
        }
        return { rows: [] };
      },
    };
    try {
      return await work(client);
    } finally {
      release();
    }
  }

  const outcomes = await Promise.all([
    transaction((client) => createFirstAdminLocked(client, {
      name: 'Admin A', email: 'a@example.com', passwordHash: 'hash-a',
    })),
    transaction((client) => createFirstAdminLocked(client, {
      name: 'Admin B', email: 'b@example.com', passwordHash: 'hash-b',
    })),
  ]);

  assert.deepEqual(outcomes.map((result) => result.outcome).sort(), ['admin-exists', 'created']);
  assert.equal(administrators.length, 1);
  assert.equal(inserts, 1);
});
