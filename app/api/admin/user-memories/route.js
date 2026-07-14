import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getPostgresClient, query } from '@/lib/postgres';
import { withSchemaMigrationLock } from '@/lib/schema-migration-lock.mjs';
import { verifyAdminWithResult } from '@/lib/auth';
import { createServerError, createAuthError, createForbiddenError } from '@/lib/errorHandler';
import { getNextModelServerEndpointWithIndex } from '@/lib/modelServers';
import { logExternalApiRequest } from '@/lib/externalApiLogger';
import { fetchWithProviderPolicy } from '@/lib/security/provider-outbound.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_USERS = 50;

async function ensureTables() {
  const client = await getPostgresClient();
  if (!client) return;
  try {
    await withSchemaMigrationLock(client, async () => {
      await client.query(`CREATE TABLE IF NOT EXISTS memory_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        model_id VARCHAR(255) DEFAULT '', interval_minutes INTEGER DEFAULT 60,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await client.query('INSERT INTO memory_settings (id) VALUES (1) ON CONFLICT DO NOTHING');
      await client.query(`CREATE TABLE IF NOT EXISTS user_memories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        memory TEXT DEFAULT '', last_indexed_id UUID, indexed_count INTEGER DEFAULT 0,
        is_indexing BOOLEAN DEFAULT false, locked_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await client.query('ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS is_indexing BOOLEAN DEFAULT false');
      await client.query('ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP');
    });
  } finally {
    client.release();
  }
}

const MEMORY_SYSTEM_PROMPT = `You are a memory summarizer. Output in Korean. Summarize user interests, projects, preferences, tech stack concisely. Merge new info with existing memory. Remove outdated info. Keep under 2000 characters. Use bullet points by category. Return ONLY the updated memory text.`;

function getAuthError(authResult) {
  if (authResult.error?.includes('admin') || authResult.error?.includes('manager')) return createForbiddenError(authResult.error);
  return createAuthError(authResult.error);
}

// GET: All users memory list + memory settings
export async function GET(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) return getAuthError(authResult);

    await ensureTables();

    const [usersResult, memoriesResult, settingsResult, msgCountResult] = await Promise.all([
      query('SELECT id, email, name, department, role FROM users ORDER BY name, email'),
      query('SELECT user_id, memory, indexed_count, last_indexed_id, updated_at FROM user_memories ORDER BY updated_at DESC').catch(() => ({ rows: [] })),
      query('SELECT model_id, interval_minutes FROM memory_settings WHERE id = 1').catch(() => ({ rows: [] })),
      query('SELECT user_id, COUNT(*) as msg_count FROM chat_history WHERE user_id IS NOT NULL GROUP BY user_id').catch(() => ({ rows: [] })),
    ]);

    const memoryMap = new Map(memoriesResult.rows.map((m) => [m.user_id, m]));
    const msgCountMap = new Map(msgCountResult.rows.map((r) => [r.user_id, parseInt(r.msg_count)]));
    const allUsers = usersResult.rows.map((u) => {
      const mem = memoryMap.get(u.id);
      return {
        user_id: u.id, email: u.email, name: u.name, department: u.department, role: u.role,
        memory: mem?.memory || '', indexed_count: mem?.indexed_count ?? 0,
        updated_at: mem?.updated_at || null, hasMemory: !!mem,
        totalMessages: msgCountMap.get(u.id) || 0,
      };
    });

    return NextResponse.json({
      users: allUsers,
      settings: {
        modelId: settingsResult.rows[0]?.model_id || '',
        intervalMinutes: settingsResult.rows[0]?.interval_minutes ?? 60,
      },
    });
  } catch (error) {
    logger.error('[GET /api/admin/user-memories] error:', error);
    return createServerError(error);
  }
}

// POST: Save memory settings (model, batch interval)
export async function POST(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) return getAuthError(authResult);

    await ensureTables();

    const { modelId, intervalMinutes } = await request.json();
    const interval = Math.max(5, Math.min(1440, Number(intervalMinutes) || 60));

    await query(
      'UPDATE memory_settings SET model_id = $1, interval_minutes = $2, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [modelId || '', interval]
    );

    return NextResponse.json({
      message: 'Memory settings saved.',
      settings: { modelId: modelId || '', intervalMinutes: interval },
    });
  } catch (error) {
    logger.error('[POST /api/admin/user-memories] error:', error);
    return createServerError(error);
  }
}

// PATCH: Execute indexing for selected users
export async function PATCH(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) return getAuthError(authResult);

    const { userIds, reindex } = await request.json();

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'Please select users.' }, { status: 400 });
    }
    if (userIds.length > MAX_BATCH_USERS) {
      return NextResponse.json({ error: `Maximum ${MAX_BATCH_USERS} users per batch.` }, { status: 400 });
    }
    for (const uid of userIds) {
      if (!UUID_REGEX.test(uid)) {
        return NextResponse.json({ error: `Invalid user ID: ${uid}` }, { status: 400 });
      }
    }

    await ensureTables();

    // Model settings
    const msResult = await query('SELECT model_id FROM memory_settings WHERE id = 1').catch(() => ({ rows: [] }));
    let targetModel = msResult.rows[0]?.model_id;
    if (!targetModel) {
      const fallback = await query('SELECT selected_model_id FROM agent_settings WHERE selected_model_id IS NOT NULL LIMIT 1').catch(() => ({ rows: [] }));
      targetModel = fallback.rows[0]?.selected_model_id;
    }
    if (!targetModel) {
      return NextResponse.json({ error: 'No model configured for memory summarization.' }, { status: 400 });
    }

    const endpoint = await getNextModelServerEndpointWithIndex();
    if (!endpoint || !endpoint.endpoint) {
      return NextResponse.json({ error: 'No available model server.' }, { status: 503 });
    }

    const results = [];

    for (const userId of userIds) {
      try {
        // Prevent concurrent indexing
        const lockResult = await query(
          `UPDATE user_memories SET is_indexing = true, locked_at = NOW()
           WHERE user_id = $1 AND (is_indexing = false OR locked_at < NOW() - INTERVAL '10 minutes')
           RETURNING user_id`,
          [userId]
        ).catch(() => ({ rows: [] }));

        if (lockResult.rows.length === 0) {
          const existing = await query('SELECT is_indexing, locked_at FROM user_memories WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }));
          if (existing.rows.length > 0 && existing.rows[0].is_indexing) {
            results.push({ userId, status: 'skip', reason: 'Already indexing' });
            continue;
          }
          await query(
            'INSERT INTO user_memories (user_id, is_indexing, locked_at) VALUES ($1, true, NOW()) ON CONFLICT (user_id) DO UPDATE SET is_indexing = true, locked_at = NOW()',
            [userId]
          ).catch(() => {});
        }

        try {
          const memRow = await query('SELECT memory, last_indexed_id, indexed_count FROM user_memories WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }));
          const currentMemory = memRow.rows[0]?.memory || '';
          const lastIndexedId = memRow.rows[0]?.last_indexed_id || null;
          const indexedCount = memRow.rows[0]?.indexed_count ?? 0;

          const roomsRes = await query('SELECT id FROM chat_rooms WHERE user_id = $1', [userId]);
          const roomIds = roomsRes.rows.map((r) => r.id);
          if (roomIds.length === 0) {
            results.push({ userId, status: 'skip', reason: 'No chat rooms' });
            continue;
          }

          // Batch loop
          let batchLastId = reindex ? null : lastIndexedId;
          let totalIndexed = 0;
          let runningMemory = reindex ? '' : currentMemory;
          const MAX_BATCHES = 5;
          const BATCH_CHAR_LIMIT = 8000;

          for (let batch = 0; batch < MAX_BATCHES; batch++) {
            let newMsgs;
            if (batchLastId) {
              const lastTs = await query('SELECT created_at FROM chat_history WHERE id = $1', [batchLastId]).catch(() => ({ rows: [] }));
              const t = lastTs.rows[0]?.created_at;
              newMsgs = t
                ? await query('SELECT id, role, text FROM chat_history WHERE room_id = ANY($1) AND created_at > $2 ORDER BY created_at ASC LIMIT 500', [roomIds, t])
                : await query('SELECT id, role, text FROM chat_history WHERE room_id = ANY($1) ORDER BY created_at ASC LIMIT 500', [roomIds]);
            } else {
              newMsgs = await query('SELECT id, role, text FROM chat_history WHERE room_id = ANY($1) ORDER BY created_at ASC LIMIT 500', [roomIds]);
            }

            if (newMsgs.rows.length === 0) break;

            // Character-based batch splitting
            const batchRows = [];
            let charCount = 0;
            for (const m of newMsgs.rows) {
              const msgLen = Math.min((m.text || '').length, 300);
              if (charCount + msgLen > BATCH_CHAR_LIMIT && batchRows.length > 0) break;
              batchRows.push(m);
              charCount += msgLen;
            }
            if (batchRows.length === 0) break;

            const chatText = batchRows.map((m) => `[${m.role}] ${(m.text || '').slice(0, 300)}`).join('\n');
            const userPrompt = runningMemory
              ? `Existing memory:\n${runningMemory}\n\n---\nNew conversations (batch ${batch + 1}, ${batchRows.length} messages):\n${chatText}\n\nUpdate the memory.`
              : `Conversations (${batchRows.length} messages):\n${chatText}\n\nCreate user memory.`;

            const reqHeaders = { 'Content-Type': 'application/json' };
            if (endpoint.apiKey) reqHeaders['Authorization'] = `Bearer ${endpoint.apiKey}`;

            const llmStartTime = Date.now();
            const llmUrl = `${endpoint.endpoint}/v1/chat/completions`;

            const llmRes = await fetchWithProviderPolicy(llmUrl, {
              method: 'POST',
              headers: reqHeaders,
              body: JSON.stringify({ model: targetModel, messages: [{ role: 'system', content: MEMORY_SYSTEM_PROMPT }, { role: 'user', content: userPrompt }], temperature: 0.3, max_tokens: 2048 }),
              signal: AbortSignal.timeout(60000),
            });

            const llmElapsed = Date.now() - llmStartTime;

            if (!llmRes.ok) {
              const errText = await llmRes.text().catch(() => '');
              logger.error(`[PATCH user-memories] LLM error ${llmRes.status}: ${errText.slice(0, 200)}`);
              logExternalApiRequest({
                sourceType: 'internal', provider: endpoint.provider || 'model-server', apiType: 'memory-index',
                endpoint: llmUrl, model: targetModel, promptTokenCount: userPrompt.length, responseTokenCount: 0,
                responseTime: llmElapsed, statusCode: llmRes.status, error: `Memory indexing failed: HTTP ${llmRes.status}`,
                jwtUserId: userId,
              }).catch(() => {});
              results.push({
                userId,
                status: 'error',
                reason: `LLM ${llmRes.status} (batch ${batch + 1})`,
                detail: {
                  statusCode: llmRes.status,
                  endpoint: llmUrl,
                  model: targetModel,
                  provider: endpoint.provider || 'model-server',
                  responseTime: llmElapsed,
                  errorBody: errText.slice(0, 500),
                },
              });
              break;
            }

            const llmData = await llmRes.json();
            const rawMemory = llmData.choices?.[0]?.message?.content || '';

            logExternalApiRequest({
              sourceType: 'internal', provider: endpoint.provider || 'model-server', apiType: 'memory-index',
              endpoint: llmUrl, model: targetModel, promptTokenCount: userPrompt.length, responseTokenCount: rawMemory.length,
              responseTime: llmElapsed, statusCode: 200, isStream: false,
              jwtUserId: userId,
            }).catch(() => {});

            // Truncate at newline boundary to prevent markdown break
            const cutIdx = rawMemory.length > 2000 ? rawMemory.lastIndexOf('\n', 2000) : -1;
            runningMemory = rawMemory.length > 2000
              ? rawMemory.slice(0, cutIdx === -1 ? 2000 : cutIdx)
              : rawMemory;

            batchLastId = batchRows[batchRows.length - 1].id;
            totalIndexed += batchRows.length;

            if (batchRows.length >= newMsgs.rows.length) break;
          }

          if (totalIndexed === 0) {
            results.push({ userId, status: 'skip', reason: 'No new messages' });
            continue;
          }

          await query(`
            UPDATE user_memories
            SET memory = $1, last_indexed_id = $2, indexed_count = $3, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $4
          `, [runningMemory, batchLastId, indexedCount + totalIndexed, userId]);

          results.push({ userId, status: 'success', indexed: totalIndexed, memory: runningMemory });
        } finally {
          // Always release lock
          await query('UPDATE user_memories SET is_indexing = false WHERE user_id = $1', [userId]).catch(() => {});
        }
      } catch (err) {
        logger.error('[PATCH user-memories] error for user:', userId, err.message);
        await query('UPDATE user_memories SET is_indexing = false WHERE user_id = $1', [userId]).catch(() => {});
        results.push({ userId, status: 'error', reason: err.message?.slice(0, 100) });
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    return NextResponse.json({ message: `${successCount}/${userIds.length} users indexed.`, results });
  } catch (error) {
    logger.error('[PATCH /api/admin/user-memories] error:', error);
    return createServerError(error);
  }
}

// DELETE: Reset specific user's memory
export async function DELETE(request) {
  try {
    const authResult = verifyAdminWithResult(request);
    if (!authResult.valid) return getAuthError(authResult);

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId || !UUID_REGEX.test(userId)) {
      return NextResponse.json({ error: 'Valid userId is required.' }, { status: 400 });
    }

    await query('DELETE FROM user_memories WHERE user_id = $1', [userId]);
    return NextResponse.json({ message: 'Memory has been reset.' });
  } catch (error) {
    logger.error('[DELETE /api/admin/user-memories] error:', error);
    return createServerError(error);
  }
}
