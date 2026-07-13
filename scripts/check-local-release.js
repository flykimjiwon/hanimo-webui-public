const { runLocalReleaseFixture } = require('./lib/local-release-fixture');

runLocalReleaseFixture().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
