import assert from 'node:assert/strict';
import test from 'node:test';

import { bypassesSessionJwt } from '../../app/lib/security/auth-boundary.mjs';

test('API-token routes bypass session JWT middleware while unrelated API routes stay protected', () => {
  // Given: OpenAI-compatible API-token paths and ordinary session-authenticated API paths.
  const apiTokenPaths = ['/api/v1/models', '/api/v1/chat/completions'];
  const sessionPaths = ['/api/models', '/api/admin/settings', '/v1/models'];

  // When: the middleware auth boundary classifies each path.
  const apiTokenDecisions = apiTokenPaths.map(bypassesSessionJwt);
  const sessionDecisions = sessionPaths.map(bypassesSessionJwt);

  // Then: only the route-owned API-token namespace bypasses session JWT verification.
  assert.deepEqual(apiTokenDecisions, [true, true]);
  assert.deepEqual(sessionDecisions, [false, false, false]);
});
