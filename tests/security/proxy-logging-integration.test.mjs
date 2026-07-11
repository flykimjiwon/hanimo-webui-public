import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function readProjectFile(path) {
  return readFile(join(root, path), 'utf8');
}

test('model-server proxy routes do not copy caller headers or log forwarded headers', async () => {
  for (const routePath of [
    'app/api/model-servers/chat/route.js',
    'app/api/model-servers/generate/route.js',
  ]) {
    const source = await readProjectFile(routePath);

    assert.doesNotMatch(source, /request\.headers\.forEach/, routePath);
    assert.doesNotMatch(source, /headersToForward/, routePath);
    assert.doesNotMatch(source, /Forwarded headers/i, routePath);
    assert.doesNotMatch(source, /MODEL SERVER(?: CHAT)? PROXY DEBUG/, routePath);
    assert.match(source, /buildProxyHeaders/, routePath);
    assert.match(source, /bearerToken:\s*endpointInfo\?\.apiKey/, routePath);
    assert.match(source, /buildOptions:\s*\(\{ endpointInfo \}\)/, routePath);
    assert.match(source, /onRetry:/, routePath);
  }
});

test('retry utility supports endpoint-specific options on retry without naming secrets in logs', async () => {
  const source = await readProjectFile('app/lib/retryUtils.js');

  assert.match(source, /buildOptions\s*=\s*null/);
  assert.match(source, /optionsForEndpoint\(nextEndpointInfo\)/);
  assert.match(source, /previousOptions:\s*currentOptions/);
  assert.doesNotMatch(source, /apiKey|Authorization|bearerToken/i);
});

test('external API logger stores metadata-only prompt content by default and redacts HTTP logs', async () => {
  const source = await readProjectFile('app/lib/externalApiLogger.js');

  assert.match(source, /HANIMO_LOG_PROMPT_CONTENT\s*===\s*'true'/);
  assert.match(source, /boundedContent\(value/);
  assert.match(source, /includeContent:\s*shouldLogPromptContent\(\)/);
  assert.match(source, /metadataOnly\(parsed\)/);
  assert.match(source, /redactRecursive\(maskSensitiveString\(parsed\)\)/);
  assert.match(source, /HANIMO_LOG_HTTP_CONTENT\s*!==\s*'true'/);
  assert.match(source, /normalizeAuthorizationMetadata\(logData\.authorization\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(logData\.messages\)/);
  assert.doesNotMatch(source, /truncateText\(logData\.prompt/);
  assert.doesNotMatch(source, /requestHeaders:\s*logData\.requestHeaders/);
  assert.doesNotMatch(source, /responseBody:\s*logData\.responseBody/);
});
