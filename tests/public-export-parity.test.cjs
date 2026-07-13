const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const CHECKER = path.resolve(__dirname, '../scripts/check-public-export.js');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commitRepository(root, files) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'qa@hanimo.test']);
  git(root, ['config', 'user.name', 'Hanimo QA']);
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
  }
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hanimo-public-parity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const canonical = path.join(root, 'canonical');
  const publicRoot = path.join(root, 'public');
  commitRepository(canonical, { 'app.txt': 'same\n' });
  const sourceCommit = git(canonical, ['rev-parse', 'HEAD']);
  const sha256 = crypto.createHash('sha256').update('same\n').digest('hex');
  commitRepository(publicRoot, {
    'app.txt': 'same\n',
    'PUBLIC_RELEASE_MANIFEST.json': `${JSON.stringify({ dirty: false, sourceCommit, files: [{ path: 'app.txt', sha256 }] })}\n`,
  });
  return { canonical, publicRoot, sourceCommit };
}

function verify({ canonical, publicRoot, sourceCommit }) {
  return spawnSync(process.execPath, [
    CHECKER,
    '--canonical', canonical,
    '--public', publicRoot,
    '--require-manifest',
    '--source-commit', sourceCommit,
  ], { encoding: 'utf8' });
}

test('Given a nested public checkout, cross-tree parity ignores the canonical untracked sibling', (t) => {
  const roots = fixture(t);
  commitRepository(path.join(roots.canonical, 'hanimo-webui-public'), { 'nested.txt': 'checkout\n' });

  const result = verify(roots);

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /missing: hanimo-webui-public\//);
});

test('Given an incomplete manifest, public parity rejects the exported file set', (t) => {
  const roots = fixture(t);
  fs.writeFileSync(
    path.join(roots.publicRoot, 'PUBLIC_RELEASE_MANIFEST.json'),
    `${JSON.stringify({ dirty: false, sourceCommit: roots.sourceCommit, files: [] })}\n`
  );

  const result = verify(roots);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /manifest file set mismatch/i);
});
