import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

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

// ─────────────────────────────────────────────
// Schema lookup
// ─────────────────────────────────────────────

/** Column list by table for current DB */
async function getCurrentSchema() {
  const result = await query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const schema = {};
  for (const row of result.rows) {
    if (!schema[row.table_name]) schema[row.table_name] = [];
    schema[row.table_name].push(row.column_name);
  }
  return schema;
}

// ─────────────────────────────────────────────
// Parse COPY blocks (compatible with pg_dump / Node.js backups)
// ─────────────────────────────────────────────

/**
 * COPY public.tablename (col1, col2, ...) FROM stdin;
 * data\tdata\t...
 * \.
 */
function parseCopyBlocks(sql) {
  const blocks = [];
  const lines = sql.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(
      /^COPY\s+(?:public\.)?(\S+)\s+\(([^)]+)\)\s+FROM\s+stdin;$/i
    );
    if (match) {
      const tableName = match[1].replace(/"/g, '');
      const columns = match[2]
        .split(',')
        .map((c) => c.trim().replace(/"/g, ''));
      const rows = [];
      i++;
      while (i < lines.length && lines[i] !== '\\.') {
        rows.push(lines[i]);
        i++;
      }
      blocks.push({ tableName, columns, rows });
    }
    i++;
  }

  return blocks;
}

/** Parse COPY value: \N=NULL, \\=\, \n=newline, \t=tab */
function parseCopyValue(raw) {
  if (raw === '\\N') return null;
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
}

// ─────────────────────────────────────────────
// Parse SQL statements (for full restore)
// ─────────────────────────────────────────────

/**
 * Split SQL text into executable units
 * - normal SQL statements (ending with ;)
 * - COPY blocks (COPY ... FROM stdin; + data + \.)
 * - skip comments/empty lines
 */
function parseSqlStatements(sqlContent) {
  const units = [];
  const lines = sqlContent.split('\n');
  let i = 0;
  let currentStmt = '';

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('--')) {
      i++;
      continue;
    }

    // COPY block -> separate execution unit
    const copyMatch = line.match(
      /^COPY\s+(?:public\.)?(\S+)\s+\(([^)]+)\)\s+FROM\s+stdin;$/i
    );
    if (copyMatch) {
      // Save previous accumulated statement first
      if (currentStmt.trim()) {
        units.push({ type: 'sql', sql: currentStmt.trim() });
        currentStmt = '';
      }

      const tableName = copyMatch[1].replace(/"/g, '');
      const columns = copyMatch[2]
        .split(',')
        .map((c) => c.trim().replace(/"/g, ''));
      const rows = [];
      i++;
      while (i < lines.length && lines[i] !== '\\.') {
        rows.push(lines[i]);
        i++;
      }
      units.push({ type: 'copy', tableName, columns, rows });
      i++; // skip \.
      continue;
    }

    // Normal SQL — complete statement when line ends with semicolon
    currentStmt += (currentStmt ? '\n' : '') + line;
    if (line.trimEnd().endsWith(';')) {
      units.push({ type: 'sql', sql: currentStmt.trim() });
      currentStmt = '';
    }

    i++;
  }

  // Final remaining statement
  if (currentStmt.trim()) {
    units.push({ type: 'sql', sql: currentStmt.trim() });
  }

  return units;
}

// ─────────────────────────────────────────────
// Data-only restore (schema matching)
// ─────────────────────────────────────────────

async function smartRestore(sqlContent) {
  const currentSchema = await getCurrentSchema();
  const copyBlocks = parseCopyBlocks(sqlContent);

  const results = { restored: [], skipped: [], totalRows: 0 };

  await query('BEGIN');
  try {
    // Temporarily disable FK constraints/triggers
    await query("SET session_replication_role = 'replica'");

    for (const block of copyBlocks) {
      const { tableName, columns, rows } = block;

      if (!currentSchema[tableName]) {
        results.skipped.push({
          table: tableName,
          reason: 'Table does not exist',
          rows: rows.length,
        });
        continue;
      }

      const currentColumns = currentSchema[tableName];
      const matchingColumns = columns.filter((c) =>
        currentColumns.includes(c)
      );

      if (matchingColumns.length === 0) {
        results.skipped.push({
          table: tableName,
          reason: 'No matching columns',
          rows: rows.length,
        });
        continue;
      }

      const skippedColumns = columns.filter(
        (c) => !currentColumns.includes(c)
      );
      const indices = matchingColumns.map((c) => columns.indexOf(c));

      await query(`TRUNCATE TABLE "${tableName}" CASCADE`);

      const BATCH_SIZE = 100;
      let insertedRows = 0;

      for (let r = 0; r < rows.length; r += BATCH_SIZE) {
        const batch = rows.slice(r, r + BATCH_SIZE);
        const valueSets = [];
        const params = [];
        let paramIdx = 1;

        for (const row of batch) {
          const allValues = row.split('\t');
          const values = indices.map((idx) => parseCopyValue(allValues[idx]));
          const placeholders = values.map(() => `$${paramIdx++}`);
          valueSets.push(`(${placeholders.join(', ')})`);
          params.push(...values);
        }

        if (valueSets.length > 0) {
          const colNames = matchingColumns.map((c) => `"${c}"`).join(', ');
          await query(
            `INSERT INTO "${tableName}" (${colNames}) VALUES ${valueSets.join(', ')}`,
            params
          );
          insertedRows += batch.length;
        }
      }

      results.restored.push({
        table: tableName,
        rows: insertedRows,
        columns: matchingColumns.length,
        totalColumns: columns.length,
        skippedColumns,
      });
      results.totalRows += insertedRows;
    }

    await query("SET session_replication_role = 'origin'");
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK').catch(() => {});
    throw error;
  }

  return results;
}

// ─────────────────────────────────────────────
// Full restore (pure Node.js — no psql required)
// ─────────────────────────────────────────────

async function fullRestore(sqlContent) {
  const units = parseSqlStatements(sqlContent);
  const stats = { statements: 0, copyBlocks: 0, errors: [] };

  await query('BEGIN');
  try {
    // Temporarily disable FK constraints/triggers
    await query("SET session_replication_role = 'replica'");

    for (const unit of units) {
      if (unit.type === 'sql') {
        // Generic SQL such as SET, SELECT setval, etc.
        try {
          await query(unit.sql);
          stats.statements++;
        } catch (err) {
          // Harmless errors such as DROP IF EXISTS are warnings only
          stats.errors.push({
            sql: unit.sql.slice(0, 120),
            error: err.message,
          });
        }
      } else if (unit.type === 'copy') {
        // COPY block -> convert into batched INSERT statements
        const { tableName, columns, rows } = unit;
        const BATCH_SIZE = 100;

        for (let r = 0; r < rows.length; r += BATCH_SIZE) {
          const batch = rows.slice(r, r + BATCH_SIZE);
          const valueSets = [];
          const params = [];
          let paramIdx = 1;

          for (const row of batch) {
            const allValues = row.split('\t');
            const values = allValues.map((v) => parseCopyValue(v));
            const placeholders = values.map(() => `$${paramIdx++}`);
            valueSets.push(`(${placeholders.join(', ')})`);
            params.push(...values);
          }

          if (valueSets.length > 0) {
            const colNames = columns.map((c) => `"${c}"`).join(', ');
            await query(
              `INSERT INTO "${tableName}" (${colNames}) VALUES ${valueSets.join(', ')}`,
              params
            );
          }
        }
        stats.copyBlocks++;
      }
    }

    await query("SET session_replication_role = 'origin'");
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK').catch(() => {});
    throw error;
  }

  return stats;
}

// ─────────────────────────────────────────────
// POST — DB restore API
// mode=full: full restore (schema + data)
// mode=data: data-only restore (matching current schema)
// ─────────────────────────────────────────────

export async function POST(request) {
  try {
    const adminResult = verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const destructiveGate = requireDestructiveAdminEnabled();
    if (destructiveGate) return destructiveGate;

    const formData = await request.formData();
    const file = formData.get('file');
    const mode = formData.get('mode') || 'full';

    if (!file) {
      return NextResponse.json(
        { error: 'Backup file is required.' },
        { status: 400 }
      );
    }

    const sqlContent = await file.text();
    if (!sqlContent.trim()) {
      return NextResponse.json(
        { error: 'The file is empty.' },
        { status: 400 }
      );
    }

    // Basic validation
    if (
      !sqlContent.includes('PostgreSQL database dump') &&
      !sqlContent.includes('CREATE TABLE') &&
      !sqlContent.includes('COPY ')
    ) {
      return NextResponse.json(
        { error: 'This is not a valid PostgreSQL backup file.' },
        { status: 400 }
      );
    }

    if (mode === 'data') {
      const results = await smartRestore(sqlContent);
      return NextResponse.json({
        success: true,
        mode: 'data',
        message: `Data restore complete: ${results.restored.length} tables, ${results.totalRows} rows restored`,
        restored: results.restored,
        skipped: results.skipped,
      });
    }

    // Full restore (pure Node.js)
    const stats = await fullRestore(sqlContent);
    return NextResponse.json({
      success: true,
      mode: 'full',
      message: `Full restore complete: ${stats.statements} SQL statements, ${stats.copyBlocks} table data blocks`,
      statements: stats.statements,
      copyBlocks: stats.copyBlocks,
      errors: stats.errors.length > 0 ? stats.errors : undefined,
    });
  } catch (error) {
    logger.error('DB restore failed:', error);
    return NextResponse.json(
      { error: 'Failed to restore database.', detail: error.message },
      { status: 500 }
    );
  }
}
