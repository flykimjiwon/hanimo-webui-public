import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the final semantic surface bridge remains live for every skin', () => {
  const globals = read('app/globals.css');
  const skins = read('app/styles/appearance-skins.css');
  const bridge = {
    background: '--hn-bg',
    foreground: '--hn-fg',
    card: '--hn-surface',
    'card-foreground': '--hn-fg',
    popover: '--hn-surface',
    'popover-foreground': '--hn-fg',
    secondary: '--hn-surface-2',
    muted: '--hn-surface-2',
    accent: '--hn-surface-2',
    border: '--hn-border',
    input: '--hn-border',
    sidebar: '--hn-surface-2',
    'sidebar-foreground': '--hn-fg',
    'sidebar-accent': '--hn-bg',
    'sidebar-accent-foreground': '--hn-fg',
    'sidebar-border': '--hn-border',
  };

  for (const [semantic, source] of Object.entries(bridge)) {
    const assignments = [...globals.matchAll(new RegExp(`--${semantic}\\s*:\\s*([^;]+);`, 'g'))];
    assert.ok(assignments.length > 0, `${semantic} bridge exists`);
    assert.equal(assignments.at(-1)[1].trim(), `var(${source})`, `${semantic} has no later hardcoded override`);
  }

  const skinIds = new Set([...skins.matchAll(/data-hanimo-skin='([^']+)'/g)].map((match) => match[1]));
  assert.equal(skinIds.size, 9);
});

test('type scale matches the documented 85 through 125 percent invariant', () => {
  const contract = read('app/lib/appearance-contract.mjs');
  const prepaint = read('app/lib/appearance-prepaint.mjs');
  const drawer = read('app/components/theme/ThemeDrawerSections.js');

  assert.match(contract, /TYPE_SCALE_MIN = 0\.85/);
  assert.match(contract, /TYPE_SCALE_MAX = 1\.25/);
  assert.match(prepaint, /Math\.min\(1\.25, Math\.max\(0\.85, scale\)\)/);
  assert.match(drawer, /TYPE_SCALE_MIN = 0\.85/);
  assert.match(drawer, /TYPE_SCALE_MAX = 1\.25/);
  assert.match(drawer, /step='0\.05'/);
});

test('chat shell preserves mobile navigation clearance and semantic heading order', () => {
  const header = read('app/components/chat/ChatHeader.js');
  const menu = read('app/components/SiteMenuSelector.js');
  const messages = read('app/components/chat/MessageList.js');

  assert.match(header, /pl-16[^']*lg:px-4/);
  assert.ok((menu.match(/pl-16[^']*lg:px-3/g) || []).length >= 2, 'loading and ready menu bars reserve hamburger space');
  assert.match(messages, /<h2[^>]*>[\s\S]*?chat\.solution_title[\s\S]*?<\/h2>/);
  assert.doesNotMatch(messages, /<h1[^>]*>[\s\S]*?chat\.solution_title/);
});

test('Korean empty-state and composer copy keep words intact without narrowing English', () => {
  const messages = read('app/components/chat/MessageList.js');
  const input = read('app/components/chat/ChatInput.js');
  const ko = JSON.parse(read('app/lib/i18n/ko.json'));

  assert.match(messages, /className='[^']*w-full[^']*max-w-\[580px\][^']*break-keep[^']*'[\s\S]*?solution_sub/);
  assert.match(input, /<textarea[\s\S]*?break-keep[\s\S]*?sm:pr-32/);
  for (const word of ['만들고', '전송', '줄바꿈']) assert.match(`${ko.chat.solution_sub} ${ko.chat.input_placeholder}`, new RegExp(word));
});
