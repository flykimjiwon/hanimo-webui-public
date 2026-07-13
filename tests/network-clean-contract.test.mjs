import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin round-robin checks use the authenticated request helper', async () => {
  const [modelConfig, roundRobin] = await Promise.all([
    source('app/admin/models/hooks/useModelConfig.js'),
    source('app/admin/models/hooks/useRoundRobin.js'),
  ]);

  for (const [name, contents] of Object.entries({ modelConfig, roundRobin })) {
    const endpointCalls = contents.match(/\/api\/admin\/check-round-robin/g) || [];
    const authenticatedCalls = contents.match(
      /TokenManager\.safeFetch\(\s*`\/api\/admin\/check-round-robin/g
    ) || [];
    assert.ok(endpointCalls.length > 0, `${name} retains round-robin checks`);
    assert.equal(authenticatedCalls.length, endpointCalls.length, `${name} authenticates every round-robin check`);
  }
});

test('regular chat derives round-robin display without calling an admin endpoint', async () => {
  const modelSelector = await source('app/components/chat/ModelSelector.js');

  assert.doesNotMatch(modelSelector, /\/api\/admin\/check-round-robin/);
  assert.match(modelSelector, /getRoundRobinGroupInfo\(selectedRoundRobinModels\)/);
});

test('chat settings requests authenticate while global theme settings stay public', async () => {
  const [home, sharedChat, siteSettings, publicSettingsRoute] = await Promise.all([
    source('app/page.js'),
    source('app/hooks/useChatPage.js'),
    source('app/components/SiteSettings.js'),
    source('app/api/public/settings/route.js'),
  ]);

  for (const [name, contents] of Object.entries({ home, sharedChat })) {
    assert.doesNotMatch(
      contents,
      /(?<!TokenManager\.safe)fetch\(\s*['"]\/api\/admin\/settings['"]/,
      `${name} has no unauthenticated admin settings request`
    );
    assert.match(
      contents,
      /TokenManager\.safeFetch\(\s*['"]\/api\/admin\/settings['"]/
    );
  }

  assert.match(siteSettings, /fetch\(\s*['"]\/api\/public\/settings['"]/);
  assert.doesNotMatch(siteSettings, /\/api\/admin\/settings/);
  assert.match(publicSettingsRoute, /themePreset:/);
  assert.match(publicSettingsRoute, /themeColors:/);
  assert.doesNotMatch(publicSettingsRoute, /openaiCompatApiKey:/);
  assert.doesNotMatch(publicSettingsRoute, /customEndpoints:/);
});

test('null site favicon preserves the canonical generated icon route', async () => {
  const settings = await source('app/components/SiteSettings.js');
  const layout = await source('app/layout.js');

  assert.match(settings, /: '\/icon\.svg';/);
  assert.doesNotMatch(settings, /: '\/favicon\.ico';/);
  assert.match(layout, /url: '\/icon\.svg'/);
});

test('canonical generated favicon is a tracked SVG source', async () => {
  const icon = await source('app/icon.svg');

  assert.match(icon, /<svg\b/);
  assert.match(icon, /viewBox=/);
});
