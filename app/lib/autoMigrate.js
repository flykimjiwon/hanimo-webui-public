import logger from '@/lib/logger';
/**
 * Auto-migration utility (2026-02-27)
 *
 * Automatically called on admin-role login.
 * Integrates init-schema (table creation) + migrate-models (column addition) logic.
 * All queries use IF NOT EXISTS / nullable handling, ensuring idempotency.
 */

import { query, getPostgresClient } from '@/lib/postgres';
import { withSchemaMigrationLock } from '@/lib/schema-migration-lock.mjs';

// ─────────────────────────────────────────────
// 1. Create initial schema (tables)
// ─────────────────────────────────────────────

const CORE_TABLES = [
  {
    name: 'users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255),
      name VARCHAR(255),
      department VARCHAR(255),
      cell VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'manager')),
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
      draw_enabled BOOLEAN DEFAULT false,
      draw_system_prompt TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      multi_turn_limit INTEGER,
      multi_turn_unlimited BOOLEAN DEFAULT false,
      display_order INTEGER DEFAULT 0,
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
      status_code INTEGER,
      is_stream BOOLEAN DEFAULT false,
      error TEXT,
      client_ip VARCHAR(45),
      user_agent TEXT,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
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
      views INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      is_visible BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'user_settings',
    sql: `CREATE TABLE IF NOT EXISTS user_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      default_model_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'refresh_tokens',
    sql: `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          BIGSERIAL PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  VARCHAR(64) NOT NULL UNIQUE,
      expires_at  TIMESTAMP NOT NULL,
      revoked     BOOLEAN DEFAULT FALSE,
      revoked_at  TIMESTAMP,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address  VARCHAR(45),
      user_agent  TEXT
    )`,
  },
  {
    name: 'agent_history',
    sql: `CREATE TABLE IF NOT EXISTS agent_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id VARCHAR(50) NOT NULL,
      entry_id VARCHAR(100) NOT NULL,
      title VARCHAR(500),
      input_data JSONB,
      output_data JSONB,
      output_text TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, agent_id, entry_id)
    )`,
  },
  {
    name: 'user_memories',
    sql: `CREATE TABLE IF NOT EXISTS user_memories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      memory TEXT DEFAULT '',
      last_indexed_id UUID,
      indexed_count INTEGER DEFAULT 0,
      is_indexing BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'memory_settings',
    sql: `CREATE TABLE IF NOT EXISTS memory_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      model_id VARCHAR(255) DEFAULT '',
      interval_minutes INTEGER DEFAULT 60,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'workflows',
    sql: `CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      definition JSONB DEFAULT '{}'::jsonb,
      input_schema JSONB DEFAULT '{}'::jsonb,
      output_schema JSONB DEFAULT '{}'::jsonb,
      version INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'draft',
      is_published BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'workflow_endpoints',
    sql: `CREATE TABLE IF NOT EXISTS workflow_endpoints (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
      name VARCHAR(255),
      endpoint_url TEXT,
      api_key_encrypted TEXT,
      provider_type VARCHAR(50),
      model_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'workflow_executions',
    sql: `CREATE TABLE IF NOT EXISTS workflow_executions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      inputs JSONB DEFAULT '{}'::jsonb,
      outputs JSONB,
      node_states JSONB,
      status VARCHAR(20) DEFAULT 'running',
      source VARCHAR(20) DEFAULT 'manual',
      total_tokens INTEGER,
      execution_time INTEGER,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    )`,
  },
  {
    name: 'screens',
    sql: `CREATE TABLE IF NOT EXISTS screens (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      definition JSONB DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      share_id TEXT UNIQUE,
      access_type TEXT DEFAULT 'authenticated',
      access_password_hash TEXT,
      allowed_users TEXT[],
      view_count INTEGER DEFAULT 0,
      last_accessed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: 'screen_access_logs',
    sql: `CREATE TABLE IF NOT EXISTS screen_access_logs (
      id BIGSERIAL PRIMARY KEY,
      screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
      user_id TEXT,
      client_ip VARCHAR(255),
      action VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
  },
];

const CORE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id ON chat_rooms(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_history_room_id ON chat_history(room_id)`,
  `CREATE INDEX IF NOT EXISTS idx_external_api_logs_timestamp ON external_api_logs(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_external_api_logs_user_id ON external_api_logs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_notices_is_active ON notices(is_active)`,
  `CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON board_posts(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_board_comments_post_id ON board_comments(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, is_read)`,
  `CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent_id ON agent_permissions(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_settings_agent_id ON agent_settings(agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_change_logs_user_id ON user_change_logs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_change_logs_created_at ON user_change_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at ON app_error_logs(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_agent_history_user_agent ON agent_history(user_id, agent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_screens_user_id ON screens(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_screens_share_id ON screens(share_id)`,
  `CREATE INDEX IF NOT EXISTS idx_screen_access_logs_screen_id ON screen_access_logs(screen_id)`,
  // messages 테이블 인덱스: init-schema에만 있고 자동마이그레이션 경로(로그인 트리거)엔 누락되어
  // 기본 배포 시 채팅 위젯/히스토리/통계 쿼리(room_id + created_at)가 풀스캔되던 문제 보완.
  `CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)`,
];

// ─────────────────────────────────────────────
// 2. Column migration (add to existing tables)
// ─────────────────────────────────────────────

async function runColumnMigrations(client) {
  const execute = (...args) => client.query(...args);
  // chat_rooms table — custom_instruction 컬럼이 누락된 기존 DB 보완
  await execute(`
    ALTER TABLE chat_rooms
    ADD COLUMN IF NOT EXISTS custom_instruction TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS custom_instruction_active BOOLEAN DEFAULT false
  `);

  await execute(`
    ALTER TABLE models
    ADD COLUMN IF NOT EXISTS category_id UUID,
    ADD COLUMN IF NOT EXISTS multi_turn_limit INTEGER,
    ADD COLUMN IF NOT EXISTS multi_turn_unlimited BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS api_config JSONB,
    ADD COLUMN IF NOT EXISTS api_key TEXT,
    ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true
  `);

  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'models_category_id_fkey'
        AND table_name = 'models'
      ) THEN
        ALTER TABLE models
        ADD CONSTRAINT models_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES model_categories(id) ON DELETE CASCADE;
      END IF;
    END $$
  `).catch(() => {});

  // settings table
  await execute(`
    ALTER TABLE settings
    ADD COLUMN IF NOT EXISTS max_images_per_message INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS max_user_question_length INTEGER DEFAULT 300000,
    ADD COLUMN IF NOT EXISTS image_analysis_model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS image_analysis_prompt VARCHAR(500),
    ADD COLUMN IF NOT EXISTS chat_widget_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS profile_edit_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS board_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS support_contacts JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS support_contacts_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS manual_preset_base_url VARCHAR(500) DEFAULT 'https://api.openai.com',
    ADD COLUMN IF NOT EXISTS manual_preset_api_base VARCHAR(500) DEFAULT 'https://api.openai.com',
    ADD COLUMN IF NOT EXISTS login_type VARCHAR(20) DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS ollama_endpoints TEXT,
    ADD COLUMN IF NOT EXISTS endpoint_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS custom_endpoints JSONB,
    ADD COLUMN IF NOT EXISTS openai_compat_base VARCHAR(255),
    ADD COLUMN IF NOT EXISTS openai_compat_api_key TEXT,
    ADD COLUMN IF NOT EXISTS file_parsing_model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS file_parsing_enabled BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS room_name_generation_model VARCHAR(255),
    ADD COLUMN IF NOT EXISTS max_file_size BIGINT,
    ADD COLUMN IF NOT EXISTS max_files_per_room INTEGER,
    ADD COLUMN IF NOT EXISTS max_total_size_per_room BIGINT,
    ADD COLUMN IF NOT EXISTS supported_image_formats JSONB,
    ADD COLUMN IF NOT EXISTS supported_document_formats JSONB,
    ADD COLUMN IF NOT EXISTS api_config_example TEXT,
    ADD COLUMN IF NOT EXISTS api_curl_example TEXT
  `);

  // external_api_logs table
  await execute(`
    ALTER TABLE external_api_logs
    ADD COLUMN IF NOT EXISTS first_response_time INTEGER,
    ADD COLUMN IF NOT EXISTS final_response_time INTEGER,
    ADD COLUMN IF NOT EXISTS client_tool VARCHAR(255),
    ADD COLUMN IF NOT EXISTS client_tool_version VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_forwarded_for VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_real_ip VARCHAR(45),
    ADD COLUMN IF NOT EXISTS x_forwarded_proto VARCHAR(50),
    ADD COLUMN IF NOT EXISTS x_forwarded_host VARCHAR(255),
    ADD COLUMN IF NOT EXISTS operating_system VARCHAR(255),
    ADD COLUMN IF NOT EXISTS architecture VARCHAR(255),
    ADD COLUMN IF NOT EXISTS accept_language VARCHAR(255),
    ADD COLUMN IF NOT EXISTS accept_encoding VARCHAR(255),
    ADD COLUMN IF NOT EXISTS accept_charset VARCHAR(255),
    ADD COLUMN IF NOT EXISTS referer VARCHAR(255),
    ADD COLUMN IF NOT EXISTS origin VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "authorization" TEXT,
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_requested_with VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_client_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_client_version VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_user_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS x_workspace VARCHAR(255),
    ADD COLUMN IF NOT EXISTS token_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS token_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS request_time TIMESTAMP,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS session_hash VARCHAR(50),
    ADD COLUMN IF NOT EXISTS fingerprint_hash VARCHAR(50),
    ADD COLUMN IF NOT EXISTS user_identifier VARCHAR(50),
    ADD COLUMN IF NOT EXISTS room_id UUID,
    ADD COLUMN IF NOT EXISTS request_headers JSONB,
    ADD COLUMN IF NOT EXISTS request_body JSONB,
    ADD COLUMN IF NOT EXISTS response_headers JSONB,
     ADD COLUMN IF NOT EXISTS response_body JSONB,
     ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 1,
     ADD COLUMN IF NOT EXISTS prompt_id UUID,
     ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(50),
     ADD COLUMN IF NOT EXISTS prompt TEXT,
     ADD COLUMN IF NOT EXISTS messages JSONB
   `);

  // users table: SSO fields + security enhancement fields
  await execute(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employee_no VARCHAR(20),
    ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS sso_user_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS company_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS company_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS company_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS department_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS department_no VARCHAR(20),
    ADD COLUMN IF NOT EXISTS department_location TEXT,
    ADD COLUMN IF NOT EXISTS employee_position_name VARCHAR(50),
    ADD COLUMN IF NOT EXISTS employee_class VARCHAR(20),
    ADD COLUMN IF NOT EXISTS employee_security_level INTEGER,
    ADD COLUMN IF NOT EXISTS lang VARCHAR(10) DEFAULT 'ko',
    ADD COLUMN IF NOT EXISTS login_deny_yn VARCHAR(5) DEFAULT 'N',
    ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS auth_result VARCHAR(20),
    ADD COLUMN IF NOT EXISTS auth_result_message TEXT,
    ADD COLUMN IF NOT EXISTS auth_event_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS sso_result_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS sso_response_datetime TIMESTAMP,
    ADD COLUMN IF NOT EXISTS sso_transaction_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP
  `);

  // users.password_hash nullable
  await execute(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`).catch(() => {});

  // notices/board_posts views column
  await execute(`ALTER TABLE notices ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0`).catch(() => {});
  await execute(`ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0`).catch(() => {});

   // Indexes
   await execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_no ON users(employee_no) WHERE employee_no IS NOT NULL`).catch(() => {});
   await execute(`CREATE INDEX IF NOT EXISTS idx_models_endpoint ON models(endpoint)`).catch(() => {});

  // agent_settings: visibility and display order
  await execute(`
    ALTER TABLE agent_settings
    ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0
  `).catch(() => {});

  // user_settings: custom instructions (multi-prompt)
  await execute(`
    ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS custom_instructions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ci_global_enabled BOOLEAN DEFAULT true
  `).catch(() => {});

  // memory_settings: seed default row
  await execute('INSERT INTO memory_settings (id) VALUES (1) ON CONFLICT DO NOTHING').catch(() => {});

  // users.role CHECK constraint update (add manager role)
  try {
    await execute(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await execute(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'manager'))`);
    logger.info('[AutoMigrate] ✓ users_role_check constraint updated');
  } catch (e) {
    logger.warn('[AutoMigrate] users_role_check update failed:', e.message);
  }

   // messages.user_role CHECK constraint update (add manager role)
   try {
     await execute(`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_user_role_check`);
     await execute(`ALTER TABLE messages ADD CONSTRAINT messages_user_role_check CHECK (user_role IN ('user', 'admin', 'manager'))`);
     logger.info('[AutoMigrate] ✓ messages_user_role_check constraint updated');
   } catch (e) {
     logger.warn('[AutoMigrate] messages_user_role_check update failed:', e.message);
   }

  // messages: soft-delete columns
  await execute(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by UUID
  `).catch(() => {});

  await execute(`
    ALTER TABLE chat_history
    ADD COLUMN IF NOT EXISTS draw_mode BOOLEAN DEFAULT false
  `).catch(() => {});

  await execute(`ALTER TABLE screens ALTER COLUMN user_id TYPE TEXT USING user_id::text`).catch(() => {});
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────

export async function runAutoMigration() {
  const client = await getPostgresClient();
  if (!client) {
    logger.warn('[AutoMigrate] DB connection failed - skipping');
    return;
  }

  try {
    logger.info('[AutoMigrate] Starting...');
    await withSchemaMigrationLock(client, async () => {
      try {
        await client.query('BEGIN');
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
          for (const table of CORE_TABLES) {
            await client.query(table.sql);
          }
          for (const idx of CORE_INDEXES) {
            await client.query(idx).catch(() => {});
          }
          await client.query('COMMIT');
          logger.info('[AutoMigrate] ✓ Table/index creation completed');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        }
      } catch (err) {
        logger.warn('[AutoMigrate] Error during table creation (partially ignored):', err.message);
      }

      try {
        await runColumnMigrations(client);
        logger.info('[AutoMigrate] ✓ Column migration completed');
      } catch (err) {
        logger.warn('[AutoMigrate] Error during column migration (partially ignored):', err.message);
      }
    });
  } catch (err) {
    logger.warn('[AutoMigrate] Schema lock failed:', err.message);
  } finally {
    client.release();
  }

  logger.info('[AutoMigrate] Completed');
}
