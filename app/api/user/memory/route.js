import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import { createServerError } from '@/lib/errorHandler';
import { getNextModelServerEndpointWithIndex } from '@/lib/modelServers';
import { logExternalApiRequest } from '@/lib/externalApiLogger';

async function ensureMemoryTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_memories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      memory TEXT DEFAULT '',
      last_indexed_id UUID,
      indexed_count INTEGER DEFAULT 0,
      is_indexing BOOLEAN DEFAULT false,
      locked_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query('ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS is_indexing BOOLEAN DEFAULT false').catch(() => {});
  await query('ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP').catch(() => {});
}

const MEMORY_SYSTEM_PROMPT = `You are a memory summarizer. Output in Korean. Summarize user interests, projects, preferences, tech stack concisely. Merge new info with existing memory. Remove outdated info. Keep under 2000 characters. Use bullet points by category. Return ONLY the updated memory text.`;

// GET: Retrieve user memory
export async function GET(request) {
  try {
    const authResult = verifyTokenWithResult(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user?.id || authResult.user?.sub || authResult.user?.userId;
    if (!userId) return NextResponse.json({ error: 'Unable to verify user ID.' }, { status: 401 });

    await ensureMemoryTable();

    const result = await query(
      'SELECT memory, indexed_count, updated_at FROM user_memories WHERE user_id = $1',
      [userId]
    ).catch(() => ({ rows: [] }));

    return NextResponse.json({
      memory: result.rows[0]?.memory || '',
      indexedCount: result.rows[0]?.indexed_count ?? 0,
      updatedAt: result.rows[0]?.updated_at || null,
    });
  } catch (error) {
    logger.error('[GET /api/user/memory] error:', error);
    return createServerError(error);
  }
}

// POST: Execute memory indexing (process new messages only)
export async function POST(request) {
  try {
    const authResult = verifyTokenWithResult(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user?.id || authResult.user?.sub || authResult.user?.userId;
    if (!userId) return NextResponse.json({ error: 'Unable to verify user ID.' }, { status: 401 });

    await ensureMemoryTable();

    // Prevent concurrent indexing (with 10-minute stale lock TTL)
    const lockResult = await query(
      `UPDATE user_memories SET is_indexing = true, locked_at = NOW()
       WHERE user_id = $1 AND (is_indexing = false OR locked_at < NOW() - INTERVAL '10 minutes')
       RETURNING user_id`,
      [userId]
    ).catch(() => ({ rows: [] }));

    if (lockResult.rows.length === 0) {
      const existing = await query('SELECT is_indexing, locked_at FROM user_memories WHERE user_id = $1', [userId]).catch(() => ({ rows: [] }));
      if (existing.rows.length > 0 && existing.rows[0].is_indexing) {
        return NextResponse.json({ message: 'Indexing already in progress.', indexed: 0 });
      }
      await query(
        'INSERT INTO user_memories (user_id, is_indexing, locked_at) VALUES ($1, true, NOW()) ON CONFLICT (user_id) DO UPDATE SET is_indexing = true, locked_at = NOW()',
        [userId]
      ).catch(() => {});
    }

    try {
      const memResult = await query(
        'SELECT memory, last_indexed_id, indexed_count FROM user_memories WHERE user_id = $1',
        [userId]
      ).catch(() => ({ rows: [] }));

      const currentMemory = memResult.rows[0]?.memory || '';
      const lastIndexedId = memResult.rows[0]?.last_indexed_id || null;
      const indexedCount = memResult.rows[0]?.indexed_count ?? 0;

      const roomsResult = await query('SELECT id FROM chat_rooms WHERE user_id = $1', [userId]);
      const roomIds = roomsResult.rows.map((r) => r.id);

      if (roomIds.length === 0) {
        return NextResponse.json({ message: 'No chat rooms found.', indexed: 0 });
      }

      // Fetch new messages (uses chat_history table in hanimo-webui)
      let newMessages;
      if (lastIndexedId) {
        const lastMsgResult = await query('SELECT created_at FROM chat_history WHERE id = $1', [lastIndexedId]).catch(() => ({ rows: [] }));
        const lastTime = lastMsgResult.rows[0]?.created_at;
        newMessages = lastTime
          ? await query('SELECT id, role, text, created_at FROM chat_history WHERE room_id = ANY($1) AND created_at > $2 ORDER BY created_at ASC LIMIT 200', [roomIds, lastTime])
          : await query('SELECT id, role, text, created_at FROM chat_history WHERE room_id = ANY($1) ORDER BY created_at ASC LIMIT 200', [roomIds]);
      } else {
        newMessages = await query('SELECT id, role, text, created_at FROM chat_history WHERE room_id = ANY($1) ORDER BY created_at ASC LIMIT 200', [roomIds]);
      }

      if (newMessages.rows.length === 0) {
        return NextResponse.json({ message: 'No new conversations found.', indexed: 0, memory: currentMemory });
      }

      const chatText = newMessages.rows
        .map((m) => `[${m.role}] ${(m.text || '').slice(0, 300)}`)
        .join('\n');

      // Model settings
      let targetModel;
      try {
        await query(`CREATE TABLE IF NOT EXISTS memory_settings (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          model_id VARCHAR(255) DEFAULT '', interval_minutes INTEGER DEFAULT 60,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`).catch(() => {});
        await query('INSERT INTO memory_settings (id) VALUES (1) ON CONFLICT DO NOTHING').catch(() => {});
        const msResult = await query('SELECT model_id FROM memory_settings WHERE id = 1');
        targetModel = msResult.rows[0]?.model_id;
      } catch { /* ignore */ }

      if (!targetModel) {
        try {
          const anyModel = await query('SELECT selected_model_id FROM agent_settings WHERE selected_model_id IS NOT NULL LIMIT 1');
          targetModel = anyModel.rows[0]?.selected_model_id;
        } catch { /* ignore */ }
      }

      if (!targetModel) {
        return NextResponse.json({
          error: 'No model configured for memory summarization. Set a model in Admin > User Memories.',
        }, { status: 400 });
      }

      const endpoint = await getNextModelServerEndpointWithIndex();
      if (!endpoint || !endpoint.endpoint) {
        return NextResponse.json({ error: 'No available model server.' }, { status: 503 });
      }

      const userPrompt = currentMemory
        ? `Existing memory:\n${currentMemory}\n\n---\n\nNew conversations:\n${chatText}\n\nMerge and update the memory.`
        : `New conversations:\n${chatText}\n\nAnalyze and create user memory.`;

      const headers = { 'Content-Type': 'application/json' };
      if (endpoint.apiKey) headers['Authorization'] = `Bearer ${endpoint.apiKey}`;

      const llmStartTime = Date.now();
      const llmUrl = `${endpoint.endpoint}/v1/chat/completions`;

      const response = await fetch(llmUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: targetModel,
          messages: [
            { role: 'system', content: MEMORY_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(60000),
      });

      const llmElapsed = Date.now() - llmStartTime;

      if (!response.ok) {
        logExternalApiRequest({
          sourceType: 'internal', provider: endpoint.provider || 'model-server', apiType: 'memory-index',
          endpoint: llmUrl, model: targetModel, promptTokenCount: userPrompt.length, responseTokenCount: 0,
          responseTime: llmElapsed, statusCode: response.status, error: `Memory indexing failed: HTTP ${response.status}`,
          jwtUserId: userId,
        }).catch(() => {});
        return NextResponse.json({ error: `Model server error (${response.status})` }, { status: 502 });
      }

      const result = await response.json();
      const rawMemory = result.choices?.[0]?.message?.content || '';

      logExternalApiRequest({
        sourceType: 'internal', provider: endpoint.provider || 'model-server', apiType: 'memory-index',
        endpoint: llmUrl, model: targetModel, promptTokenCount: userPrompt.length, responseTokenCount: rawMemory.length,
        responseTime: llmElapsed, statusCode: 200, isStream: false,
        jwtUserId: userId,
      }).catch(() => {});

      const cutIdx = rawMemory.length > 2000 ? rawMemory.lastIndexOf('\n', 2000) : -1;
      const updatedMemory = rawMemory.length > 2000
        ? rawMemory.slice(0, cutIdx === -1 ? 2000 : cutIdx)
        : rawMemory;

      const lastMsg = newMessages.rows[newMessages.rows.length - 1];

      await query(`
        UPDATE user_memories
        SET memory = $1, last_indexed_id = $2, indexed_count = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
      `, [updatedMemory, lastMsg.id, indexedCount + newMessages.rows.length, userId]);

      return NextResponse.json({
        message: 'Memory has been updated.',
        indexed: newMessages.rows.length,
        totalIndexed: indexedCount + newMessages.rows.length,
        memoryLength: updatedMemory.length,
      });
    } finally {
      // Always release indexing lock
      await query('UPDATE user_memories SET is_indexing = false WHERE user_id = $1', [userId]).catch(() => {});
    }
  } catch (error) {
    logger.error('[POST /api/user/memory] error:', error);
    return createServerError(error);
  }
}

// DELETE: Reset memory
export async function DELETE(request) {
  try {
    const authResult = verifyTokenWithResult(request);
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user?.id || authResult.user?.sub || authResult.user?.userId;
    if (!userId) return NextResponse.json({ error: 'Unable to verify user ID.' }, { status: 401 });

    await query('DELETE FROM user_memories WHERE user_id = $1', [userId]);
    return NextResponse.json({ message: 'Memory has been reset.' });
  } catch (error) {
    logger.error('[DELETE /api/user/memory] error:', error);
    return createServerError(error);
  }
}
