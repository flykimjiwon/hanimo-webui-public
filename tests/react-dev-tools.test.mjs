import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('React runtime tooling is dynamically imported only behind the development opt-out gate', () => {
  const source = read('app/components/dev/ReactDevTools.js');
  const developmentGate = source.indexOf("process.env.NODE_ENV === 'development'");
  const optOutGate = source.indexOf("process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== '1'");
  const earlyReturn = source.indexOf('if (!enabled) return undefined;');
  const grabImport = source.indexOf("import('react-grab')");
  const scanImport = source.indexOf("import('react-scan')");

  assert.match(source, /^'use client';/);
  assert.ok(developmentGate >= 0 && optOutGate > developmentGate);
  assert.ok(earlyReturn > optOutGate && grabImport > earlyReturn && scanImport > earlyReturn);
  assert.equal(source.match(/import\('react-grab'\)/g)?.length, 1);
  assert.match(source, /await import\('react-grab'\);/);
  assert.doesNotMatch(source, /reactGrab|\.init\(\)/);
  assert.match(source, /const \{ scan \} = await import\('react-scan'\);[\s\S]*scan\(\{ enabled: true \}\);/);
  assert.doesNotMatch(source, /^import .* from ['"]react-(?:grab|scan)['"];?$/m);
  assert.doesNotMatch(source, /unpkg\.com|https?:\/\//);
});

test('production layout path neither renders nor starts the React runtime tooling', () => {
  const layout = read('app/layout.js');

  assert.match(layout, /import ReactDevTools from ['"]\.\/components\/dev\/ReactDevTools['"];?/);
  assert.match(
    layout,
    /process\.env\.NODE_ENV === ['"]development['"][\s\S]*NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== ['"]1['"]/
  );
  assert.match(layout, /\{enableReactDevTools \? <ReactDevTools \/> : null\}/);
});

test('production webpack excludes dev-only React tooling from its module graph', () => {
  const nextConfig = read('next.config.mjs');

  assert.match(nextConfig, /webpack:\s*\(config,\s*\{\s*dev,\s*isServer\s*\}\)\s*=>/);
  assert.match(
    nextConfig,
    /if\s*\(!dev\)[\s\S]*['"]react-grab['"]:\s*false[\s\S]*['"]react-scan['"]:\s*false/
  );
});

test('all three tools are local devDependencies and react-doctor is script-only', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageLock = JSON.parse(read('package-lock.json'));

  for (const [packageName, version] of Object.entries({
    'react-grab': '0.1.48',
    'react-scan': '0.5.7',
    'react-doctor': '0.7.6',
  })) {
    assert.equal(packageJson.devDependencies[packageName], `^${version}`);
    assert.equal(packageJson.dependencies[packageName], undefined);
    assert.equal(packageLock.packages[`node_modules/${packageName}`].version, version);
    assert.equal(packageLock.packages[`node_modules/${packageName}`].dev, true);
  }

  assert.equal(packageJson.scripts['react:doctor'], 'react-doctor');
});
