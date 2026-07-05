import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdmin } from '@/lib/adminAuth';

// Debug database status check
export async function GET(request) {
  try {
    // Check admin privileges
    const adminCheck = verifyAdmin(request);
    if (!adminCheck.success) {
      return adminCheck;
    }

    // Check modelConfig table
    const modelConfigResult = await query(
      `SELECT * FROM model_config WHERE config_type = $1 LIMIT 1`,
      ['models']
    );
    const modelConfig = modelConfigResult.rows[0] || null;
    
    // Process config JSONB field
    if (modelConfig && modelConfig.config) {
      modelConfig.categories = modelConfig.config.categories;
    }

    // Check promptConfig table
    const promptConfigResult = await query(
      `SELECT * FROM prompt_config WHERE config_type = $1 LIMIT 1`,
      ['prompts']
    );
    const promptConfig = promptConfigResult.rows[0] || null;
    
    // Process config JSONB field
    if (promptConfig && promptConfig.config) {
      promptConfig.prompts = promptConfig.config.prompts;
    }

    // Check a few recent messages
    const messagesResult = await query(
      `SELECT id, model, role, text, created_at FROM messages 
       ORDER BY created_at DESC LIMIT 3`
    );
    
    const recentMessages = messagesResult.rows.map((row) => ({
      id: row.id,
      model: row.model,
      role: row.role,
      textPreview: row.text?.substring(0, 100) + '...',
      createdAt: row.created_at,
    }));

    return NextResponse.json({
      modelConfig: modelConfig || null,
      promptConfig: promptConfig || null,
      recentMessages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Debug API failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to load debug information.',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
