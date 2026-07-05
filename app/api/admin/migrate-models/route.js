import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyAdminWithResult } from '@/lib/auth';

const REQUIRED_MODEL_COLUMNS = [
  { name: 'api_config', type: 'jsonb' },
  { name: 'api_key', type: 'text' },
  { name: 'visible', type: 'boolean' },
];

// Additional users table columns for SSO integration
const REQUIRED_USER_COLUMNS = [
  { name: 'employee_no', type: 'varchar' },           // Employee number (UNIQUE)
  { name: 'employee_id', type: 'varchar' },           // Employee ID
  { name: 'sso_user_id', type: 'varchar' },           // SSO userId
  { name: 'company_code', type: 'varchar' },          // Group company code
  { name: 'company_name', type: 'varchar' },          // Group company name
  { name: 'company_id', type: 'varchar' },            // Group company ID
  { name: 'department_id', type: 'varchar' },         // Department ID
  { name: 'department_no', type: 'varchar' },         // Department number
  { name: 'department_location', type: 'text' },      // Department location path
  { name: 'employee_position_name', type: 'varchar' },// Position
  { name: 'employee_class', type: 'varchar' },        // Employee type
  { name: 'employee_security_level', type: 'integer' },// Security level
  { name: 'lang', type: 'varchar' },                  // Language
  { name: 'login_deny_yn', type: 'varchar' },         // Login denied flag
  { name: 'auth_type', type: 'varchar' },             // Auth type ('local' | 'sso')
  { name: 'auth_result', type: 'varchar' },           // Auth result (SUCCESS, etc.)
  { name: 'auth_result_message', type: 'text' },      // Auth result message
  { name: 'auth_event_id', type: 'varchar' },         // Auth event ID
  // SSO common fields
  { name: 'sso_result_code', type: 'varchar' },       // common.resultCode (200, etc.)
  { name: 'sso_response_datetime', type: 'timestamp' }, // common.responseDatetime
  { name: 'sso_response_datetime', type: 'timestamp' }, // common.responseDatetime
  { name: 'sso_transaction_id', type: 'varchar' },    // common.transactionId
  // Authentication security enhancement (2026-02-27)
  { name: 'last_active_at', type: 'timestamp' },      // Last actual activity timestamp
];
const REQUIRED_SETTINGS_COLUMNS = [
  { name: 'max_images_per_message', type: 'integer' },
  { name: 'max_user_question_length', type: 'integer' },
  { name: 'image_analysis_model', type: 'varchar' },
  { name: 'image_analysis_prompt', type: 'varchar' },
  { name: 'chat_widget_enabled', type: 'boolean' },
  { name: 'profile_edit_enabled', type: 'boolean' },
  { name: 'manual_preset_base_url', type: 'varchar' },
  { name: 'manual_preset_api_base', type: 'varchar' },
  { name: 'board_enabled', type: 'boolean' },
  { name: 'support_contacts', type: 'jsonb' },
  { name: 'support_contacts_enabled', type: 'boolean' },
  { name: 'login_type', type: 'varchar' },  // 'local' | 'sso' - default login method
];
const REQUIRED_EXTERNAL_API_LOGS_COLUMNS = [
  { name: 'first_response_time', type: 'integer' },
  { name: 'final_response_time', type: 'integer' },
  { name: 'client_tool', type: 'varchar' },
  { name: 'client_tool_version', type: 'varchar' },
  { name: 'x_forwarded_for', type: 'varchar' },
  { name: 'x_real_ip', type: 'varchar' },
  { name: 'x_forwarded_proto', type: 'varchar' },
  { name: 'x_forwarded_host', type: 'varchar' },
  { name: 'operating_system', type: 'varchar' },
  { name: 'architecture', type: 'varchar' },
  { name: 'accept_language', type: 'varchar' },
  { name: 'accept_encoding', type: 'varchar' },
  { name: 'accept_charset', type: 'varchar' },
  { name: 'referer', type: 'varchar' },
  { name: 'origin', type: 'varchar' },
  { name: 'authorization', type: 'text' },
  { name: 'content_type', type: 'varchar' },
  { name: 'x_requested_with', type: 'varchar' },
  { name: 'x_client_name', type: 'varchar' },
  { name: 'x_client_version', type: 'varchar' },
  { name: 'x_user_name', type: 'varchar' },
  { name: 'x_workspace', type: 'varchar' },
  { name: 'token_hash', type: 'varchar' },
  { name: 'token_name', type: 'varchar' },
  { name: 'request_time', type: 'timestamp' },
  { name: 'timezone', type: 'varchar' },
  { name: 'session_hash', type: 'varchar' },
  { name: 'fingerprint_hash', type: 'varchar' },
  { name: 'user_identifier', type: 'varchar' },
  { name: 'room_id', type: 'uuid' },
  { name: 'request_headers', type: 'jsonb' },
  { name: 'request_body', type: 'jsonb' },
  { name: 'response_headers', type: 'jsonb' },
  { name: 'response_body', type: 'jsonb' },
  { name: 'retry_count', type: 'integer' },
  { name: 'prompt_id', type: 'uuid' },
  { name: 'conversation_id', type: 'varchar' },
  { name: 'prompt', type: 'text' },
  { name: 'messages', type: 'jsonb' },
];
const REQUIRED_TABLES = [
  {
    name: 'user_change_logs',
    create: `
      CREATE TABLE IF NOT EXISTS user_change_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        employee_no VARCHAR(20),
        field_name VARCHAR(50) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_type VARCHAR(20) DEFAULT 'update',
        change_source VARCHAR(20) DEFAULT 'sso',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_user_change_logs_user_id ON user_change_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_change_logs_employee_no ON user_change_logs(employee_no)`,
      `CREATE INDEX IF NOT EXISTS idx_user_change_logs_created_at ON user_change_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_user_change_logs_field_name ON user_change_logs(field_name)`,
    ],
  },
  {
    name: 'app_error_logs',
    create: `
      CREATE TABLE IF NOT EXISTS app_error_logs (
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
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_app_error_logs_created_at ON app_error_logs(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_app_error_logs_source ON app_error_logs(source)`,
      `CREATE INDEX IF NOT EXISTS idx_app_error_logs_level ON app_error_logs(level)`,
    ],
  },
  {
    name: 'board_posts',
    create: `
      CREATE TABLE IF NOT EXISTS board_posts (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        is_notice BOOLEAN DEFAULT false,
        views INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_board_posts_created_at ON board_posts(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_board_posts_is_notice ON board_posts(is_notice)`,
      `CREATE INDEX IF NOT EXISTS idx_board_posts_user_id ON board_posts(user_id)`,
    ],
  },
  {
    name: 'board_comments',
    create: `
      CREATE TABLE IF NOT EXISTS board_comments (
        id BIGSERIAL PRIMARY KEY,
        post_id BIGINT NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_board_comments_post_id ON board_comments(post_id)`,
      `CREATE INDEX IF NOT EXISTS idx_board_comments_created_at ON board_comments(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_board_comments_user_id ON board_comments(user_id)`,
    ],
  },
  {
    name: 'direct_messages',
    create: `
      CREATE TABLE IF NOT EXISTS direct_messages (
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
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, is_read)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_dm_deleted ON direct_messages(recipient_id, deleted_by_recipient)`,
    ],
  },
  {
    name: 'agent_permissions',
    create: `
      CREATE TABLE IF NOT EXISTS agent_permissions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_id VARCHAR(50) NOT NULL,
        permission_type VARCHAR(50) NOT NULL CHECK (permission_type IN ('all', 'role', 'department', 'user')),
        permission_value VARCHAR(255),
        is_allowed BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, permission_type, permission_value)
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent_id ON agent_permissions(agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_permissions_type ON agent_permissions(permission_type)`,
    ],
  },
  {
    name: 'agent_settings',
    create: `
      CREATE TABLE IF NOT EXISTS agent_settings (
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
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_agent_settings_agent_id ON agent_settings(agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_settings_selected_model ON agent_settings(selected_model_id)`,
    ],
  },
  {
    name: 'chat_rooms',
    create: `
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        message_count INTEGER DEFAULT 0,
        custom_instruction TEXT DEFAULT '',
        custom_instruction_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    ensureColumns: [
      `ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS custom_instruction TEXT DEFAULT ''`,
      `ALTER TABLE chat_rooms ADD COLUMN IF NOT EXISTS custom_instruction_active BOOLEAN DEFAULT false`,
    ],
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id ON chat_rooms(user_id)`,
    ],
  },
  {
    name: 'refresh_tokens',
    create: `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          BIGSERIAL PRIMARY KEY,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash  VARCHAR(64) NOT NULL UNIQUE,
        expires_at  TIMESTAMP NOT NULL,
        revoked     BOOLEAN DEFAULT FALSE,
        revoked_at  TIMESTAMP,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address  VARCHAR(45),
        user_agent  TEXT
      )
    `,
    indexes: [
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`,
    ],
  },
];

async function getModelColumns() {
  const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'models'
      ORDER BY ordinal_position
    `);
  return result.rows;
}

async function getSettingsColumns() {
  const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'settings'
      ORDER BY ordinal_position
    `);
  return result.rows;
}

async function getUsersColumns() {
  const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
  return result.rows;
}

async function getExternalApiLogsColumns() {
  const result = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'external_api_logs'
      ORDER BY ordinal_position
    `);
  return result.rows;
}

async function getSchemaStatus() {
  const columns = await getModelColumns();
  const existing = new Set(columns.map((c) => c.column_name));
  const missing = REQUIRED_MODEL_COLUMNS.filter(
    (col) => !existing.has(col.name)
  );

  const settingsColumns = await getSettingsColumns();
  const existingSettings = new Set(settingsColumns.map((c) => c.column_name));
  const missingSettings = REQUIRED_SETTINGS_COLUMNS.filter(
    (col) => !existingSettings.has(col.name)
  );

  const usersColumns = await getUsersColumns();
  const existingUsers = new Set(usersColumns.map((c) => c.column_name));
  const missingUsers = REQUIRED_USER_COLUMNS.filter(
    (col) => !existingUsers.has(col.name)
  );

  const externalApiLogsColumns = await getExternalApiLogsColumns();
  const existingExternalApiLogs = new Set(
    externalApiLogsColumns.map((c) => c.column_name)
  );
  const missingExternalApiLogs = REQUIRED_EXTERNAL_API_LOGS_COLUMNS.filter(
    (col) => !existingExternalApiLogs.has(col.name)
  );

  const tableChecks = await query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'`
  );
  const existingTables = new Set(tableChecks.rows.map((row) => row.table_name));
  const missingTables = REQUIRED_TABLES.filter(
    (table) => !existingTables.has(table.name)
  );

  return {
    columns,
    missing,
    settingsColumns,
    missingSettings,
    usersColumns,
    missingUsers,
    externalApiLogsColumns,
    missingExternalApiLogs,
    missingTables: missingTables.map((table) => table.name),
    isUpToDate:
      missing.length === 0 &&
      missingSettings.length === 0 &&
      missingUsers.length === 0 &&
      missingExternalApiLogs.length === 0,
  };
}

export async function GET(request) {
  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const status = await getSchemaStatus();
    const upToDate =
      status.missing.length === 0 &&
      status.missingSettings.length === 0 &&
      status.missingUsers.length === 0 &&
      status.missingExternalApiLogs.length === 0 &&
      (status.missingTables?.length || 0) === 0;

    return NextResponse.json({
      success: true,
      message: upToDate
        ? 'Schema is up to date.'
        : 'Schema adjustment is required.',
      ...status,
      isUpToDate: upToDate,
    });
  } catch (error) {
    logger.error('[Migration] Failed to fetch status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    logger.info('[Migration] Starting database migration...');

    // models table: add api_config, api_key, visible
    await query(`
      ALTER TABLE models
      ADD COLUMN IF NOT EXISTS api_config JSONB,
      ADD COLUMN IF NOT EXISTS api_key TEXT,
      ADD COLUMN IF NOT EXISTS visible BOOLEAN DEFAULT true
    `);
    logger.info('[Migration] ✓ Added models table columns');

    // settings table: add image/widget setting columns
    await query(`
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
    logger.info('[Migration] ✓ Added settings table columns');

    await query(`
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
    logger.info('[Migration] ✓ Added external_api_logs table columns');

    // users table: add columns for SSO integration
    await query(`
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
      ADD COLUMN IF NOT EXISTS sso_transaction_id VARCHAR(50)
    `);
    // users table: add security enhancement column (2026-02-27)
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP
    `);
    logger.info('[Migration] ✓ Added users.last_active_at column');
    logger.info('[Migration] ✓ Added users table SSO columns');

    // messages table: add soft-delete columns
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deleted_by UUID
    `);
    logger.info('[Migration] ✓ Added messages soft-delete columns');

    // model_logs table: add user_id column (for web chat token aggregation)
    try {
      await query(`
        ALTER TABLE model_logs
        ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL
      `);
      logger.info('[Migration] ✓ Added model_logs.user_id column');
    } catch (e) {
      logger.warn('[Migration] ⚠ model_logs ALTER failed (table may not exist):', e.message);
    }

    // Add view count columns to notices and board_posts
    await query(`
      ALTER TABLE notices
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0
    `);
    await query(`
      ALTER TABLE board_posts
      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0
    `);
    logger.info('[Migration] ✓ Added notices/board_posts views columns');

    await query(`
      UPDATE notices SET views = 0 WHERE views IS NULL
    `);
    await query(`
      UPDATE board_posts SET views = 0 WHERE views IS NULL
    `);
    logger.info('[Migration] ✓ Backfilled default values for notices/board_posts views');

    // Initialize personal-information columns (remove existing data)
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'profile_image_url'
        ) THEN
          EXECUTE 'UPDATE users SET profile_image_url = NULL';
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'personal_email'
        ) THEN
          EXECUTE 'UPDATE users SET personal_email = NULL';
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'birth_day'
        ) THEN
          EXECUTE 'UPDATE users SET birth_day = NULL';
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'phone_number'
        ) THEN
          EXECUTE 'UPDATE users SET phone_number = NULL';
        END IF;
      END $$;
    `);
    logger.info('[Migration] ✓ Cleared data in users personal-information columns');

    // Make password_hash nullable (SSO users have no password)
    await query(`
      ALTER TABLE users
      ALTER COLUMN password_hash DROP NOT NULL
    `).catch((err) => {
      // Ignore if already nullable
      if (!err.message.includes('not exist')) {
        logger.info('[Migration] password_hash is already nullable');
      }
    });
    logger.info('[Migration] ✓ Changed users.password_hash to nullable');

    // Add UNIQUE index on employee_no
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_no ON users(employee_no)
      WHERE employee_no IS NOT NULL
    `);
    logger.info('[Migration] ✓ Added UNIQUE index on users.employee_no');

    // Add index
    await query(`
      CREATE INDEX IF NOT EXISTS idx_models_endpoint ON models(endpoint)
    `);
    logger.info('[Migration] ✓ Added index');

    try {
      await query(`
        CREATE INDEX IF NOT EXISTS idx_model_logs_user_id ON model_logs(user_id)
      `);
    } catch (e) {
      logger.warn('[Migration] ⚠ model_logs index creation failed (table may not exist):', e.message);
    }

    // Adjust error log-related tables
    for (const table of REQUIRED_TABLES) {
      try {
        await query(table.create);
        for (const col of table.ensureColumns || []) {
          await query(col).catch(() => {});
        }
        for (const indexQuery of table.indexes || []) {
          await query(indexQuery).catch((err) => {
            logger.warn(`[Migration] ⚠ ${table.name} index failed:`, err.message);
          });
        }
        logger.info(`[Migration] ✓ Adjusted ${table.name} table`);
      } catch (tableErr) {
        logger.warn(`[Migration] ⚠ ${table.name} table creation failed:`, tableErr.message);
      }
    }

    // Check results
    const status = await getSchemaStatus();

    logger.info('[Migration] Current models table columns:');
    status.columns.forEach((r) =>
      logger.info(`  - ${r.column_name}: ${r.data_type}`)
    );

    logger.info('[Migration] Current settings table columns:');
    status.settingsColumns.forEach((r) =>
      logger.info(`  - ${r.column_name}: ${r.data_type}`)
    );

    logger.info('[Migration] Current users table columns:');
    status.usersColumns.forEach((r) =>
      logger.info(`  - ${r.column_name}: ${r.data_type}`)
    );

    return NextResponse.json({
      success: true,
      message: 'Migration completed',
      ...status,
    });
  } catch (error) {
    logger.error('[Migration] Failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
