async function configureModelServer(client, modelServerUrl) {
  if (!modelServerUrl) {
    return null;
  }

  const previous = await client.query(
    `SELECT id, ollama_endpoints, endpoint_type, custom_endpoints
     FROM settings
     WHERE config_type = 'general'`
  );

  if (previous.rows.length === 0) {
    await client.query(
      `INSERT INTO settings (config_type, ollama_endpoints, endpoint_type, custom_endpoints, created_at, updated_at)
       VALUES ('general', $1, 'ollama', NULL, NOW(), NOW())`,
      [modelServerUrl]
    );
    return { kind: 'inserted', modelServerUrl };
  }

  await client.query(
    `UPDATE settings
     SET ollama_endpoints = $1,
         endpoint_type = 'ollama',
         custom_endpoints = NULL,
         updated_at = NOW()
     WHERE config_type = 'general'`,
    [modelServerUrl]
  );
  return { kind: 'updated', rows: previous.rows, modelServerUrl };
}

function serializeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

async function restoreModelServer(client, snapshot) {
  if (!snapshot) {
    return;
  }
  if (snapshot.kind === 'inserted') {
    await client.query(
      `DELETE FROM settings
       WHERE config_type = 'general'
         AND ollama_endpoints = $1
         AND endpoint_type = 'ollama'`,
      [snapshot.modelServerUrl]
    );
    return;
  }

  for (const row of snapshot.rows) {
    await client.query(
      `UPDATE settings
       SET ollama_endpoints = $1,
           endpoint_type = $2,
           custom_endpoints = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [row.ollama_endpoints, row.endpoint_type, serializeJson(row.custom_endpoints), row.id]
    );
  }
}

module.exports = { configureModelServer, restoreModelServer };
