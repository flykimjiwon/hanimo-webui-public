import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getPostgresClient } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

async function checkTableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     )`,
    [tableName]
  );
  return result.rows[0].exists;
}

const TABLES = [
  {
    name: 'users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      department VARCHAR(255),
      cell VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'chat_rooms',
    sql: `CREATE TABLE IF NOT EXISTS chat_rooms (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255),
      message_count INTEGER DEFAULT 0,
      custom_instruction TEXT DEFAULT '',
      custom_instruction_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'chat_history',
    sql: `CREATE TABLE IF NOT EXISTS chat_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
      text TEXT,
      model VARCHAR(255),
      file_references JSONB,
      feedback VARCHAR(50),
      draw_mode BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'messages',
    sql: `CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
      user_role VARCHAR(50) DEFAULT 'user' CHECK (user_role IN ('user', 'admin')),
      model VARCHAR(255),
      text TEXT,
      room_id UUID,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      client_ip VARCHAR(45),
      feedback VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'chat_files',
    sql: `CREATE TABLE IF NOT EXISTS chat_files (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      file_name VARCHAR(255) NOT NULL,
      saved_file_name VARCHAR(255) NOT NULL,
      file_size BIGINT,
      mime_type VARCHAR(255),
      status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error', 'failed')),
      extracted_text TEXT,
      extraction_method VARCHAR(255),
      processed_at TIMESTAMP,
      pdf_metadata JSONB,
      ocr_results JSONB,
      ocr_summary TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'uploaded_files',
    sql: `CREATE TABLE IF NOT EXISTS uploaded_files (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      file_name VARCHAR(255) NOT NULL,
      saved_file_name VARCHAR(255) NOT NULL,
      file_size BIGINT,
      mime_type VARCHAR(255),
      status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'error')),
      extracted_text TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'settings',
    sql: `CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      config_type VARCHAR(50) DEFAULT 'general',
      multiturn_count INTEGER DEFAULT 10,
      tooltip_enabled BOOLEAN DEFAULT true,
      tooltip_message TEXT,
      chat_widget_enabled BOOLEAN DEFAULT false,
      site_title VARCHAR(255),
      site_description TEXT,
      favicon_url VARCHAR(255),
      file_parsing_model VARCHAR(255),
      file_parsing_enabled BOOLEAN DEFAULT true,
      room_name_generation_model VARCHAR(255),
      max_file_size BIGINT,
      max_files_per_room INTEGER,
      max_total_size_per_room BIGINT,
      supported_image_formats JSONB,
      supported_document_formats JSONB,
      ollama_endpoints TEXT,
      endpoint_type VARCHAR(50),
      custom_endpoints JSONB,
      openai_compat_base VARCHAR(255),
      openai_compat_api_key TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'admin_settings',
    sql: `CREATE TABLE IF NOT EXISTS admin_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      config_type VARCHAR(50) DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      settings JSONB
    )`,
  },
  {
    name: 'model_config',
    sql: `CREATE TABLE IF NOT EXISTS model_config (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      config_type VARCHAR(50) DEFAULT 'model',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      config JSONB
    )`,
  },
  {
    name: 'model_categories',
    sql: `CREATE TABLE IF NOT EXISTS model_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category_key VARCHAR(50) UNIQUE NOT NULL,
      label VARCHAR(255) NOT NULL,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'models',
    sql: `CREATE TABLE IF NOT EXISTS models (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category_id UUID REFERENCES model_categories(id) ON DELETE CASCADE,
      model_name VARCHAR(255) NOT NULL,
      label VARCHAR(255) NOT NULL,
      tooltip TEXT,
      is_default BOOLEAN DEFAULT false,
      admin_only BOOLEAN DEFAULT false,
      system_prompt TEXT[],
      endpoint VARCHAR(500),
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'prompt_config',
    sql: `CREATE TABLE IF NOT EXISTS prompt_config (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      config_type VARCHAR(50) DEFAULT 'prompt',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      config JSONB
    )`,
  },
  {
    name: 'model_logs',
    sql: `CREATE TABLE IF NOT EXISTS model_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      instance_id VARCHAR(255),
      instance_type VARCHAR(255),
      type VARCHAR(255),
      level VARCHAR(50),
      category VARCHAR(255),
      method VARCHAR(50),
      endpoint VARCHAR(255),
      model VARCHAR(255),
      message TEXT,
      error TEXT,
      metadata JSONB,
      provider VARCHAR(255),
      client_ip VARCHAR(45),
      user_agent TEXT,
      response_time INTEGER,
      status_code INTEGER,
      is_stream BOOLEAN,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      has_files BOOLEAN,
      file_count INTEGER,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'model_server',
    sql: `CREATE TABLE IF NOT EXISTS model_server (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      endpoint VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) UNIQUE NOT NULL,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB
    )`,
  },
  {
    name: 'model_server_error_history',
    sql: `CREATE TABLE IF NOT EXISTS model_server_error_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      endpoint_url VARCHAR(500) NOT NULL,
      endpoint_name VARCHAR(255),
      provider VARCHAR(50) NOT NULL,
      error_message TEXT NOT NULL,
      error_type VARCHAR(100),
      response_time INTEGER,
      status VARCHAR(50) DEFAULT 'unhealthy',
      checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB
    )`,
  },
  {
    name: 'model_server_status',
    sql: `CREATE TABLE IF NOT EXISTS model_server_status (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      instance_id VARCHAR(255) UNIQUE NOT NULL,
      instance_type VARCHAR(255),
      hostname VARCHAR(255),
      port INTEGER,
      pid INTEGER,
      node_version VARCHAR(50),
      environment VARCHAR(50),
      last_heartbeat TIMESTAMP,
      uptime BIGINT,
      memory_usage JSONB,
      cpu_usage JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'external_api_prompts',
    sql: `CREATE TABLE IF NOT EXISTS external_api_prompts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      prompt TEXT,
      messages JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'external_api_logs',
    sql: `CREATE TABLE IF NOT EXISTS external_api_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      api_type VARCHAR(50),
      endpoint VARCHAR(255),
      model VARCHAR(255),
      provider VARCHAR(255),
      prompt_id UUID REFERENCES external_api_prompts(id) ON DELETE SET NULL,
      prompt TEXT,
      messages JSONB,
      response_token_count INTEGER DEFAULT 0,
      prompt_token_count INTEGER DEFAULT 0,
      total_token_count INTEGER DEFAULT 0,
      response_time INTEGER,
      first_response_time INTEGER,
      final_response_time INTEGER,
      status_code INTEGER,
      is_stream BOOLEAN DEFAULT false,
      error TEXT,
      retry_count INTEGER DEFAULT 1,
      client_ip VARCHAR(45),
      user_agent TEXT,
      x_forwarded_for VARCHAR(255),
      x_real_ip VARCHAR(45),
      x_forwarded_proto VARCHAR(50),
      x_forwarded_host VARCHAR(255),
      client_tool VARCHAR(255),
      client_tool_version VARCHAR(255),
      operating_system VARCHAR(255),
      architecture VARCHAR(255),
      accept_language VARCHAR(255),
      accept_encoding VARCHAR(255),
      accept_charset VARCHAR(255),
      referer VARCHAR(255),
      origin VARCHAR(255),
      "authorization" TEXT,
      content_type VARCHAR(255),
      x_requested_with VARCHAR(255),
      x_client_name VARCHAR(255),
      x_client_version VARCHAR(255),
      x_user_name VARCHAR(255),
      x_workspace VARCHAR(255),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      token_hash VARCHAR(255),
      token_name VARCHAR(255),
      request_time TIMESTAMP,
      timezone VARCHAR(50),
      session_hash VARCHAR(50),
      fingerprint_hash VARCHAR(50),
      user_identifier VARCHAR(50),
      conversation_id VARCHAR(50),
      room_id UUID,
      request_headers JSONB,
      request_body JSONB,
      response_headers JSONB,
      response_body JSONB,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(50) DEFAULT 'external_api'
    )`,
  },
  {
    name: 'api_tokens',
    sql: `CREATE TABLE IF NOT EXISTS api_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      encrypted_token TEXT, -- Deprecated legacy field. New API tokens keep originals out of storage.
      name VARCHAR(255),
      expires_at TIMESTAMP,
      is_active BOOLEAN DEFAULT true,
      last_used_at TIMESTAMP,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'notices',
    sql: `CREATE TABLE IF NOT EXISTS notices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      content TEXT,
      is_popup BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      author_id UUID REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'user_chats',
    sql: `CREATE TABLE IF NOT EXISTS user_chats (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'qa_logs',
    sql: `CREATE TABLE IF NOT EXISTS qa_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      log_data JSONB
    )`,
  },
  {
    name: 'rag_documents',
    sql: `CREATE TABLE IF NOT EXISTS rag_documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      file_size BIGINT NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL CHECK (category IN ('text', 'pdf', 'word', 'excel', 'powerpoint', 'image', 'other')),
      subcategory VARCHAR(255),
      tags TEXT[],
      status VARCHAR(50) DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'indexed', 'vectorizing', 'vectorized', 'error')),
      error_message TEXT,
      extracted_text TEXT,
      chunk_count INTEGER DEFAULT 0,
      embedding_model VARCHAR(255),
      description TEXT,
      priority VARCHAR(50) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
      uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'rag_models',
    sql: `CREATE TABLE IF NOT EXISTS rag_models (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      base_model VARCHAR(255) NOT NULL,
      embedding_model VARCHAR(255) NOT NULL,
      rag_settings JSONB,
      generation_params JSONB,
      selected_documents UUID[],
      document_filters JSONB,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
      is_default BOOLEAN DEFAULT false,
      usage_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMP,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL
    )`,
  },
  {
    name: 'rag_settings',
    sql: `CREATE TABLE IF NOT EXISTS rag_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chunk_size INTEGER DEFAULT 1024,
      chunk_overlap INTEGER DEFAULT 20,
      embedding_model VARCHAR(255) NOT NULL DEFAULT 'nomic-embed-text',
      embedding_dimensions INTEGER DEFAULT 768,
      similarity_top_k INTEGER DEFAULT 3,
      similarity_threshold DECIMAL(3,2) DEFAULT 0.7,
      vector_db_path VARCHAR(255) DEFAULT './data/lancedb',
      table_name VARCHAR(255) DEFAULT 'documents',
      response_mode VARCHAR(50) DEFAULT 'compact',
      max_tokens INTEGER DEFAULT 2048,
      temperature DECIMAL(3,2) DEFAULT 0.7,
      system_prompt TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL
    )`,
  },
  {
    name: 'direct_messages',
    sql: `CREATE TABLE IF NOT EXISTS direct_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      deleted_by_recipient BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'agent_permissions',
    sql: `CREATE TABLE IF NOT EXISTS agent_permissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id VARCHAR(50) NOT NULL,
      permission_type VARCHAR(50) NOT NULL CHECK (permission_type IN ('all', 'role', 'department', 'user')),
      permission_value VARCHAR(255),
      is_allowed BOOLEAN DEFAULT true,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(agent_id, permission_type, permission_value)
    )`,
  },
  {
    name: 'agent_settings',
    sql: `CREATE TABLE IF NOT EXISTS agent_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      agent_id VARCHAR(50) NOT NULL UNIQUE,
      selected_model_id VARCHAR(255),
      default_slide_count INTEGER DEFAULT 8,
      default_theme VARCHAR(20) DEFAULT 'light',
      default_tone VARCHAR(20) DEFAULT 'business',
      allow_user_model_override BOOLEAN DEFAULT false,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'user_change_logs',
    sql: `CREATE TABLE IF NOT EXISTS user_change_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      employee_no VARCHAR(20),
      field_name VARCHAR(50) NOT NULL,
      old_value TEXT,
      new_value TEXT,
      change_type VARCHAR(20) DEFAULT 'update',
      change_source VARCHAR(20) DEFAULT 'sso',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'app_error_logs',
    sql: `CREATE TABLE IF NOT EXISTS app_error_logs (
      id BIGSERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      level VARCHAR(10) NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context JSONB,
      user_id UUID,
      user_email TEXT,
      request_path TEXT,
      method TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'board_posts',
    sql: `CREATE TABLE IF NOT EXISTS board_posts (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      is_notice BOOLEAN DEFAULT false,
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'board_comments',
    sql: `CREATE TABLE IF NOT EXISTS board_comments (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'sso_login_logs',
    sql: `CREATE TABLE IF NOT EXISTS sso_login_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      employee_no VARCHAR(20),
      sso_user_id VARCHAR(50),
      auth_type VARCHAR(20),
      auth_result VARCHAR(20),
      auth_result_message TEXT,
      auth_event_id VARCHAR(50),
      client_ip VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
  'CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id ON chat_rooms(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_chat_history_room_id ON chat_history(room_id)',
  'CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_chat_files_room_id ON chat_files(room_id)',
  'CREATE INDEX IF NOT EXISTS idx_external_api_logs_timestamp ON external_api_logs(timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_external_api_logs_user_id ON external_api_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash)',
  'CREATE INDEX IF NOT EXISTS idx_notices_is_active ON notices(is_active)',
  'CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status)',
  'CREATE INDEX IF NOT EXISTS idx_rag_documents_uploaded_by ON rag_documents(uploaded_by)',
  'CREATE INDEX IF NOT EXISTS idx_rag_models_status ON rag_models(status)',
  'CREATE INDEX IF NOT EXISTS idx_model_logs_user_id ON model_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_models_category_id ON models(category_id)',
  'CREATE INDEX IF NOT EXISTS idx_models_is_default ON models(is_default)',
  'CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id)',
  'CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, is_read)',
  'CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent_id ON agent_permissions(agent_id)',
  'CREATE INDEX IF NOT EXISTS idx_agent_settings_agent_id ON agent_settings(agent_id)',
  'CREATE INDEX IF NOT EXISTS idx_agent_settings_selected_model ON agent_settings(selected_model_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_change_logs_user_id ON user_change_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_user_change_logs_created_at ON user_change_logs(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at ON app_error_logs(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_app_error_logs_level ON app_error_logs(level)',
  'CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON board_posts(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_board_comments_post_id ON board_comments(post_id)',
];

export async function POST(request) {
  const adminCheck = verifyAdminWithResult(request);
  if (!adminCheck.valid) return createAuthError(adminCheck.error);

  const client = await getPostgresClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: 'DB connection failed' },
      { status: 500 }
    );
  }

  const created = [];
  const skipped = [];
  const failed = [];

  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    for (const table of TABLES) {
      const exists = await checkTableExists(client, table.name);
      if (exists) {
        skipped.push(table.name);
        continue;
      }
      try {
        await client.query(table.sql);
        created.push(table.name);
      } catch (err) {
        failed.push({ name: table.name, error: err.message });
        throw err;
      }
    }

    for (const idx of INDEXES) {
      await client.query(idx);
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: `Complete: ${created.length} created, ${skipped.length} already exist`,
      created,
      skipped,
      failed,
      total: TABLES.length,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) { logger.error('[init-schema] ROLLBACK failed:', rollbackErr.message); }
    logger.error('[init-schema] Failed:', error.message);
    return createServerError(error, 'Schema initialization failed');
  } finally {
    client.release();
  }
}
