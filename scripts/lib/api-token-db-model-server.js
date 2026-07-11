async function configureModelServer(
  client,
  modelServerUrl,
  { provider = 'model-server', apiKey = '' } = {}
) {
  if (!modelServerUrl) {
    return null;
  }

  const previous = await client.query(
    `SELECT id, ollama_endpoints, endpoint_type, custom_endpoints
     FROM settings
     WHERE config_type = 'general'`
  );

  const isOpenAiCompatible = provider === 'openai-compatible';
  const customEndpoints = isOpenAiCompatible
    ? JSON.stringify([
        {
          name: 'api-token-db-test',
          url: modelServerUrl,
          provider: 'openai-compatible',
          apiKey,
          isActive: true,
        },
      ])
    : null;
  const ollamaEndpoints = isOpenAiCompatible ? '' : modelServerUrl;
  const endpointType = isOpenAiCompatible ? 'openai-compatible' : 'ollama';

  if (previous.rows.length === 0) {
    const inserted = await client.query(
      `INSERT INTO settings (config_type, ollama_endpoints, endpoint_type, custom_endpoints, created_at, updated_at)
       VALUES ('general', $1, $2, $3, NOW(), NOW())
       RETURNING id`,
      [ollamaEndpoints, endpointType, customEndpoints]
    );
    return { kind: 'inserted', id: inserted.rows[0].id };
  }

  await client.query(
    `UPDATE settings
     SET ollama_endpoints = $1,
         endpoint_type = $2,
         custom_endpoints = $3,
         updated_at = NOW()
     WHERE config_type = 'general'`,
    [ollamaEndpoints, endpointType, customEndpoints]
  );
  return { kind: 'updated', rows: previous.rows };
}

function serializeJson(value) {
  return value == null ? null : JSON.stringify(value);
}

async function restoreModelServer(client, snapshot) {
  if (!snapshot) {
    return;
  }
  if (snapshot.kind === 'inserted') {
    await client.query('DELETE FROM settings WHERE id = $1', [snapshot.id]);
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
