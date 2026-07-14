import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const resolvedRef = '0123456789abcdef0123456789abcdef01234567';

function writeExecutable(path, source) {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function bootstrapFixture({ existingDirtyCheckout = false, fetchedRef = resolvedRef } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hanimo-bootstrap-test-'));
  const binDir = join(root, 'bin');
  const installDir = join(root, 'install');
  mkdirSync(binDir);

  if (existingDirtyCheckout) {
    mkdirSync(join(installDir, '.git'), { recursive: true });
    writeFileSync(join(installDir, '.dirty'), 'user change');
  }

  writeExecutable(join(binDir, 'docker'), '#!/usr/bin/env bash\nexit 0\n');
  writeExecutable(
    join(binDir, 'git'),
    `#!/usr/bin/env bash
set -e
if [[ "$1" == "clone" ]]; then
  dest="\${@: -1}"
  mkdir -p "$dest/.git" "$dest/scripts"
  cat > "$dest/scripts/install.sh" <<'INSTALL'
#!/usr/bin/env bash
printf 'INSTALL_OK %s\\n' "$*"
INSTALL
  chmod +x "$dest/scripts/install.sh"
  exit 0
fi
if [[ "$1" == "-C" ]]; then
  dir="$2"
  shift 2
  case "$1" in
    fetch) exit 0 ;;
    rev-parse) printf '%s\\n' '${fetchedRef}'; exit 0 ;;
    status)
      if [[ -f "$dir/.dirty" || ! -f "$dir/.checked-out" ]]; then
        printf 'D  README.md\\n'
      fi
      exit 0
      ;;
    checkout) touch "$dir/.checked-out"; exit 0 ;;
  esac
fi
printf 'unexpected fake git invocation: %s\\n' "$*" >&2
exit 2
`
  );

  return { root, binDir, installDir };
}

function runBootstrap(fixture) {
  return spawnSync(
    'bash',
    ['scripts/bootstrap.sh', '--yes', '--dir', fixture.installDir, '--ref', resolvedRef],
    {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture.binDir}:${process.env.PATH}`,
        HANIMO_REPOSITORY_URL: 'https://example.invalid/hanimo-webui.git',
      },
    }
  );
}

test('fresh bootstrap checks out the fetched revision before running the installer', () => {
  const result = runBootstrap(bootstrapFixture());
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Installed source: 0123456789abcdef/);
  assert.match(result.stdout, /INSTALL_OK --yes/);
});

test('bootstrap still rejects an existing checkout with user changes', () => {
  const result = runBootstrap(bootstrapFixture({ existingDirtyCheckout: true }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /install checkout has local changes/);
});

test('bootstrap rejects a fetched revision that differs from the requested pinned SHA', () => {
  const result = runBootstrap(bootstrapFixture({
    fetchedRef: 'fedcba9876543210fedcba9876543210fedcba98',
  }));
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /fetched revision does not match the requested commit/);
  assert.doesNotMatch(result.stdout, /INSTALL_OK/);
});

test('published bootstrap checksums match the current script', () => {
  const root = new URL('../..', import.meta.url);
  const bootstrap = readFileSync(new URL('scripts/bootstrap.sh', root));
  const checksum = createHash('sha256').update(bootstrap).digest('hex');
  for (const path of ['docs/OPERATIONS.md', 'docs/MANUAL_DOCKER_QA.md']) {
    const documentation = readFileSync(new URL(path, root), 'utf8');
    assert.match(documentation, new RegExp(checksum));
  }
});
