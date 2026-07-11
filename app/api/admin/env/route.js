import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { verifyAdminWithResult } from '@/lib/auth';
import { createAuthError, createServerError } from '@/lib/errorHandler';

const BASE_ENV_FILES = ['.env', '.env.local'];

const MODE_ENV_FILE_MAP = {
  development: ['.env.development', '.env.development.local'],
  production: ['.env.production', '.env.production.local'],
  test: ['.env.test', '.env.test.local'],
};

function unquote(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(content) {
  const parsed = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const matched = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!matched) continue;

    const key = matched[1];
    const value = unquote(matched[2].trim());
    parsed[key] = value;
  }

  return parsed;
}

function readEnvFileSnapshot(webRoot, fileName) {
  const absolutePath = path.join(webRoot, fileName);

  if (!fs.existsSync(absolutePath)) {
    return {
      fileName,
      exists: false,
      values: {},
    };
  }

  const raw = fs.readFileSync(absolutePath, 'utf8');
  const values = parseEnvFile(raw);

  return {
    fileName,
    exists: true,
    values,
  };
}

function uniqueFileList(nodeEnv) {
  const modeFiles = MODE_ENV_FILE_MAP[nodeEnv] || [];
  return Array.from(new Set([...BASE_ENV_FILES, ...modeFiles]));
}

function findFilesContainingKey(snapshots, key) {
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.exists &&
        Object.prototype.hasOwnProperty.call(snapshot.values, key)
    )
    .map((snapshot) => snapshot.fileName);
}

export function sanitizePostgresUri(rawValue) {
  if (!rawValue) {
    return {
      configured: false,
      parseError: false,
      protocol: null,
      hostname: null,
      port: null,
      database: null,
    };
  }

  try {
    const parsed = new URL(rawValue);
    const database = parsed.pathname
      ? decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
      : '';
    const parsedPort = parsed.port ? Number.parseInt(parsed.port, 10) : null;

    return {
      configured: true,
      parseError: false,
      protocol: parsed.protocol ? parsed.protocol.replace(/:$/, '') : null,
      hostname: parsed.hostname || null,
      port: Number.isInteger(parsedPort) ? parsedPort : null,
      database: database || null,
    };
  } catch {
    return {
      configured: true,
      parseError: true,
      protocol: null,
      hostname: null,
      port: null,
      database: null,
    };
  }
}

function summarizeEnvSnapshot(snapshot) {
  return {
    fileName: snapshot.fileName,
    exists: snapshot.exists,
    hasNodeEnv: Object.prototype.hasOwnProperty.call(
      snapshot.values,
      'NODE_ENV'
    ),
    hasPostgresUri: Object.prototype.hasOwnProperty.call(
      snapshot.values,
      'POSTGRES_URI'
    ),
  };
}

export async function GET(request) {
  try {
    const adminCheck = verifyAdminWithResult(request);
    if (!adminCheck.valid) {
      return createAuthError(adminCheck.error);
    }

    const nodeEnv = process.env.NODE_ENV || null;
    const postgresUri = process.env.POSTGRES_URI || null;
    const webRoot = process.cwd();
    const fileNames = uniqueFileList(nodeEnv || 'development');
    const snapshots = fileNames.map((fileName) =>
      readEnvFileSnapshot(webRoot, fileName)
    );

    const nodeEnvFiles = findFilesContainingKey(snapshots, 'NODE_ENV');
    const postgresUriFiles = findFilesContainingKey(snapshots, 'POSTGRES_URI');
    const postgres = sanitizePostgresUri(postgresUri);

    return NextResponse.json({
      success: true,
      runtime: {
        nodeEnv: {
          configured: Boolean(nodeEnv),
        },
        postgres,
      },
      envFiles: {
        checkedOrder: fileNames,
        nodeEnvFiles,
        postgresUriFiles,
        caveat:
          'Only key presence and connection diagnostics are shown. Runtime values are intentionally omitted.',
        snapshots: snapshots.map(summarizeEnvSnapshot),
      },
    });
  } catch (error) {
    return createServerError(error, 'Failed to check environment variables.');
  }
}
