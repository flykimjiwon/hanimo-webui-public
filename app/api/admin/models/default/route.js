import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken, verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError, createValidationError } from '@/lib/errorHandler';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureDefaultModelColumn() {
  const colCheck = await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'default_model_id'
  `);
  if (colCheck.rows.length === 0) {
    await query(`
      ALTER TABLE settings
      ADD COLUMN IF NOT EXISTS default_model_id UUID
    `).catch((err) => logger.warn('ALTER TABLE default_model_id skipped:', err.message));
  }
}

export async function GET(request) {
  try {
    const tokenPayload = verifyToken(request);
    if (!tokenPayload) {
      return createAuthError('Authentication required.');
    }

    await ensureDefaultModelColumn();

    const settingsResult = await query(
      "SELECT default_model_id FROM settings WHERE config_type = $1 LIMIT 1",
      ['general']
    );
    const defaultModelId = settingsResult.rows[0]?.default_model_id || null;

    if (!defaultModelId) {
      return NextResponse.json({
        default_model_id: null,
        model: null,
      });
    }

    const modelResult = await query(
      "SELECT id, model_name, label, endpoint FROM models WHERE id = $1",
      [defaultModelId]
    );

    return NextResponse.json({
      default_model_id: defaultModelId,
      model: modelResult.rows[0] || null,
    });
  } catch (error) {
    logger.error('Failed to fetch default model:', error);
    return createServerError(error, 'Failed to fetch default model.');
  }
}

export async function PUT(request) {
  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    await ensureDefaultModelColumn();

    let model_id;
    try {
      ({ model_id } = await request.json());
    } catch {
      return createValidationError('Invalid JSON in request body.');
    }

    if (model_id) {
      if (!UUID_REGEX.test(model_id)) {
        return createValidationError('model_id must be a valid UUID.');
      }
      const modelCheck = await query(
        "SELECT id FROM models WHERE id = $1",
        [model_id]
      );
      if (modelCheck.rows.length === 0) {
        return createValidationError('Specified model does not exist.');
      }
    }

    await query(
      "UPDATE settings SET default_model_id = $1 WHERE config_type = $2",
      [model_id || null, 'general']
    );

    return NextResponse.json({
      success: true,
      default_model_id: model_id || null,
    });
  } catch (error) {
    logger.error('Failed to update default model:', error);
    return createServerError(error, 'Failed to update default model.');
  }
}
