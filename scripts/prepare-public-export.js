#!/usr/bin/env node
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { POLICY_VERSION, listReleaseFiles } = require('./public-export-policy');

const rootDir = path.resolve(__dirname, '..');
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
let outDir = path.resolve(rootDir, '..', `hanimo-webui-public-export-${timestamp}`);
let allowDirty = false;

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
  if (arg === '--allow-dirty') {
    allowDirty = true;
    continue;
  }
  if (arg === '-h' || arg === '--help') {
    console.log('Usage: node scripts/prepare-public-export.js [--out PATH] [--allow-dirty]');
    process.exit(0);
  }
  console.error(`Error: unknown option: ${arg}`);
  process.exit(2);
}

function assertCleanSource() {
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' });
  if (status.trim() && !allowDirty) {
    console.error('Error: canonical source is dirty. Commit the release source or pass --allow-dirty for local verification.');
    process.exit(2);
  }
  return Boolean(status.trim());
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

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeManifest(relativePaths, dirty) {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  const manifest = {
    schemaVersion: 1,
    policyVersion: POLICY_VERSION,
    sourceRepository: 'flykimjiwon/hanimo-webui',
    sourceCommit,
    dirty,
    files: relativePaths.map((relativePath) => ({
      path: relativePath,
      sha256: digest(path.join(outDir, relativePath)),
    })),
  };
  fs.writeFileSync(
    path.join(outDir, 'PUBLIC_RELEASE_MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function main() {
  const dirty = assertCleanSource();
  ensureEmptyOutput();
  const releaseFiles = listReleaseFiles(rootDir, { includeUntracked: allowDirty });
  for (const relativePath of releaseFiles) copyTrackedFile(relativePath);
  writeManifest(releaseFiles, dirty);
  runScan();
  console.log(`public export ready: ${outDir}`);
  console.log(`release files exported: ${releaseFiles.length}`);
  console.log(`source commit: ${execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim()}`);
}

main();
