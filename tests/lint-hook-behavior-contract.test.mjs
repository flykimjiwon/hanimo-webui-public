import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const occurrenceCount = (source, fragment) => source.split(fragment).length - 1;

test('admin initial-load effects keep their fetch cardinality', async () => {
  const [dashboard, settings] = await Promise.all([
    readSource('app/admin/dashboard/page.js'),
    readSource('app/admin/settings/page.js'),
  ]);

  assert.equal(occurrenceCount(dashboard, 'fetchDashboardDataRef.current();'), 1);
  assert.equal(occurrenceCount(dashboard, 'fetchSystemStatusRef.current();'), 1);
  assert.equal(occurrenceCount(settings, 'fetchAvailableModelsRef.current();'), 1);
  assert.equal(
    occurrenceCount(settings, 'fetchSettingsRef.current();') +
      occurrenceCount(settings, 'fetchSettings();'),
    12
  );
});

test('chat polling and global listener cleanup stay one-for-one', async () => {
  const [widget, reporter, input] = await Promise.all([
    readSource('app/components/ChatWidget.js'),
    readSource('app/components/ClientErrorReporter.js'),
    readSource('app/components/chat/ChatInput.js'),
  ]);

  assert.equal(occurrenceCount(widget, 'setInterval('), 1);
  assert.equal(occurrenceCount(widget, 'clearInterval('), 2);
  assert.equal(occurrenceCount(widget, 'fetchLatestMessagesRef.current('), 2);
  assert.equal(occurrenceCount(reporter, "window.addEventListener('error'"), 1);
  assert.equal(occurrenceCount(reporter, "window.removeEventListener('error'"), 1);
  assert.equal(occurrenceCount(reporter, "window.addEventListener('unhandledrejection'"), 1);
  assert.equal(occurrenceCount(reporter, "window.removeEventListener('unhandledrejection'"), 1);
  assert.equal(occurrenceCount(reporter, 'enqueueRef.current('), 3);
  assert.equal(occurrenceCount(input, 'window.addEventListener('), 5);
  assert.equal(occurrenceCount(input, 'window.removeEventListener('), 5);
});

test('notice visibility reads the current target without adding polling or listeners', async () => {
  const popup = await readSource('app/components/NoticePopup.js');

  assert.equal(occurrenceCount(popup, 'getHideSettings(target)'), 4);
  assert.equal(occurrenceCount(popup, '}, [initialNotice, target]);'), 2);
  assert.equal(occurrenceCount(popup, 'setInterval('), 0);
  assert.equal(occurrenceCount(popup, 'addEventListener('), 0);
});

test('property panel resets local data only when the selected node id changes', async () => {
  const panel = await readSource('app/components/workflow/PropertyPanel.js');

  assert.match(panel, /Sync local state when selected node changes \(only on node\.id change\)/);
  assert.equal(occurrenceCount(panel, 'setLocalData('), 2);
  assert.match(panel, /\}, \[node\?\.id\]\);/);
});
