const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const LABS_ENABLED = process.env.HANIMO_ENABLE_LABS === 'true';

const CORE_PAGE_CHECKS = [
  ['/', 200],
  ['/login', 200],
  ['/chat', 200],
  ['/board', 200],
  ['/notice', 200],
  ['/profile', 200],
  ['/my-api-keys', 200],
  ['/my-api-tokens', 200],
  ['/setup', 200],
  ['/signup', 200],
  ['/sso', 200],
];

const LABS_PAGE_CHECKS = [
  ['/workflow', LABS_ENABLED ? 200 : 404],
  ['/screen-builder', LABS_ENABLED ? 200 : 404],
];

const API_CHECKS = [
  ['/api/public/settings', 200],
  ['/api/admin/dashboard', 401],
  ['/api/admin/db-reset', 401],
  ['/api/admin/db-restore', 401],
  ['/api/v1/models', 401],
  ['/api/v1/chat/completions', 401],
  ['/api/workflows', LABS_ENABLED ? 401 : 404],
  ['/api/screens', LABS_ENABLED ? 401 : 404],
  ['/api/screens/smoke-screen/execute', LABS_ENABLED ? 401 : 404, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpointId: 'missing', inputValues: {} }),
  }],
];

async function check(pathname, expectedStatus, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    ...options,
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} expected ${expectedStatus}, got ${response.status}`);
  }
  console.log(`${pathname} ${response.status}`);
}

async function checkStaticAssets() {
  const response = await fetch(`${BASE_URL}/login`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  const html = await response.text();
  const match = html.match(/src="([^"]*\/_next\/static\/[^"]+\.js)"/);
  if (!match) {
    throw new Error('/login should reference at least one Next static JS asset');
  }
  const assetResponse = await fetch(`${BASE_URL}${match[1]}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (assetResponse.status !== 200) {
    throw new Error(`${match[1]} expected 200, got ${assetResponse.status}`);
  }
  console.log(`${match[1]} ${assetResponse.status}`);
}

async function main() {
  for (const [pathname, status] of CORE_PAGE_CHECKS) {
    await check(pathname, status);
  }
  for (const [pathname, status] of LABS_PAGE_CHECKS) {
    await check(pathname, status);
  }

  const adminResponse = await fetch(`${BASE_URL}/admin`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  if (![307, 308].includes(adminResponse.status)) {
    throw new Error(`/admin expected redirect, got ${adminResponse.status}`);
  }
  const location = adminResponse.headers.get('location') || '';
  if (!location.includes('/login')) {
    throw new Error(`/admin redirect should point to /login, got ${location}`);
  }
  console.log(`/admin ${adminResponse.status}`);

  for (const [pathname, status, options] of API_CHECKS) {
    await check(pathname, status, options);
  }

  await checkStaticAssets();

  console.log(`smoke route checks passed for ${BASE_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
