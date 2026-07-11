/**
 * Admin account creation script
 * Usage:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js <email> <password>
 *   node scripts/create-admin.js --interactive
 */

// Load environment variables with dotenv (optional in Docker)
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env' });
  dotenv.config({ path: '.env.development' });
} catch (e) {
  console.warn('[create-admin] Failed to load dotenv files:', e?.message);
}

const { Pool } = require('pg');
const bcryptjs = require('bcryptjs');
const readline = require('readline');

// Function to create a PostgreSQL connection pool
function getPostgresPool() {
  const connectionString = process.env.POSTGRES_URI || process.env.DATABASE_URL;
  if (!connectionString) {
    const errorMsg =
      '❌ POSTGRES_URI or DATABASE_URL environment variable is not set.\n' +
      '   Add one of the following to .env.development:\n' +
      '   POSTGRES_URI=postgresql://username:password@host:port/database\n' +
      '   or\n' +
      '   DATABASE_URL=postgresql://username:password@host:port/database';
    throw new Error(errorMsg);
  }

  // Use connection string directly (same approach as create-postgres-schema.js)
  // If no password is used, PostgreSQL must be configured for trust authentication
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  console.log('✅ PostgreSQL connection pool created');
  return pool;
}

// Function to receive user input
function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Password input (hidden)
function getPasswordInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });

    // Hide input (Linux/Mac)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
  });
}

// Validate email format
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password length
function validatePassword(password) {
  if (password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  return null;
}

async function createAdmin(customEmail = null, customPassword = null) {
  let pool = null;
  let client = null;
  const startTime = Date.now();

  try {
    console.log('🔧 Starting admin account creation...');
    console.log('');

    // Check environment variables
    const connectionString =
      process.env.POSTGRES_URI || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        '❌ POSTGRES_URI or DATABASE_URL environment variable is not set.\n' +
          '   Docker environment: check docker.env\n' +
          '   Local environment: check .env.development'
      );
    }

    // Process command-line arguments
    const args = process.argv.slice(2);
    let email, password, name, department, cell;

    if (args.length === 1 && args[0] === '--interactive') {
      // Interactive mode
      console.log('\n📝 Interactive admin account creation mode');
      console.log('========================================');

      // Email input
      do {
        email = await getUserInput('📧 Enter admin email: ');
        if (!validateEmail(email)) {
          console.log('❌ error Invalid email format.');
        }
      } while (!validateEmail(email));

      // Password input
      do {
        password = await getUserInput('🔑 Enter password (minimum 6 characters): ');
        const passwordError = validatePassword(password);
        if (passwordError) {
          console.log(`❌ error ${passwordError}`);
        }
      } while (validatePassword(password));

      // Basic information input
      name =
        (await getUserInput(
          '👤 Enter admin name (default: System Administrator): '
        )) || 'System Administrator';
      department =
        (await getUserInput('🏢 Enter department (default: techInnovationUnit): ')) ||
        'techInnovationUnit';
      cell =
        (await getUserInput(
          '📱 Enter Cell/Team (default: System Management Team): '
        )) || 'System Management Team';
    } else if (args.length >= 2) {
      // Command-line argument mode
      email = args[0];
      password = args[1];
      name = args[2] || 'System Administrator';
      department = args[3] || 'techInnovationUnit';
      cell = args[4] || 'System Management Team';

      // Validation
      if (!validateEmail(email)) {
        throw new Error('❌ error Invalid email format.');
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        throw new Error(`❌ error ${passwordError}`);
      }
    } else if (customEmail && customPassword) {
      // Function parameter mode
      email = customEmail;
      password = customPassword;
      name = 'System Administrator';
      department = 'techInnovationUnit';
      cell = 'System Management Team';
    } else {
      email = process.env.HANIMO_ADMIN_EMAIL || 'admin@hanimo.ai';
      password = process.env.HANIMO_ADMIN_PASSWORD;
      name = process.env.HANIMO_ADMIN_NAME || 'System Administrator';
      department = process.env.HANIMO_ADMIN_DEPARTMENT || 'Hanimo';
      cell = process.env.HANIMO_ADMIN_TEAM || 'Admin Team';

      if (!password || password === 'change-me-after-install' || password.length < 12) {
        throw new Error(
          '❌ HANIMO_ADMIN_PASSWORD is missing or too weak.\n' +
            '   Run ./scripts/install.sh, ./scripts/install-local.sh, or pass credentials explicitly:\n' +
            '   node scripts/create-admin.js <email> <password> [name] [department] [team]'
        );
      }

      console.log('⚠️  Creating admin account with default values.');
      console.log('📋 Usage:');
      console.log(
        '  node scripts/create-admin.js <email> <password> [name] [department] [cell]'
      );
      console.log('  node scripts/create-admin.js --interactive');
      console.log('');
    }

    // PostgreSQL connection
    pool = getPostgresPool();
    client = await pool.connect();

    // Set admin data
    const adminData = {
      name,
      email,
      password,
      department,
      cell,
      role: 'admin',
    };

    // Check for existing admin account
    const existingAdminResult = await client.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [adminData.email]
    );

    if (existingAdminResult.rows.length > 0) {
      const existingAdmin = existingAdminResult.rows[0];
      const rotatePassword =
        process.env.HANIMO_ADMIN_ROTATE_PASSWORD === 'true';
      console.log('⚠️  An account with this email already exists.');
      console.log(`📧 Email: ${adminData.email}`);
      console.log(`🆔 Account ID: ${existingAdmin.id}`);
      console.log(`👤 Role: ${existingAdmin.role || 'user'}`);

      // Prevent duplicate creation if already admin
      if (existingAdmin.role === 'admin') {
        if (rotatePassword) {
          const hashedPassword = await bcryptjs.hash(adminData.password, 12);
          await client.query(
            'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
            [hashedPassword, adminData.email]
          );
          console.log('✅ Admin password rotated. The new value remains only in the local env file.');
          return;
        }
        console.log(
          'ℹ️  This account already has admin privileges. Skipping duplicate creation.'
        );
        return;
      }

      // Promote regular user account to admin
      let updateQuery =
        'UPDATE users SET role = $1, department = $2, cell = $3, updated_at = CURRENT_TIMESTAMP';
      let updateParams = [adminData.role, adminData.department, adminData.cell];

      // If password is provided, hash and update it
      if (adminData.password) {
        const hashedPassword = await bcryptjs.hash(adminData.password, 12);
        updateQuery += ', password_hash = $4';
        updateParams.push(hashedPassword);
      }

      updateQuery += ' WHERE email = $' + (updateParams.length + 1);
      updateParams.push(adminData.email);

      const result = await client.query(updateQuery, updateParams);

      if (result.rowCount > 0) {
        console.log('✅ Existing account has been promoted to admin.');
        if (adminData.password) {
          console.log('✅ Password has also been updated.');
        }
      } else {
        console.log('ℹ️  Account information was not changed (already same settings).');
      }
      return;
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(adminData.password, 12);

    // Create admin account
    const result = await client.query(
      `INSERT INTO users (name, email, password_hash, department, cell, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        adminData.name,
        adminData.email,
        hashedPassword,
        adminData.department,
        adminData.cell,
        adminData.role,
      ]
    );

    if (result.rows.length > 0) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('✅ Admin account created successfully!');
      console.log('');
      console.log('📋 Admin account information:');
      console.log(`📧 Email: ${adminData.email}`);
      console.log('🔑 Password: stored in the local environment; not printed');
      console.log(`👤 Name: ${adminData.name}`);
      console.log(`🏢 Department: ${adminData.department}`);
      console.log(`📱 Cell: ${adminData.cell}`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log('');
      console.log('🚨 Security notes:');
      console.log('1. Change the initial password immediately');
      console.log('2. Store this information in a secure place');
      console.log('3. Use a stronger password in production');
      console.log('');
      console.log('🌐 Admin page access:');
      console.log('   - Local: http://localhost:3000/admin');
      console.log('   - Docker: http://<SERVER_IP>:3000/admin');
    }
  } catch (error) {
    console.error('\n❌ Failed to create admin account');
    console.error('═══════════════════════════════════════════════════');
    console.error(`Error: ${error.message}`);

    if (error.stack && process.env.DEBUG) {
      console.error('\nDetailed error (DEBUG mode):');
      console.error(error.stack);
    }

    console.error('═══════════════════════════════════════════════════\n');
    process.exit(1);
  } finally {
    // Close PostgreSQL connections
    if (client) {
      try {
        client.release();
      } catch (error) {
        console.error('⚠️  Error while releasing client:', error.message);
      }
    }
    if (pool) {
      try {
        await pool.end();
        console.log('🔌 PostgreSQL connection closed');
      } catch (error) {
        console.error('⚠️  Error while closing connection:', error.message);
      }
    }
  }
}

// Run script
createAdmin();
