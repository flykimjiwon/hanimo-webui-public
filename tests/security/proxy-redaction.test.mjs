import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProxyHeaders } from '../../app/lib/security/proxy-headers.mjs';
import { boundedContent, redactRecursive } from '../../app/lib/security/redaction.mjs';

test('buildProxyHeaders never copies caller headers and only adds selected bearer token', () => {
  const callerHeaders = {
    Authorization: 'Bearer caller',
    Cookie: 'session=secret',
    'X-Forwarded-For': '127.0.0.1',
  };

  const headers = buildProxyHeaders({ callerHeaders, bearerToken: ' server-token ' });
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer server-token',
  });
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers['X-Forwarded-For'], undefined);
});

test('redactRecursive handles case-insensitive keys, embedded credentials, and cycles', () => {
  const value = {
    ApiKey: 'secret',
    proxyAuthorization: 'Basic abc',
    'Proxy-Authorization': 'Basic abc',
    accessToken: 'access',
    access_token: 'access',
    refreshToken: 'refresh',
    refresh_token: 'refresh',
    clientSecret: 'client',
    client_secret: 'client',
    apiToken: 'api',
    api_token: 'api',
    'x-goog-api-key': 'gemini',
    'x-api-key': 'anthropic',
    'api-key': 'azure',
    tokenCount: 4,
    nested: {
      message: 'send Bearer abc.def and Basic dXNlcjpwYXNz',
    },
  };
  value.self = value;

  const redacted = redactRecursive(value);
  assert.equal(redacted.ApiKey, '[REDACTED]');
  assert.equal(redacted.proxyAuthorization, '[REDACTED]');
  assert.equal(redacted['Proxy-Authorization'], '[REDACTED]');
  assert.equal(redacted.accessToken, '[REDACTED]');
  assert.equal(redacted.access_token, '[REDACTED]');
  assert.equal(redacted.refreshToken, '[REDACTED]');
  assert.equal(redacted.refresh_token, '[REDACTED]');
  assert.equal(redacted.clientSecret, '[REDACTED]');
  assert.equal(redacted.client_secret, '[REDACTED]');
  assert.equal(redacted.apiToken, '[REDACTED]');
  assert.equal(redacted.api_token, '[REDACTED]');
  assert.equal(redacted['x-goog-api-key'], '[REDACTED]');
  assert.equal(redacted['x-api-key'], '[REDACTED]');
  assert.equal(redacted['api-key'], '[REDACTED]');
  assert.equal(redacted.tokenCount, 4);
  assert.equal(redacted.nested.message, 'send Bearer [REDACTED] and Basic [REDACTED]');
  assert.equal(redacted.self, '[Circular]');
});

test('boundedContent defaults to metadata only and bounds opt-in content', () => {
  assert.deepEqual(boundedContent({ token: 'secret', a: 1 }), { type: 'object', keys: 2 });
  assert.deepEqual(
    boundedContent({ token: 'secret', text: 'abcdef' }, { includeContent: true, maxChars: 20 }),
    {
      content: '{"token":"[REDACTED]...[truncated]',
      truncated: true,
      chars: 38,
    }
  );
  assert.deepEqual(boundedContent(123n, { includeContent: true }), {
    content: '123',
    truncated: false,
    chars: 3,
  });
  assert.deepEqual(boundedContent(Buffer.from('abc')), { type: 'buffer', bytes: 3 });
});
