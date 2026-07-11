import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  areLabsEnabled,
  filterStableMenus,
  isLabsPath,
  isStableCorePath,
} from '../../app/lib/release-surface.mjs';

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
