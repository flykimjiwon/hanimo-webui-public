#!/usr/bin/env node

/**
 * PostgreSQL connection test script
 *
 * Usage:
 *   node scripts/test-postgres-connection.js
 */

require('dotenv').config({ path: '.env.development' });
const { Pool } = require('pg');

const POSTGRES_URI = process.env.POSTGRES_URI || process.env.DATABASE_URL;

if (!POSTGRES_URI) {
  console.error(
    '❌ error POSTGRES_URI or DATABASE_URL is not defined in .env.development.'
  );
  console.error('');
  console.error('💡 How to fix:');
  console.error('   Add the following to the .env.development file:');
  console.error(
    '   POSTGRES_URI=postgresql://username:password@host:port/database_name'
  );
  console.error('');
  console.error('   Or you can use the DATABASE_URL environment variable:');
  console.error(
    '   DATABASE_URL=postgresql://username:password@host:port/database_name'
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: POSTGRES_URI,
  connectionTimeoutMillis: 10000,
});

async function testConnection() {
  console.log('🔌 Starting PostgreSQL connection test...');
  console.log(`   Connection string: ${POSTGRES_URI.replace(/:[^:@]+@/, ':****@')}`);
  console.log('');

  let client;
  try {
    // Attempt connection
    console.log('📡 Attempting to connect...');
    client = await pool.connect();
    console.log('✅ Connected successfully!');
    console.log('');

    // Simple query test
    console.log('📊 Testing query...');
    const result = await client.query(
      'SELECT NOW() as current_time, version() as pg_version'
    );
    console.log('✅ Query executed successfully!');
    console.log('');
    console.log('📋 PostgreSQL info:');
    console.log(`   Current time: ${result.rows[0].current_time}`);
    console.log(`   Version: ${result.rows[0].pg_version.split(',')[0]}`);
    console.log('');

    // Check database list
    console.log('📋 Database list:');
    const dbResult = await client.query(
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
    );
    dbResult.rows.forEach((row) => {
      const marker = row.datname === 'modol' ? ' ✅' : '';
      console.log(`   - ${row.datname}${marker}`);
    });
    console.log('');

    // Attempt to check modol database
    if (POSTGRES_URI.includes('/modol')) {
      console.log('📊 Checking modol database tables...');
      try {
        const tablesResult = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        `);

        if (tablesResult.rows.length > 0) {
          console.log(`✅ Found ${tablesResult.rows.length} tables:`);
          tablesResult.rows.forEach((row) => {
            console.log(`   - ${row.table_name}`);
          });
        } else {
          console.log('⚠️  No tables found. You need to create the schema.');
          console.log('   Run: npm run setup-postgres');
        }
      } catch (err) {
        console.log('⚠️  Failed to fetch tables:', err.message);
      }
    }

    console.log('');
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('');
    console.error('❌ error connection failed:', error.message);
    console.error('   Error code:', error.code);
    console.error('');

    // Provide specific error guidance
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Cannot connect to PostgreSQL server.');
      console.error('');
      console.error('   Checklist:');
      console.error('   1. Check whether PostgreSQL is running:');
      console.error('      - macOS: brew services list | grep postgresql');
      console.error('      - Linux: systemctl status postgresql');
      console.error('      - Docker: docker ps | grep postgres');
      console.error('');
      console.error('   2. Start PostgreSQL:');
      console.error('      - macOS: brew services start postgresql@15');
      console.error('      - Linux: sudo systemctl start postgresql');
      console.error('      - Docker: docker compose up -d postgres');
      console.error('');
      console.error('   3. Check port:');
      console.error('      - lsof -i :5432 (macOS/Linux)');
      console.error('      - netstat -an | grep 5432 (Windows)');
    } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      console.error('💡 Host not found.');
      console.error('');
      console.error('   Checklist:');
      console.error('   1. Check if the host name is correct');
      console.error('   2. If using Docker:');
      console.error('      - Check if the container name is correct');
      console.error('      - Check if it is on the same network');
      console.error('      - Check the service name in docker-compose.yml');
    } else if (error.code === '28P01' || error.message.includes('password')) {
      console.error('💡 Authentication failed: username or password is incorrect.');
      console.error('');
      console.error('   Checklist:');
      console.error('   1. Check username and password in POSTGRES_URI');
      console.error('   2. Check PostgreSQL users:');
      console.error('      psql -U postgres -c "\\du"');
    } else if (error.code === '3D000') {
      console.error('💡 Database does not exist.');
      console.error('');
      console.error('   How to fix:');
      console.error('   1. Create database:');
      console.error('      createdb modol');
      console.error('   2. Or run the schema setup script:');
      console.error('      npm run setup-postgres');
    } else {
      console.error('💡 General troubleshooting:');
      console.error('   1. Check whether PostgreSQL is running');
      console.error('   2. Check connection string format:');
      console.error(
        '      postgresql://username:password@host:port/database_name'
      );
      console.error('   3. Check firewall settings');
      console.error('   4. Check PostgreSQL logs');
    }

    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('🔌 Connection closed');
  }
}

testConnection();
