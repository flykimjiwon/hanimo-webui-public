#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let rootDir = process.cwd();
let trackedOnly = false;

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--tracked') {
    trackedOnly = true;
    continue;
  }
  if (arg === '-h' || arg === '--help') {
    console.log('Usage: node scripts/scan-public-release.js [--tracked] [ROOT]');
    process.exit(0);
  }
  rootDir = path.resolve(arg);
}

const ignoredDirs = new Set([
  '.git',
  '.next',
  '.sisyphus',
  '.omc',
  '.agent',
  '.agents',
  '.claude',
  'node_modules',
  'logs',
  'test-results',
  'webui_design',
]);
const ignoredFiles = new Set(['package-lock.json']);
const ignoredSuffixes = [
  '.bundle',
  '.gif',
  '.ico',
  '.jpg',
  '.jpeg',
  '.lock',
  '.pdf',
  '.png',
  '.traineddata',
  '.webp',
  '.zip',
];

const blockedTerms = [
  'tech' + 'ai',
  'sh' + 'gpt',
  'shin' + 'han',
  '신' + '한',
  'Tech' + '혁신',
  '디지털' + '개인',
  '디지털' + '라이프',
  '디지털' + '뱅킹',
  '사' + '내',
];

const secretPatterns = [
  ['OpenAI key', new RegExp('s' + 'k-[A-Za-z0-9_-]{20,}')],
  ['GitHub token', new RegExp('g' + 'hp_[A-Za-z0-9_]{20,}')],
  ['Google API key', new RegExp('A' + 'Iza[0-9A-Za-z_-]{20,}')],
  ['private key', /BEGIN [A-Z ]*PRIVATE KEY/],
];

function isIgnoredFile(filePath) {
  const baseName = path.basename(filePath);
  if (baseName === '.env' || baseName.startsWith('.env.')) return true;
  if (ignoredFiles.has(baseName)) return true;
  if (ignoredSuffixes.some((suffix) => baseName.endsWith(suffix))) return true;
  return filePath.split(path.sep).some((part) =>
    ignoredDirs.has(part) || part.startsWith('.bak.') || part.startsWith('hanimo_webui_')
  );
}

function walk(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootDir, fullPath);
    if (isIgnoredFile(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function scanFile(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  for (const term of blockedTerms) {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index >= 0) {
      const line = text.slice(0, index).split('\n').length;
      findings.push(`${relativePath}:${line}: blocked term "${term}"`);
    }
  }

  for (const [label, pattern] of secretPatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined) {
      const line = text.slice(0, match.index).split('\n').length;
      findings.push(`${relativePath}:${line}: possible ${label}`);
    }
  }

  return findings;
}

function listTrackedFiles() {
  const stdout = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => !isIgnoredFile(relativePath))
    .map((relativePath) => path.join(rootDir, relativePath));
}

function main() {
  if (!fs.existsSync(rootDir)) {
    console.error(`scan root not found: ${rootDir}`);
    process.exit(2);
  }

  const findings = [];
  const filePaths = trackedOnly ? listTrackedFiles() : walk(rootDir);
  for (const filePath of filePaths) {
    try {
      findings.push(...scanFile(filePath));
    } catch (error) {
      findings.push(`${path.relative(rootDir, filePath)}: unreadable text file: ${error.message}`);
    }
  }

  if (findings.length > 0) {
    console.error(findings.join('\n'));
    console.error(`public release scan failed: ${findings.length} finding(s)`);
    process.exit(1);
  }

  console.log(`public release scan passed: ${rootDir}`);
}

main();
