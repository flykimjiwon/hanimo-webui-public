import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SECURITY_MANIFEST } from '../../scripts/check-security-parity.mjs';
import {
  areLabsEnabled,
  filterStableMenus,
  isLabsPath,
  isStableCorePath,
} from '../../app/lib/release-surface.mjs';

const require = createRequire(import.meta.url);
const { listReleaseFiles } = require('../../scripts/public-export-policy.js');

test('release surface keeps Labs out of stable navigation recursively', () => {
  assert.equal(isStableCorePath('/workflow'), false);
  assert.equal(isStableCorePath('/screen-builder/demo'), false);
  assert.equal(isStableCorePath('/rag'), false);
  assert.equal(isStableCorePath('/community/roadmap'), false);
  assert.equal(isStableCorePath('/board/post/1'), true);
  const menus = filterStableMenus([
    { id: 'chat', link: '/', children: [] },
    { id: 'labs', link: '', children: [{ id: 'workflow', link: '/workflow', children: [] }] },
    { id: 'mixed', link: '', children: [{ id: 'profile', link: '/profile', children: [] }] },
  ]);
  assert.deepEqual(menus.map((menu) => menu.id), ['chat', 'mixed']);
  assert.deepEqual(menus[1].children.map((child) => child.id), ['profile']);
});

test('Labs routes are default-off and enforced before public/auth routing', async () => {
  assert.equal(areLabsEnabled({}), false);
  assert.equal(areLabsEnabled({ HANIMO_ENABLE_LABS: 'false' }), false);
  assert.equal(areLabsEnabled({ HANIMO_ENABLE_LABS: 'true' }), true);

  for (const path of [
    '/workflow',
    '/screen-builder/demo',
    '/s/shared-screen',
    '/api/workflows/123/execute',
    '/api/screens/share/abc',
    '/admin/agents',
    '/api/admin/agents/settings',
  ]) {
    assert.equal(isLabsPath(path), true, path);
  }
  assert.equal(isLabsPath('/api/v1/chat/completions'), false);
  assert.equal(isLabsPath('/board'), false);

  const middleware = await readFile(new URL('../../middleware.js', import.meta.url), 'utf8');
  const labsGateIndex = middleware.indexOf('!areLabsEnabled() && isLabsPath(pathname)');
  assert.ok(labsGateIndex >= 0);
  assert.ok(labsGateIndex < middleware.indexOf('if (isPublic(pathname))'));
  assert.match(middleware, /status:\s*404/);
});

test('Given local agent state, public export and security parity exclude .omo', () => {
  const root = new URL('../..', import.meta.url).pathname;
  const releaseFiles = listReleaseFiles(root, { includeUntracked: true });

  assert.equal(releaseFiles.some((file) => file === '.omo' || file.startsWith('.omo/')), false);
  assert.equal(SECURITY_MANIFEST.some((file) => file === '.omo' || file.startsWith('.omo/')), false);
});
