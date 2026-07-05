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

function findMatchingFiles(snapshots, key, runtimeValue) {
  if (!runtimeValue) return [];
  return snapshots
    .filter((snapshot) => snapshot.exists && snapshot.values[key] === runtimeValue)
    .map((snapshot) => snapshot.fileName);
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

    const nodeEnvMatchedFiles = findMatchingFiles(
      snapshots,
      'NODE_ENV',
      nodeEnv
    );
    const postgresUriMatchedFiles = findMatchingFiles(
      snapshots,
      'POSTGRES_URI',
      postgresUri
    );

    return NextResponse.json({
      success: true,
      runtime: {
        nodeEnv,
        postgresUri,
      },
      envFiles: {
        projectRoot: webRoot,
        checkedOrder: fileNames,
        nodeEnvMatchedFiles,
        postgresUriMatchedFiles,
        caveat:
          'If the same value exists in multiple files, the actual final effective file cannot be determined by runtime alone.',
        snapshots: snapshots.map((snapshot) => ({
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
          nodeEnvValue: snapshot.values.NODE_ENV || null,
          postgresUriValue: snapshot.values.POSTGRES_URI || null,
        })),
      },
    });
  } catch (error) {
    return createServerError(error, 'Failed to check environment variables.');
  }
}
