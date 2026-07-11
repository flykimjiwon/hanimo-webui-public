import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAllowedOutboundUrl,
  fetchWithOutboundPolicy,
  getOutboundTimeoutMs,
  isBlockedIpAddress,
  OutboundSecurityError,
  readLimitedJson,
} from '../../app/lib/security/outbound-policy.mjs';

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];

test('assertAllowedOutboundUrl allows public http/https and rejects credentials', async () => {
  assert.equal(
    await assertAllowedOutboundUrl('https://api.example.com/hook', {
      env: { HANIMO_SCREEN_ENDPOINT_ALLOWLIST: 'api.example.com' },
      resolveHostname: publicResolver,
    }),
    'https://api.example.com/hook'
  );

  await assert.rejects(
    () => assertAllowedOutboundUrl('https://user:pass@api.example.com/hook', { resolveHostname: publicResolver }),
    /인증 정보/
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('file:///etc/passwd', { resolveHostname: publicResolver }),
    /http\/https/
  );
});

test('assertAllowedOutboundUrl blocks local metadata private DNS and .local hosts', async () => {
  await assert.rejects(() => assertAllowedOutboundUrl('http://localhost:3000'), /비공개 네트워크|로컬/);
  await assert.rejects(() => assertAllowedOutboundUrl('http://metadata.google.internal'), /비공개 네트워크|로컬/);
  await assert.rejects(() => assertAllowedOutboundUrl('http://service.local'), /비공개 네트워크|로컬/);
  await assert.rejects(
    () => assertAllowedOutboundUrl('https://internal.example.com', {
      resolveHostname: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
    }),
    /비공개 네트워크/
  );
  await assert.rejects(
    () => assertAllowedOutboundUrl('https://dns-error.example.com', {
      resolveHostname: async () => {
        throw new Error('resolver leaked internal details');
      },
    }),
    (error) => {
      assert.equal(error instanceof OutboundSecurityError, true);
      assert.equal(error.message, 'custom endpoint DNS 조회에 실패했습니다.');
      assert.doesNotMatch(error.message, /leaked internal/);
      return true;
    }
  );
});

test('isBlockedIpAddress covers IPv4 and IPv6 private reserved multicast and mapped ranges', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'ff02::1',
  ]) {
    assert.equal(isBlockedIpAddress(address), true, address);
  }
  assert.equal(isBlockedIpAddress('93.184.216.34'), false);
  assert.equal(isBlockedIpAddress('2606:2800:220:1:248:1893:25c8:1946'), false);
});

test('fetchWithOutboundPolicy validates each redirect hop and bounds redirects', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url === 'https://api.example.com/start') {
      return new Response('', { status: 302, headers: { location: 'https://next.example.com/final' } });
    }
    return new Response('{"ok":true}', { status: 200 });
  };

  const response = await fetchWithOutboundPolicy('https://api.example.com/start', {}, {
    fetch: fakeFetch,
    allowlist: 'api.example.com,next.example.com',
    resolveHostname: publicResolver,
  });
  assert.deepEqual(calls, ['https://api.example.com/start', 'https://next.example.com/final']);
  assert.deepEqual(await readLimitedJson(response), { ok: true });

  await assert.rejects(
    () => fetchWithOutboundPolicy('https://api.example.com/start', {}, {
      fetch: async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
      allowlist: '',
      resolveHostname: publicResolver,
    }),
    /비공개 네트워크|로컬/
  );

  await assert.rejects(
    () => fetchWithOutboundPolicy('https://api.example.com/start', {}, {
      fetch: async () => new Response('', { status: 302, headers: { location: 'https://api.example.com/again' } }),
      maxRedirects: 1,
      resolveHostname: publicResolver,
    }),
    /redirect limit/
  );
});

test('fetchWithOutboundPolicy strips sensitive headers on cross-origin redirects', async () => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url, authorization: new Headers(init.headers).get('authorization') });
    if (requests.length === 1) {
      return new Response('', { status: 302, headers: { location: 'https://next.example.com/final' } });
    }
    return new Response('{}', { status: 200 });
  };

  await fetchWithOutboundPolicy('https://api.example.com/start', {
    headers: { Authorization: 'Bearer secret' },
  }, {
    fetch: fakeFetch,
    allowlist: 'api.example.com,next.example.com',
    resolveHostname: publicResolver,
  });

  assert.deepEqual(requests, [
    { url: 'https://api.example.com/start', authorization: 'Bearer secret' },
    { url: 'https://next.example.com/final', authorization: null },
  ]);
});

test('fetchWithOutboundPolicy composes timeout with caller signal and cancels redirect bodies', async () => {
  const callerController = new AbortController();
  let observedSignal;
  await assert.rejects(
    () => fetchWithOutboundPolicy('https://api.example.com/slow', { signal: callerController.signal }, {
      timeoutMs: 5,
      resolveHostname: publicResolver,
      fetch: async (_url, init) => {
        observedSignal = init.signal;
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(init.signal.reason || new Error('aborted')), { once: true });
        });
      },
    }),
    /aborted|Abort/
  );
  assert.equal(observedSignal.aborted, true);
  assert.equal(callerController.signal.aborted, false);

  let canceled = false;
  await fetchWithOutboundPolicy('https://api.example.com/start', {}, {
    allowlist: 'api.example.com,next.example.com',
    resolveHostname: publicResolver,
    fetch: async (url) => {
      if (url === 'https://api.example.com/start') {
        return new Response(new ReadableStream({
          cancel() {
            canceled = true;
          },
        }), { status: 302, headers: { location: 'https://next.example.com/final' } });
      }
      return new Response('{}', { status: 200 });
    },
  });
  assert.equal(canceled, true);
});

test('getOutboundTimeoutMs uses defaults and caps configured timeout', () => {
  assert.equal(getOutboundTimeoutMs({}), 10000);
  assert.equal(getOutboundTimeoutMs({ HANIMO_SCREEN_ENDPOINT_TIMEOUT_MS: '60000' }), 30000);
  assert.equal(getOutboundTimeoutMs({ HANIMO_SCREEN_ENDPOINT_TIMEOUT_MS: '2500' }), 2500);
});

test('readLimitedJson rejects oversized responses before and during reads', async () => {
  await assert.rejects(
    () => readLimitedJson(new Response('123456789', { headers: { 'content-length': '9' } }), 8),
    /너무 큽니다/
  );
  await assert.rejects(() => readLimitedJson(new Response('123456789'), 8), /너무 큽니다/);
});
