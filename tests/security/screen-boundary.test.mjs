import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'app/api/screens/[id]/execute/route.js'), 'utf8');

test('Screen custom endpoints use the shared outbound policy transport', () => {
  assert.match(source, /fetchWithOutboundPolicy\(safeUrl/);
  assert.doesNotMatch(source, /fetch\(safeUrl/);
  assert.match(source, /assertAllowedOutboundUrl\(endpoint\.url\)/);
});
