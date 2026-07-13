const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { runLocalReleaseFixture } = require('./lib/local-release-fixture');

const rootDir = path.join(__dirname, '..');

function buildProduction() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: 'production', SKIP_DB_CONNECTION: 'true' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Production build failed with exit ${result.status}`);
}

async function main() {
  if (process.env.PRODUCTION_CHECK_SKIP_BUILD !== 'true') buildProduction();
  await runLocalReleaseFixture();
  console.log('[production-check] production install check passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
