import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'app/api/v1/chat/completions/route.js'), 'utf8');

test('stable v1 Gemini proxy keeps API keys out of URLs and diagnostics', () => {
  assert.doesNotMatch(source, /\?key=\$\{(?:apiKey|nextApiKey)\}/);
  assert.match(source, /x-goog-api-key/);
  assert.match(source, /redactEndpointForLog\(modelServerUrl\)/);
  assert.doesNotMatch(source, /url:\s*modelServerUrl/);
});
