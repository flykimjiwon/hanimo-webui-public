import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { verifyAdmin } from '@/lib/adminAuth';

const pool = new Pool({ connectionString: process.env.POSTGRES_URI });

function requireDestructiveAdminEnabled() {
  if (process.env.HANIMO_ENABLE_DESTRUCTIVE_ADMIN === 'true') return null;
  return NextResponse.json(
    {
      error:
        'Destructive admin database operations are disabled. Set HANIMO_ENABLE_DESTRUCTIVE_ADMIN=true only during a trusted maintenance window.',
    },
    { status: 403 }
  );
}

/**
 * DB reset API
 * Admin-only access
 */
export async function POST(req) {
  try {
    const adminResult = verifyAdmin(req);
    if (adminResult instanceof NextResponse) return adminResult;

    const destructiveGate = requireDestructiveAdminEnabled();
    if (destructiveGate) return destructiveGate;

    const body = await req.json();
    const { type, tables } = body;

    if (!type) {
      return NextResponse.json(
        { error: 'type is required. (all, partial)' },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let deletedTables = [];
      let message = '';

      if (type === 'all') {
        // Reset entire DB (excluding users table)
        const tablesToDelete = [
          'chat_history',
          'chat_rooms',
          'messages',
          'chat_files',
          'board_comments',
          'board_posts',
          'model_logs',
          'model_server_error_history',
          'model_server_status',
          'external_api_prompts',
          'external_api_logs',
          'api_tokens',
          'notices',
          'user_chats',
          'qa_logs',
          'app_error_logs',
        ];

        for (const table of tablesToDelete) {
          await client.query(`DELETE FROM ${table}`);
          deletedTables.push(table);
        }

        message = 'Entire DB has been reset. (users table preserved)';
      } else if (type === 'partial') {
        // Reset selected tables only
        if (!tables || !Array.isArray(tables) || tables.length === 0) {
          throw new Error('Please select tables to reset.');
        }

        // Reset only allowed tables (excluding core tables like users, settings)
        const allowedTables = [
          'chat_history',
          'chat_rooms',
          'messages',
          'chat_files',
          'board_comments',
          'board_posts',
          'model_logs',
          'model_server_error_history',
          'model_server_status',
          'external_api_prompts',
          'external_api_logs',
          'api_tokens',
          'notices',
          'user_chats',
          'qa_logs',
          'app_error_logs',
        ];

        for (const table of tables) {
          if (!allowedTables.includes(table)) {
            throw new Error(`Disallowed table: ${table}`);
          }
          await client.query(`DELETE FROM ${table}`);
          deletedTables.push(table);
        }

        message = `Selected tables have been reset: ${deletedTables.join(', ')}`;
      } else {
        throw new Error('Invalid type. (all, partial)');
      }

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        message,
        deletedTables,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('DB reset failed:', error);
    return NextResponse.json(
      {
        error: error.message || 'An error occurred during DB reset.',
      },
      { status: 500 }
    );
  }
}
