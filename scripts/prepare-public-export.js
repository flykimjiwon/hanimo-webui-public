#!/usr/bin/env node
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
let outDir = path.resolve(rootDir, '..', `hanimo-webui-public-export-${timestamp}`);

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--out') {
    if (!process.argv[i + 1]) {
      console.error('Error: --out requires a path.');
      process.exit(2);
    }
    outDir = path.resolve(process.argv[i + 1]);
    i += 1;
    continue;
  }
  if (arg === '-h' || arg === '--help') {
    console.log('Usage: node scripts/prepare-public-export.js [--out PATH]');
    process.exit(0);
  }
  console.error(`Error: unknown option: ${arg}`);
  process.exit(2);
}

const excludedPrefixes = [
  'webui_design/',
  'hanimo_webui_',
  ['docs/T', 'ECHAI_SYNC'].join(''),
  'docs/session-prompts.html',
];
const excludedNames = new Set([
  'HANIMO_WEBUI_PATTERNS.md',
  'QUICK_REFERENCE.md',
  'results.tsv',
  'run.log',
  'run2.log',
  'yarn.lock',
]);

function isExcluded(relativePath) {
  if (excludedNames.has(relativePath)) return true;
  if (excludedPrefixes.some((prefix) => relativePath.startsWith(prefix))) return true;
  return relativePath.endsWith('.traineddata') || relativePath.endsWith('.zip');
}

function listTrackedFiles() {
  const stdout = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir });
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((filePath) => !isExcluded(filePath));
}

function ensureEmptyOutput() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    return;
  }
  const entries = fs.readdirSync(outDir);
  if (entries.length > 0) {
    console.error(`Error: output directory is not empty: ${outDir}`);
    process.exit(2);
  }
}

function copyTrackedFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const targetPath = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function runScan() {
  const result = spawnSync(process.execPath, [path.join(rootDir, 'scripts', 'scan-public-release.js'), outDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

function main() {
  ensureEmptyOutput();
  const trackedFiles = listTrackedFiles();
  for (const relativePath of trackedFiles) copyTrackedFile(relativePath);
  runScan();
  console.log(`public export ready: ${outDir}`);
  console.log(`tracked files exported: ${trackedFiles.length}`);
}

main();
