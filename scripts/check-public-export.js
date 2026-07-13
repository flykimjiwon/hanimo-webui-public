const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { listReleaseFiles } = require('./public-export-policy');

function digest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs() {
  let canonical = null;
  let publicRoot = null;
  let requireManifest = false;
  let sourceCommit = null;
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === '--canonical') canonical = path.resolve(process.argv[++index]);
    else if (arg === '--public') publicRoot = path.resolve(process.argv[++index]);
    else if (arg === '--require-manifest') requireManifest = true;
    else if (arg === '--source-commit') sourceCommit = process.argv[++index];
    else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node scripts/check-public-export.js [--canonical PATH --public PATH]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { canonical, publicRoot, requireManifest, sourceCommit };
}

function validateManifest(publicRoot, expectedSourceCommit) {
  const manifestPath = path.join(publicRoot, 'PUBLIC_RELEASE_MANIFEST.json');
  if (!fs.existsSync(manifestPath)) throw new Error('PUBLIC_RELEASE_MANIFEST.json is required.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.dirty !== false) throw new Error('Public release manifest must come from a clean source tree.');
  if (expectedSourceCommit && manifest.sourceCommit !== expectedSourceCommit) {
    throw new Error(`Manifest source commit mismatch: expected ${expectedSourceCommit}, got ${manifest.sourceCommit || 'missing'}.`);
  }
  for (const entry of manifest.files || []) {
    const filePath = path.join(publicRoot, entry.path);
    if (!fs.existsSync(filePath) || digest(filePath) !== entry.sha256) {
      throw new Error(`Manifest digest mismatch: ${entry.path}`);
    }
  }
  return manifest;
}

function findExisting(candidates) {
  return candidates.map((candidate) => path.resolve(candidate)).find((candidate) => fs.existsSync(candidate));
}

function resolveRoots() {
  const args = parseArgs();
  if (args.canonical && args.publicRoot) return args;
  const cwd = process.cwd();
  const isPublic = path.basename(cwd).endsWith('-public');
  const canonical = isPublic
    ? findExisting([path.join(cwd, 'hanimo-webui'), path.join(cwd, '..', 'hanimo-webui')])
    : cwd;
  const publicRoot = isPublic
    ? cwd
    : findExisting([path.join(cwd, 'hanimo-webui-public'), path.join(cwd, '..', 'hanimo-webui-public')]);
  if (!canonical || !publicRoot) {
    throw new Error('Could not locate canonical/public trees. Pass --canonical and --public explicitly.');
  }
  return { canonical, publicRoot };
}

function main() {
  const args = parseArgs();
  const { canonical, publicRoot } = resolveRoots();
  const manifest = args.requireManifest
    ? validateManifest(publicRoot, args.sourceCommit)
    : null;
  const canonicalFiles = listReleaseFiles(canonical);
  const publicFiles = listReleaseFiles(publicRoot, { includeUntracked: true });
  if (manifest) {
    const manifestFiles = (manifest.files || []).map((entry) => entry.path).sort((a, b) => a.localeCompare(b));
    if (
      manifestFiles.length !== publicFiles.length
      || manifestFiles.some((file, index) => file !== publicFiles[index])
    ) {
      throw new Error('Manifest file set mismatch with public export.');
    }
  }
  const expected = new Set(canonicalFiles);
  const actual = new Set(publicFiles);
  const findings = [];

  for (const relativePath of canonicalFiles) {
    const publicPath = path.join(publicRoot, relativePath);
    if (!actual.has(relativePath) || !fs.existsSync(publicPath)) {
      findings.push(`missing: ${relativePath}`);
      continue;
    }
    if (digest(path.join(canonical, relativePath)) !== digest(publicPath)) {
      findings.push(`content mismatch: ${relativePath}`);
    }
  }
  for (const relativePath of publicFiles) {
    if (!expected.has(relativePath)) findings.push(`unexpected public file: ${relativePath}`);
  }

  if (findings.length > 0) {
    console.error(`public export drift: ${findings.length} finding(s)`);
    for (const finding of findings.slice(0, 200)) console.error(`- ${finding}`);
    if (findings.length > 200) console.error(`- ... ${findings.length - 200} more`);
    process.exit(1);
  }
  console.log(`public export parity passed: ${canonicalFiles.length} files`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
