#!/usr/bin/env node
/**
 * 자동 마이그레이션: app/ 하위 모든 console.* 호출을 @/lib/logger로 교체.
 * - 정확한 단어 경계 매칭 (예: 'console.logger' 같은 오탐 방지)
 * - shadcn ui / 정적 자산 / scripts / 자체 logger 본체는 제외
 * - 변환된 파일에는 logger import 자동 추가 ('use client' 보존)
 *
 * 실행: node scripts/migrate-console-to-logger.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');

// 변환 매핑
const MAP = {
  'console.log': 'logger.info',
  'console.info': 'logger.info',
  'console.warn': 'logger.warn',
  'console.error': 'logger.error',
  'console.debug': 'logger.debug',
};

const EXCLUDE_DIRS = new Set([
  'components/ui', // shadcn 원본 보존
  'lib/i18n', // 데이터 파일
]);

const EXCLUDE_FILES = new Set([
  'lib/logger.js', // 자체
  'lib/logger.test.js',
  'layout.js', // FOUC inline script 안 console (regex escape 문제 회피)
]);

const LOGGER_IMPORT_LINE = "import logger from '@/lib/logger';\n";

function shouldSkip(rel) {
  for (const dir of EXCLUDE_DIRS) {
    if (rel.startsWith(dir + '/') || rel === dir) return true;
  }
  if (EXCLUDE_FILES.has(rel)) return true;
  return false;
}

function walk(dir, list = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full, list);
    } else if (/\.(js|jsx)$/.test(name)) {
      list.push(full);
    }
  }
  return list;
}

function transform(src) {
  let out = src;
  let changed = false;

  // 단어 경계 매칭 (앞뒤로 식별자 문자 아닌 것)
  for (const [from, to] of Object.entries(MAP)) {
    const re = new RegExp(`(?<![a-zA-Z0-9_$.])${from.replace('.', '\\.')}(?=\\s*\\()`, 'g');
    if (re.test(out)) {
      out = out.replace(re, to);
      changed = true;
    }
  }

  if (!changed) return null;

  // logger import 추가 (없으면)
  if (!/from ['"]@\/lib\/logger['"]/.test(out)) {
    // 'use client'; 다음 줄, 또는 첫 import 다음
    const useClientMatch = out.match(/^(['"]use client['"];?\s*\n)/);
    if (useClientMatch) {
      const idx = useClientMatch[0].length;
      out = out.slice(0, idx) + '\n' + LOGGER_IMPORT_LINE + out.slice(idx);
    } else {
      out = LOGGER_IMPORT_LINE + out;
    }
  }

  return out;
}

function main() {
  const files = walk(APP_DIR);
  let changed = 0;
  let untouched = 0;
  for (const file of files) {
    const rel = path.relative(APP_DIR, file);
    if (shouldSkip(rel)) {
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    const next = transform(src);
    if (next == null) {
      untouched++;
      continue;
    }
    fs.writeFileSync(file, next);
    changed++;
    console.log('  ✓', rel);
  }
  console.log(`\nchanged: ${changed} / unchanged: ${untouched}`);
}

main();
