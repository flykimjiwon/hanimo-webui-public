export const SCHEMA_MIGRATION_LOCK = Object.freeze([1212239433, 1297040460]);

export async function withSchemaMigrationLock(client, operation) {
  await client.query('SELECT pg_advisory_lock($1, $2)', SCHEMA_MIGRATION_LOCK);
  try {
    return await operation();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', SCHEMA_MIGRATION_LOCK);
  }
}

export async function lockSchemaMigrationTransaction(client) {
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', SCHEMA_MIGRATION_LOCK);
}
