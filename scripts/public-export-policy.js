const { execFileSync } = require('child_process');
const path = require('path');

const POLICY_VERSION = 1;
const EXCLUDED_PREFIXES = [
  '.playwright-cli/',
  'webui_design/',
  'hanimo_webui_',
  ['docs/T', 'ECHAI_SYNC'].join(''),
  'docs/session-prompts.html',
];
const EXCLUDED_NAMES = new Set([
  'HANIMO_WEBUI_PATTERNS.md',
  'docs/HANIMO_WEBUI_ARCHITECTURE_STACK_SCAN_2026-06-29.html',
  'PUBLIC_RELEASE_MANIFEST.json',
  'QUICK_REFERENCE.md',
  'results.tsv',
  'run.log',
  'run2.log',
  'yarn.lock',
]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isExcluded(relativePath) {
  const normalized = normalize(relativePath);
  if (EXCLUDED_NAMES.has(normalized)) return true;
  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  return normalized.endsWith('.traineddata') || normalized.endsWith('.zip');
}

function listReleaseFiles(rootDir, { includeUntracked = false } = {}) {
  const args = includeUntracked
    ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard']
    : ['ls-files', '-z'];
  const stdout = execFileSync('git', args, { cwd: rootDir });
  return [...new Set(stdout.toString('utf8').split('\0').filter(Boolean).map(normalize))]
    .filter((filePath) => !isExcluded(filePath))
    .sort((a, b) => a.localeCompare(b));
}

module.exports = {
  POLICY_VERSION,
  isExcluded,
  listReleaseFiles,
};
