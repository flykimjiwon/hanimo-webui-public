/**
 * Integrated database initialization script
 *
 * This script performs the following:
 * 1. Waits for PostgreSQL connection (Docker-compatible)
 * 2. Creates schema (if tables do not exist)
 * 3. Creates default data (settings, notices, RAG settings)
 * 4. Creates default admin account (admin@hanimo.ai, if needed)
 *
 * Usage:
 *   node scripts/create-postgres-schema.js
 */

// Disable stdout/stderr buffering (immediate output in Docker)
if (process.stdout.isTTY === false) {
  process.stdout._handle?.setBlocking?.(true);
  process.stderr._handle?.setBlocking?.(true);
}

// In Docker, .env.development may not exist, so load it optionally
try {
  require('dotenv').config({ path: '.env.development' });
} catch (e) {
  console.warn(
    '[create-postgres-schema] Failed to load .env.development:',
    e?.message
  );
}

const { Pool } = require('pg');
const { spawn } = require('child_process');
const path = require('path');
const {
  createPool,
  waitForDatabase,
  tableExists: dbUtilsTableExists,
  userExists,
  maskConnectionString,
} = require('./db-utils');

const POSTGRES_URI = process.env.POSTGRES_URI || process.env.DATABASE_URL;

// Environment variable is required
if (!POSTGRES_URI) {
  console.error(
    '❌ POSTGRES_URI or DATABASE_URL environment variable not set.'
  );
  console.error('');
  console.error('💡 Set an environment variable:');
  console.error(
    '   POSTGRES_URI=postgresql://username:password@host:port/database'
  );
  console.error('   or');
  console.error(
    '   DATABASE_URL=postgresql://username:password@host:port/database'
  );
  process.exit(1);
}

// Create connection pool using db-utils createPool
let pool = null;

/**
 * Check whether a table exists
 */
async function tableExists(client, tableName) {
  const result = await client.query(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )
  `,
    [tableName]
  );
  return result.rows[0].exists;
}

/**
 * Node.js script execution helper
 */
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      env: process.env,
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
            new Error(`Script execution failed: ${scriptPath} (exit code: ${code})`)
        );
      } else {
        resolve();
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Script execution error: ${scriptPath} - ${error.message}`));
    });
  });
}

/**
 * Create table (after checking if it exists)
 */
async function createTableIfNotExists(
  client,
  tableName,
  createQuery,
  description
) {
  try {
    console.log(`  🔍 Checking ${description}...`);
    const exists = await tableExists(client, tableName);
    if (exists) {
      console.log(`  ⏭️  ${description} (already exists)`);
      return false;
    } else {
      console.log(`  🔨 Creating ${description}...`);
      await client.query(createQuery);
      console.log(`  ✅ ${description} created`);
      return true;
    }
  } catch (error) {
    console.error(`  ❌ Failed to create ${description}:`, error.message);
    if (error.code) {
      console.error(`     Error code: ${error.code}`);
    }
    throw error;
  }
}

/**
 * Create PostgreSQL schema
 */
async function createSchema() {
  const client = await pool.connect();

  try {
    console.log('🔗 Database client connected');

    // Start transaction - run all schema operations atomically
    console.log('🔄 Starting transaction...');
    await client.query('BEGIN');
    console.log('✅ Transaction started');

    // Enable UUID extension
    console.log('📦 Enabling UUID extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ UUID extension enabled');

    console.log('\n📋 Starting table creation...\n');

    // 1. users table
    await createTableIfNotExists(
      client,
      'users',
      `
      CREATE TABLE users (
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
      )
    `,
      '1. users table'
    );

    // 2. chat_rooms table
    await createTableIfNotExists(
      client,
      'chat_rooms',
      `
      CREATE TABLE chat_rooms (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '2. chat_rooms table'
    );

    // 3. chat_history table
    await createTableIfNotExists(
      client,
      'chat_history',
      `
      CREATE TABLE chat_history (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
        text TEXT,
        model VARCHAR(255),
        file_references JSONB,
        feedback VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '3. chat_history table'
    );

    // 4. messages table (for admin logging)
    // Normalization: remove email, name, department, cell (query via JOIN from users table)
    await createTableIfNotExists(
      client,
      'messages',
      `
      CREATE TABLE messages (
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
      )
    `,
      '4. messages table (for admin logging)'
    );

    // 5. chat_files table
    await createTableIfNotExists(
      client,
      'chat_files',
      `
      CREATE TABLE chat_files (
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
      )
    `,
      '5. chat_files table'
    );

    // Add missing columns to chat_files table (if existing table is present)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_files' AND column_name='extraction_method') THEN
          ALTER TABLE chat_files ADD COLUMN extraction_method VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_files' AND column_name='processed_at') THEN
          ALTER TABLE chat_files ADD COLUMN processed_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_files' AND column_name='pdf_metadata') THEN
          ALTER TABLE chat_files ADD COLUMN pdf_metadata JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_files' AND column_name='ocr_results') THEN
          ALTER TABLE chat_files ADD COLUMN ocr_results JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_files' AND column_name='ocr_summary') THEN
          ALTER TABLE chat_files ADD COLUMN ocr_summary TEXT;
        END IF;
        -- Add 'failed' value to status column (update existing CHECK constraint)
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='chat_files' AND constraint_name LIKE 'chat_files_status_check%') THEN
          ALTER TABLE chat_files DROP CONSTRAINT IF EXISTS chat_files_status_check;
          ALTER TABLE chat_files ADD CONSTRAINT chat_files_status_check CHECK (status IN ('processing', 'completed', 'error', 'failed'));
        END IF;
      END $$;
    `);

    // 6. uploaded_files table
    await createTableIfNotExists(
      client,
      'uploaded_files',
      `
      CREATE TABLE uploaded_files (
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
      )
    `,
      '6. uploaded_files table'
    );

    // 7. settings table
    await createTableIfNotExists(
      client,
      'settings',
      `
      CREATE TABLE settings (
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
      )
    `,
      '7. settings table'
    );

    // 7-1. Add room_name_generation_model column to settings table (existing DB compatibility)
    await client.query(`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS room_name_generation_model VARCHAR(255)
    `);

    // 8. admin_settings table
    await createTableIfNotExists(
      client,
      'admin_settings',
      `
      CREATE TABLE admin_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        config_type VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        settings JSONB
      )
    `,
      '8. admin_settings table'
    );

    // 9. model_config table
    await createTableIfNotExists(
      client,
      'model_config',
      `
      CREATE TABLE model_config (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        config_type VARCHAR(50) DEFAULT 'model',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        config JSONB
      )
    `,
      '9. model_config table'
    );

    // 9-1. model_categories table (model categories)
    await createTableIfNotExists(
      client,
      'model_categories',
      `
      CREATE TABLE model_categories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        category_key VARCHAR(50) UNIQUE NOT NULL,
        label VARCHAR(255) NOT NULL,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '9-1. model_categories table (model categories)'
    );

    // 9-2. models table (model information)
    await createTableIfNotExists(
      client,
      'models',
      `
      CREATE TABLE models (
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
      )
    `,
      '9-2. models table (model information)'
    );

    // Add endpoint column to models table (if existing table is present)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='models' AND column_name='endpoint') THEN
          ALTER TABLE models ADD COLUMN endpoint VARCHAR(500);
        END IF;
      END $$;
    `);

    // 10. prompt_config table
    await createTableIfNotExists(
      client,
      'prompt_config',
      `
      CREATE TABLE prompt_config (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        config_type VARCHAR(50) DEFAULT 'prompt',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        config JSONB
      )
    `,
      '10. prompt_config table'
    );

    // 11. model_logs table
    await createTableIfNotExists(
      client,
      'model_logs',
      `
      CREATE TABLE model_logs (
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
      )
    `,
      '11. model_logs table'
    );

    // 12. model_server table
    await createTableIfNotExists(
      client,
      'model_server',
      `
      CREATE TABLE model_server (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        endpoint VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      )
    `,
      '12. model_server table'
    );

    // Add name UNIQUE constraint (for existing table) - safely handled with DO block
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'model_server_name_unique' 
          AND conrelid = 'model_server'::regclass
        ) THEN
          ALTER TABLE model_server ADD CONSTRAINT model_server_name_unique UNIQUE (name);
        END IF;
      END $$;
    `);

    // 13. model_server_error_history table (model server error history)
    await createTableIfNotExists(
      client,
      'model_server_error_history',
      `
      CREATE TABLE model_server_error_history (
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
      )
    `,
      '13. model_server_error_history table (model server error history)'
    );

    // Index creation moved to batch processing below

    // 14. model_server_status table
    await createTableIfNotExists(
      client,
      'model_server_status',
      `
      CREATE TABLE model_server_status (
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
      )
    `,
      '14. model_server_status table'
    );

    // 14-1. external_api_prompts table (stores full prompt/message data)
    await createTableIfNotExists(
      client,
      'external_api_prompts',
      `
      CREATE TABLE external_api_prompts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        prompt TEXT,
        messages JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '14-1. external_api_prompts table (stores full prompt/message data)'
    );

    // 14-2. external_api_logs table
    // Normalization: remove user_email, user_name, user_role, user_department, user_cell (query via JOIN from users table)
    await createTableIfNotExists(
      client,
      'external_api_logs',
      `
      CREATE TABLE external_api_logs (
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
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source VARCHAR(50) DEFAULT 'external_api'
      )
    `,
      '14-2. external_api_logs table'
    );

    // Add missing columns to external_api_logs table (if existing table is present) - consolidated
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='request_headers') THEN
          ALTER TABLE external_api_logs ADD COLUMN request_headers JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='request_body') THEN
          ALTER TABLE external_api_logs ADD COLUMN request_body JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='response_headers') THEN
          ALTER TABLE external_api_logs ADD COLUMN response_headers JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='response_body') THEN
          ALTER TABLE external_api_logs ADD COLUMN response_body JSONB;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='prompt_id') THEN
          ALTER TABLE external_api_logs ADD COLUMN prompt_id UUID REFERENCES external_api_prompts(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='external_api_logs' AND column_name='conversation_id') THEN
          ALTER TABLE external_api_logs ADD COLUMN conversation_id VARCHAR(50);
        END IF;
      END $$;
    `);

    // 15. api_tokens table
    await createTableIfNotExists(
      client,
      'api_tokens',
      `
      CREATE TABLE api_tokens (
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
      )
    `,
      '15. api_tokens table'
    );

    // Add missing fields to api_tokens table (if existing table is present)
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='encrypted_token') THEN
          ALTER TABLE api_tokens ADD COLUMN encrypted_token TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='expires_at') THEN
          ALTER TABLE api_tokens ADD COLUMN expires_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='is_active') THEN
          ALTER TABLE api_tokens ADD COLUMN is_active BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='created_by') THEN
          ALTER TABLE api_tokens ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='api_tokens' AND column_name='updated_at') THEN
          ALTER TABLE api_tokens ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);

    // 16. notices table
    await createTableIfNotExists(
      client,
      'notices',
      `
      CREATE TABLE notices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        title VARCHAR(255) NOT NULL,
        content TEXT,
        is_popup BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        author_id UUID REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '16. notices table'
    );

    // 17. user_chats table
    await createTableIfNotExists(
      client,
      'user_chats',
      `
      CREATE TABLE user_chats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '17. user_chats table'
    );

    // 18. qa_logs table
    await createTableIfNotExists(
      client,
      'qa_logs',
      `
      CREATE TABLE qa_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        log_data JSONB
      )
    `,
      '18. qa_logs table'
    );

    // 19. rag_documents table
    await createTableIfNotExists(
      client,
      'rag_documents',
      `
      CREATE TABLE rag_documents (
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
        processing_started_at TIMESTAMP,
        processing_completed_at TIMESTAMP,
        vectorization_started_at TIMESTAMP,
        vectorization_completed_at TIMESTAMP,
        vectorization_progress INTEGER DEFAULT 0 CHECK (vectorization_progress >= 0 AND vectorization_progress <= 100),
        error_message TEXT,
        extracted_text TEXT,
        text_length INTEGER,
        chunk_count INTEGER DEFAULT 0,
        vectors JSONB,
        embedding_model VARCHAR(255),
        description TEXT,
        priority VARCHAR(50) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        search_count INTEGER DEFAULT 0,
        last_searched_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '19. rag_documents table'
    );

    // 20. rag_models table
    await createTableIfNotExists(
      client,
      'rag_models',
      `
      CREATE TABLE rag_models (
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
      )
    `,
      '20. rag_models table'
    );

    // 21. rag_settings table
    await createTableIfNotExists(
      client,
      'rag_settings',
      `
      CREATE TABLE rag_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chunk_size INTEGER DEFAULT 1024 CHECK (chunk_size >= 128 AND chunk_size <= 4096),
        chunk_overlap INTEGER DEFAULT 20 CHECK (chunk_overlap >= 0 AND chunk_overlap <= 512),
        embedding_model VARCHAR(255) NOT NULL DEFAULT 'nomic-embed-text',
        embedding_dimensions INTEGER DEFAULT 768,
        similarity_top_k INTEGER DEFAULT 3 CHECK (similarity_top_k >= 1 AND similarity_top_k <= 10),
        similarity_threshold DECIMAL(3,2) DEFAULT 0.7 CHECK (similarity_threshold >= 0.1 AND similarity_threshold <= 1.0),
        vector_db_path VARCHAR(255) DEFAULT './data/lancedb',
        table_name VARCHAR(255) DEFAULT 'documents',
        response_mode VARCHAR(50) DEFAULT 'compact' CHECK (response_mode IN ('compact', 'refine', 'tree_summarize', 'simple_summarize')),
        max_tokens INTEGER DEFAULT 2048 CHECK (max_tokens >= 256 AND max_tokens <= 8192),
        temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
        system_prompt TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `,
      '21. rag_settings table'
    );

    // 22. direct_messages table (notes)
    await createTableIfNotExists(
      client,
      'direct_messages',
      `
      CREATE TABLE direct_messages (
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
      '22. direct_messages table (notes)'
    );

    // 23. agent_permissions table (agent access permissions)
    await createTableIfNotExists(
      client,
      'agent_permissions',
      `
      CREATE TABLE agent_permissions (
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
      '23. agent_permissions table (agent access permissions)'
    );

    await createTableIfNotExists(
      client,
      'screens',
      `
      CREATE TABLE screens (
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
      )
    `,
      '24. screens table'
    );

    await client.query(`ALTER TABLE screens ALTER COLUMN user_id TYPE TEXT USING user_id::text`).catch(() => {});

    await createTableIfNotExists(
      client,
      'screen_access_logs',
      `
      CREATE TABLE screen_access_logs (
        id BIGSERIAL PRIMARY KEY,
        screen_id INTEGER REFERENCES screens(id) ON DELETE CASCADE,
        user_id TEXT,
        client_ip VARCHAR(255),
        action VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `,
      '25. screen_access_logs table'
    );

    // Add missing columns to model_logs table (if existing table is present) - consolidated
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='type') THEN
          ALTER TABLE model_logs ADD COLUMN type VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='user_id') THEN
          ALTER TABLE model_logs ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='method') THEN
          ALTER TABLE model_logs ADD COLUMN method VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='endpoint') THEN
          ALTER TABLE model_logs ADD COLUMN endpoint VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='model') THEN
          ALTER TABLE model_logs ADD COLUMN model VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='error') THEN
          ALTER TABLE model_logs ADD COLUMN error TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='provider') THEN
          ALTER TABLE model_logs ADD COLUMN provider VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='client_ip') THEN
          ALTER TABLE model_logs ADD COLUMN client_ip VARCHAR(45);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='user_agent') THEN
          ALTER TABLE model_logs ADD COLUMN user_agent TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='response_time') THEN
          ALTER TABLE model_logs ADD COLUMN response_time INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='status_code') THEN
          ALTER TABLE model_logs ADD COLUMN status_code INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='is_stream') THEN
          ALTER TABLE model_logs ADD COLUMN is_stream BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='prompt_tokens') THEN
          ALTER TABLE model_logs ADD COLUMN prompt_tokens INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='completion_tokens') THEN
          ALTER TABLE model_logs ADD COLUMN completion_tokens INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='total_tokens') THEN
          ALTER TABLE model_logs ADD COLUMN total_tokens INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='has_files') THEN
          ALTER TABLE model_logs ADD COLUMN has_files BOOLEAN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='model_logs' AND column_name='file_count') THEN
          ALTER TABLE model_logs ADD COLUMN file_count INTEGER;
        END IF;
      END $$;
    `);

    console.log('\n📊 Creating indexes...\n');

    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)',
      'CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id ON chat_rooms(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_history_room_id ON chat_history(room_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_chat_files_room_id ON chat_files(room_id)',
      'CREATE INDEX IF NOT EXISTS idx_model_server_error_history_endpoint ON model_server_error_history(endpoint_url, checked_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_model_server_error_history_provider ON model_server_error_history(provider, checked_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_external_api_logs_timestamp ON external_api_logs(timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_external_api_logs_user_id ON external_api_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_external_api_logs_conversation_id ON external_api_logs(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash)',
      'CREATE INDEX IF NOT EXISTS idx_notices_is_active ON notices(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status)',
      'CREATE INDEX IF NOT EXISTS idx_rag_documents_category ON rag_documents(category)',
      'CREATE INDEX IF NOT EXISTS idx_rag_documents_uploaded_by ON rag_documents(uploaded_by)',
      'CREATE INDEX IF NOT EXISTS idx_rag_documents_uploaded_at ON rag_documents(uploaded_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_rag_models_status ON rag_models(status)',
      'CREATE INDEX IF NOT EXISTS idx_rag_models_is_default ON rag_models(is_default)',
      'CREATE INDEX IF NOT EXISTS idx_model_server_status_instance_id ON model_server_status(instance_id)',
      'CREATE INDEX IF NOT EXISTS idx_models_category_id ON models(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_models_model_name ON models(model_name)',
      'CREATE INDEX IF NOT EXISTS idx_models_is_default ON models(is_default)',
      'CREATE INDEX IF NOT EXISTS idx_model_categories_display_order ON model_categories(display_order)',
      'CREATE INDEX IF NOT EXISTS idx_model_logs_user_id ON model_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id)',
      'CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(recipient_id, is_read)',
      'CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_dm_deleted ON direct_messages(recipient_id, deleted_by_recipient)',
      'CREATE INDEX IF NOT EXISTS idx_agent_permissions_agent_id ON agent_permissions(agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_agent_permissions_type ON agent_permissions(permission_type)',
      'CREATE INDEX IF NOT EXISTS idx_screens_user_id ON screens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_screens_share_id ON screens(share_id)',
      'CREATE INDEX IF NOT EXISTS idx_screen_access_logs_screen_id ON screen_access_logs(screen_id)',
    ];

    // Run indexes sequentially (safely within transaction)
    console.log('\n📊 Creating indexes...\n');
    for (let i = 0; i < indexQueries.length; i++) {
      const query = indexQueries[i];
      try {
        await client.query(query);
        if ((i + 1) % 5 === 0 || i === indexQueries.length - 1) {
          console.log(
            `  ✅ Index creation in progress... (${i + 1}/${indexQueries.length})`
          );
        }
      } catch (error) {
        console.error(
          `  ❌ Index creation failed (${i + 1}/${indexQueries.length}):`,
          error.message
        );
        throw error;
      }
    }
    console.log('✅ All indexes created\n');

    // Commit transaction
    console.log('💾 Committing transaction...');
    await client.query('COMMIT');
    console.log('✅ Transaction committed');
    console.log('✅ Schema creation completed');
  } catch (error) {
    // Roll back on error
    console.error('\n❌ Error occurred! Rolling back transaction...');
    try {
      await client.query('ROLLBACK');
      console.error('✅ Transaction rollback completed');
    } catch (rollbackError) {
      console.error('⚠️  Rollback error:', rollbackError.message);
    }
    console.error('❌ Schema creation failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.stack && process.env.DEBUG) {
      console.error('\nDetailed error stack:');
      console.error(error.stack);
    }
    throw error;
  } finally {
    console.log('🔌 Releasing database client connection...');
    client.release();
    console.log('✅ Database client connection released');
  }
}

/**
 * Create default data
 */
async function setupDefaultData() {
  const client = await pool.connect();

  try {
    // Create default settings
    const settingsResult = await client.query(
      'SELECT COUNT(*) FROM settings WHERE config_type = $1',
      ['general']
    );

    if (parseInt(settingsResult.rows[0].count) === 0) {
      console.log('Creating default settings...');
      await client.query(
        `INSERT INTO settings (config_type, multiturn_count, tooltip_enabled, tooltip_message)
         VALUES ($1, $2, $3, $4)`,
        ['general', 10, true, 'You can also use higher-performance models']
      );
      console.log('✅ Default settings created');
    }

    // Create notice
    const adminResult = await client.query(
      'SELECT id, name FROM users WHERE role = $1 LIMIT 1',
      ['admin']
    );

    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      const noticeResult = await client.query('SELECT COUNT(*) FROM notices');

      if (parseInt(noticeResult.rows[0].count) === 0) {
        console.log('Creating notice...');
        await client.query(
          `INSERT INTO notices (title, content, is_popup, is_active, author_id, author_name)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'Welcome!',
            'The system has been installed successfully.',
            true,
            true,
            admin.id,
            admin.name,
          ]
        );
        console.log('✅ Notice created');
      }
    }

    // Create RAG settings
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      const ragSettingsResult = await client.query(
        'SELECT COUNT(*) FROM rag_settings'
      );

      if (parseInt(ragSettingsResult.rows[0].count) === 0) {
        console.log('Creating RAG settings...');
        await client.query(
          `INSERT INTO rag_settings (updated_by)
           VALUES ($1)`,
          [admin.id]
        );
        console.log('✅ RAG settings created');
      }
    }
  } catch (error) {
    console.error('❌ Error creating default data:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main initialization function
 */
async function initializeDatabase() {
  const startTime = Date.now();

  try {
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 Starting database initialization');
    console.log('═══════════════════════════════════════════════════\n');

    // 1. Validate environment variables
    console.log('📊 PostgreSQL connection info:', maskConnectionString(POSTGRES_URI));
    console.log('');

    // 2. Create PostgreSQL connection pool
    console.log('🔌 Creating PostgreSQL connection pool...');
    pool = createPool();
    console.log('✅ Connection pool created\n');

    // 3. Wait for PostgreSQL connection (Docker-compatible)
    await waitForDatabase(pool);
    console.log('');

    // 4. Check whether schema exists
    console.log('🔍 Checking database schema...');
    const client = await pool.connect();
    const hasSchema = await dbUtilsTableExists(client, 'users');
    client.release();

    // 5. Create schema (if needed)
    if (!hasSchema) {
      console.log('📋 Database schema does not exist. Starting creation...\n');
      try {
        await createSchema();
        console.log('\n✅ Schema creation completed\n');
      } catch (schemaError) {
        console.error('\n❌ Error occurred during schema creation');
        console.error('Error message:', schemaError.message);
        if (schemaError.code) {
          console.error('Error code:', schemaError.code);
        }
        throw schemaError;
      }
    } else {
      console.log('✅ Database schema already exists.\n');
    }

    // 6. Create default data
    console.log('🔍 Checking default data...');
    await setupDefaultData();
    console.log('');

    // 7. Check admin account
    console.log('🔍 Checking admin account...');
    const client2 = await pool.connect();
     const hasAdmin = await userExists(client2, 'admin@hanimo.ai');
    client2.release();

    // 8. Create admin account (if needed)
    if (!hasAdmin) {
      console.log('👤 Default admin account does not exist. Starting creation...\n');
      const adminScriptPath = path.join(__dirname, 'create-admin.js');

      try {
        await runScript(adminScriptPath);
        console.log('\n✅ Admin account created\n');
      } catch (error) {
        throw new Error(`Failed to create admin account: ${error.message}`);
      }
    } else {
       console.log(
          '✅ Default admin account (admin@hanimo.ai) already exists.\n'
       );
    }

    // 9. Initialization complete
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Database initialization completed!');
    console.log(`⏱️  Elapsed time: ${duration}s`);
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database initialization failed');
    console.error('═══════════════════════════════════════════════════');
    console.error(`Error: ${error.message}`);

    if (error.stack && process.env.DEBUG) {
      console.error('\nDetailed error (DEBUG mode):');
      console.error(error.stack);
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('');
      console.error('💡 Check whether PostgreSQL is running:');
      console.error('   1. Verify PostgreSQL installation: psql --version');
      console.error(
        '   2. Check PostgreSQL status: brew services list (macOS) or systemctl status postgresql (Linux)'
      );
      console.error(
        '   3. Start PostgreSQL: brew services start postgresql (macOS)'
      );
      console.error('   4. Create database: createdb modol');
      console.error('');
      console.error('   Or if you are using Docker:');
      console.error(
        '   docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=modol -p 5432:5432 postgres:15'
      );
    }

    console.error('═══════════════════════════════════════════════════\n');
    process.exit(1);
  } finally {
    // Clean up connections
    if (pool) {
      try {
        await pool.end();
        console.log('🔌 PostgreSQL connection closed\n');
      } catch (error) {
        console.error('⚠️  Error while closing connection:', error.message);
      }
    }
  }
}

// Run only when script is executed directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
