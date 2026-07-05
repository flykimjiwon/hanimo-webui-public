import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/adminAuth';
import { query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────
// Schema lookup helpers
// ─────────────────────────────────────────────

/** All tables in public schema */
async function getTables() {
  const r = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return r.rows.map((x) => x.table_name);
}

/** Table column definitions */
async function getColumns(table) {
  const r = await query(
    `SELECT column_name, udt_name, data_type,
            character_maximum_length, numeric_precision, numeric_scale,
            is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows;
}

/** Build SQL type string */
function formatType(c) {
  const m = {
    int2: 'SMALLINT',
    int4: 'INTEGER',
    int8: 'BIGINT',
    float4: 'REAL',
    float8: 'DOUBLE PRECISION',
    bool: 'BOOLEAN',
    text: 'TEXT',
    uuid: 'UUID',
    date: 'DATE',
    time: 'TIME',
    timetz: 'TIME WITH TIME ZONE',
    timestamp: 'TIMESTAMP',
    timestamptz: 'TIMESTAMP WITH TIME ZONE',
    jsonb: 'JSONB',
    json: 'JSON',
    bytea: 'BYTEA',
  };
  if (c.udt_name === 'varchar')
    return c.character_maximum_length
      ? `VARCHAR(${c.character_maximum_length})`
      : 'VARCHAR';
  if (c.udt_name === 'numeric')
    return c.numeric_precision
      ? `NUMERIC(${c.numeric_precision}${c.numeric_scale ? ',' + c.numeric_scale : ''})`
      : 'NUMERIC';
  return m[c.udt_name] || c.data_type.toUpperCase();
}

/** Constraints (PK, UNIQUE, CHECK, FK) */
async function getConstraints(table) {
  const r = await query(
    `SELECT conname AS name, contype AS type,
            pg_get_constraintdef(c.oid, true) AS definition
     FROM pg_constraint c
     JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname = 'public'
       AND conrelid = (SELECT oid FROM pg_class WHERE relname = $1 AND relnamespace = n.oid)
     ORDER BY contype, conname`,
    [table]
  );
  return r.rows;
}

/** User-defined indexes (excluding auto indexes from constraints) */
async function getIndexes(table) {
  const r = await query(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
       AND indexname NOT IN (
         SELECT conname FROM pg_constraint
         WHERE conrelid = (SELECT oid FROM pg_class WHERE relname = $1)
       )`,
    [table]
  );
  return r.rows.map((x) => x.indexdef);
}

/** Current sequence values */
async function getSequences() {
  const r = await query(`
    SELECT sequencename, last_value
    FROM pg_sequences WHERE schemaname = 'public'
  `);
  return r.rows;
}

/** Sort tables by FK dependencies (referenced tables first) */
async function sortTablesByDependency(tables) {
  const r = await query(`
    SELECT DISTINCT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND tc.table_name != ccu.table_name
  `);

  const deps = {};
  for (const t of tables) deps[t] = new Set();
  for (const { child, parent } of r.rows) {
    if (deps[child] && deps[parent]) deps[child].add(parent);
  }

  const sorted = [];
  const visited = new Set();
  function visit(t) {
    if (visited.has(t)) return;
    visited.add(t);
    for (const dep of deps[t] || []) visit(dep);
    sorted.push(t);
  }
  for (const t of tables) visit(t);
  return sorted;
}

// ─────────────────────────────────────────────
// Escape values for COPY format
// ─────────────────────────────────────────────
function escapeCopyValue(val) {
  if (val === null || val === undefined) return '\\N';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'boolean') return val ? 't' : 'f';
  if (typeof val === 'object')
    return JSON.stringify(val)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// ─────────────────────────────────────────────
// GET — Full DB backup (pure Node.js, no pg_dump required)
// ─────────────────────────────────────────────

export async function GET(request) {
  try {
    const adminResult = verifyAdmin(request);
    if (adminResult instanceof NextResponse) return adminResult;

    const lines = [];

    // Header (includes marker for restore validation)
    lines.push('--');
    lines.push('-- PostgreSQL database dump');
    lines.push(`-- Generated by: modol Node.js backup (pure pg)`);
    lines.push(`-- Dump created: ${new Date().toISOString()}`);
    lines.push('--');
    lines.push('');
    lines.push("SET client_encoding = 'UTF8';");
    lines.push('SET standard_conforming_strings = on;');
    lines.push('');

    // Table list (ordered by FK dependencies)
    const rawTables = await getTables();
    const tables = await sortTablesByDependency(rawTables);

    // ① DROP (reverse order — children first)
    lines.push('-- Drop tables');
    for (const t of [...tables].reverse()) {
      lines.push(`DROP TABLE IF EXISTS "${t}" CASCADE;`);
    }
    lines.push('');

    // ② CREATE TABLE
    for (const t of tables) {
      const cols = await getColumns(t);
      const cons = await getConstraints(t);

      lines.push(`-- Table: ${t}`);
      lines.push(`CREATE TABLE "${t}" (`);

      const defs = cols.map((c) => {
        let d = `  "${c.column_name}" ${formatType(c)}`;
        if (c.is_nullable === 'NO') d += ' NOT NULL';
        if (c.column_default !== null) d += ` DEFAULT ${c.column_default}`;
        return d;
      });

      // Inline PK, UNIQUE, CHECK
      for (const c of cons) {
        if (['p', 'u', 'c'].includes(c.type)) {
          defs.push(`  CONSTRAINT "${c.name}" ${c.definition}`);
        }
      }

      lines.push(defs.join(',\n'));
      lines.push(');');
      lines.push('');
    }

    // ③ Data (COPY format — compatible with smartRestore)
    for (const t of tables) {
      const data = await query(`SELECT * FROM "${t}"`);
      if (!data.rows.length) continue;

      const colNames = Object.keys(data.rows[0]);
      lines.push(
        `COPY ${t} (${colNames.map((c) => `"${c}"`).join(', ')}) FROM stdin;`
      );
      for (const row of data.rows) {
        lines.push(colNames.map((c) => escapeCopyValue(row[c])).join('\t'));
      }
      lines.push('\\.');
      lines.push('');
    }

    // ④ FK constraints (after data insertion)
    let hasFk = false;
    for (const t of tables) {
      const cons = await getConstraints(t);
      for (const c of cons) {
        if (c.type === 'f') {
          if (!hasFk) {
            lines.push('-- Foreign keys');
            hasFk = true;
          }
          lines.push(
            `ALTER TABLE "${t}" ADD CONSTRAINT "${c.name}" ${c.definition};`
          );
        }
      }
    }
    if (hasFk) lines.push('');

    // ⑤ Indexes
    let hasIdx = false;
    for (const t of tables) {
      const idxs = await getIndexes(t);
      for (const idx of idxs) {
        if (!hasIdx) {
          lines.push('-- Indexes');
          hasIdx = true;
        }
        lines.push(`${idx};`);
      }
    }
    if (hasIdx) lines.push('');

    // ⑥ Current sequence values
    const seqs = await getSequences();
    if (seqs.length) {
      lines.push('-- Sequences');
      for (const s of seqs) {
        if (s.last_value != null) {
          lines.push(
            `SELECT setval('"${s.sequencename}"', ${s.last_value}, true);`
          );
        }
      }
      lines.push('');
    }

    lines.push('-- Dump complete');

    const sql = lines.join('\n');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `modol-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.sql`;

    return new NextResponse(sql, {
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    logger.error('DB backup failed:', error);
    return NextResponse.json(
      { error: 'Failed to back up database.', detail: error.message },
      { status: 500 }
    );
  }
}
