import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyTokenWithResult } from '@/lib/auth';
import { createServerError } from '@/lib/errorHandler';

async function ensureColumns() {
  await query(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS custom_instructions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ci_global_enabled BOOLEAN DEFAULT true
  `).catch(() => {});
}

export async function GET(request) {
  const authResult = verifyTokenWithResult(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const userId = authResult.user?.id || authResult.user?.sub || authResult.user?.userId;
    if (!userId) return NextResponse.json({ error: 'Unable to verify user ID.' }, { status: 401 });
    await ensureColumns();

    const result = await query(
      `SELECT default_model_id, custom_instructions, ci_global_enabled
       FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const row = result.rows[0];
    return NextResponse.json({
      defaultModelId: row?.default_model_id || '',
      customInstructions: row?.custom_instructions || [],
      ciGlobalEnabled: row?.ci_global_enabled !== false,
    });
  } catch (error) {
    logger.error('[GET /api/user/settings] error:', error);
    return createServerError(error);
  }
}

export async function POST(request) {
  const authResult = verifyTokenWithResult(request);
  if (!authResult.valid) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  try {
    const userId = authResult.user?.id || authResult.user?.sub || authResult.user?.userId;
    if (!userId) return NextResponse.json({ error: 'Unable to verify user ID.' }, { status: 401 });
    const body = await request.json();

    await query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        default_model_id VARCHAR(255),
        custom_instructions JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});
    await ensureColumns();

    // Save defaultModelId
    if (body.defaultModelId !== undefined) {
      const defaultModelId = String(body.defaultModelId || '').trim();
      await query(`
        INSERT INTO user_settings (user_id, default_model_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET default_model_id = $2, updated_at = CURRENT_TIMESTAMP
      `, [userId, defaultModelId || null]);

      return NextResponse.json({ message: 'Default model has been set.', defaultModelId });
    }

    // Save customInstructions (replace entire array)
    if (body.customInstructions !== undefined) {
      const instructions = body.customInstructions;

      if (!Array.isArray(instructions)) {
        return NextResponse.json({ error: 'customInstructions must be an array.' }, { status: 400 });
      }
      if (instructions.length > 10) {
        return NextResponse.json({ error: 'Maximum 10 custom prompts allowed.' }, { status: 400 });
      }

      for (const inst of instructions) {
        if (!inst.name || typeof inst.name !== 'string') {
          return NextResponse.json({ error: 'Each prompt requires a name.' }, { status: 400 });
        }
        if (inst.name.length > 50) {
          return NextResponse.json({ error: 'Prompt name must be 50 characters or less.' }, { status: 400 });
        }
        if (typeof inst.content !== 'string') {
          return NextResponse.json({ error: 'Prompt content is required.' }, { status: 400 });
        }
        if (inst.content.length > 500) {
          return NextResponse.json({ error: 'Each prompt must be 500 characters or less.' }, { status: 400 });
        }
      }

      const ciGlobalEnabled = body.ciGlobalEnabled !== undefined ? Boolean(body.ciGlobalEnabled) : null;

      await query(`
        INSERT INTO user_settings (user_id, custom_instructions, ci_global_enabled)
        VALUES ($1, $2::jsonb, COALESCE($3, true))
        ON CONFLICT (user_id)
        DO UPDATE SET
          custom_instructions = $2::jsonb,
          ci_global_enabled = COALESCE($3, user_settings.ci_global_enabled),
          updated_at = CURRENT_TIMESTAMP
      `, [userId, JSON.stringify(instructions), ciGlobalEnabled]);

      return NextResponse.json({
        message: 'Custom instructions saved.',
        customInstructions: instructions,
        ciGlobalEnabled: ciGlobalEnabled !== null ? ciGlobalEnabled : undefined,
      });
    }

    return NextResponse.json({ error: 'No settings to update.' }, { status: 400 });
  } catch (error) {
    logger.error('[POST /api/user/settings] error:', error);
    return createServerError(error);
  }
}
