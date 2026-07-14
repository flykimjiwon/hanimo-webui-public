import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clearBoardDraft,
  loadBoardDraft,
  saveBoardDraft,
} from '../app/lib/board-draft.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('board draft save is observable through restore and clear', () => {
  const storage = memoryStorage();
  const draft = { title: 'Release note', content: 'Verified body', category: 'post' };

  assert.equal(saveBoardDraft(storage, 'user-a', draft, 1234), true);
  assert.deepEqual(loadBoardDraft(storage, 'user-a'), { ...draft, savedAt: 1234 });
  assert.equal(loadBoardDraft(storage, 'user-b'), null);
  assert.equal(clearBoardDraft(storage, 'user-b'), true);
  assert.deepEqual(loadBoardDraft(storage, 'user-a'), { ...draft, savedAt: 1234 });
  assert.equal(clearBoardDraft(storage, 'user-a'), true);
  assert.equal(loadBoardDraft(storage, 'user-a'), null);
});

test('board draft categories persist canonical values and migrate legacy drafts', () => {
  const storage = memoryStorage();
  const notice = { title: 'Notice', content: 'Admin only', category: 'notice' };
  assert.equal(saveBoardDraft(storage, 'admin', notice, 100), true);
  assert.deepEqual(loadBoardDraft(storage, 'admin'), { ...notice, savedAt: 100 });

  storage.setItem('hanimo-board-draft-v1:user-a', JSON.stringify({
    title: 'Legacy',
    content: 'Question',
    category: 'ask',
    savedAt: 200,
  }));
  assert.deepEqual(loadBoardDraft(storage, 'user-a'), {
    title: 'Legacy',
    content: 'Question',
    category: 'post',
    savedAt: 200,
  });
});

test('board draft storage failures do not escape or cross user boundaries', () => {
  const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('blocked'); },
  };
  const draft = { title: 'Private', content: 'Draft', category: 'post' };
  assert.equal(loadBoardDraft(throwingStorage, 'user-a'), null);
  assert.equal(saveBoardDraft(throwingStorage, 'user-a', draft), false);
  assert.equal(clearBoardDraft(throwingStorage, 'user-a'), false);
  assert.equal(saveBoardDraft(memoryStorage(), '', draft), false);
});

test('profile does not present unimplemented preferences as interactive settings', async () => {
  const source = await readFile(new URL('../app/profile/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /const \[prefs, setPrefs\]/);
  assert.doesNotMatch(source, /<Switch/);
  assert.match(source, /profile\.preferences_coming_soon/);
  assert.match(source, /profile\.preferences_unavailable/);
});

test('board write restores saved drafts and clears them after publishing', async () => {
  const source = await readFile(new URL('../app/board/write/page.js', import.meta.url), 'utf8');
  assert.match(source, /loadBoardDraft\(localStorage, ownerId\)/);
  assert.match(source, /saveBoardDraft\(localStorage, draftOwner/);
  assert.match(source, /clearBoardDraft\(localStorage, draftOwner\)[\s\S]*router\.push\('\/board'\)/);
  assert.match(source, /pt-16 sm:pt-6/);
  assert.match(source, /flex flex-wrap items-center gap-1/);
  assert.match(source, /<h1 className=['"]sr-only['"]>게시글 작성<\/h1>/);
  assert.doesNotMatch(source, /key:\s*['"](?:doc|ask|share)['"]/);
  assert.match(source, /key:\s*['"]post['"],\s*label:\s*['"]일반['"]/);
});

test('signup and profile forms expose standard credential autocomplete hints', async () => {
  const [signup, profile] = await Promise.all([
    readFile(new URL('../app/signup/page.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/profile/page.js', import.meta.url), 'utf8'),
  ]);

  assert.match(signup, /autoComplete=['"]name['"]/);
  assert.equal((signup.match(/<h1/g) || []).length, 1);
  assert.match(signup, /autoComplete=['"]email['"]/);
  assert.equal((signup.match(/autoComplete=['"]new-password['"]/g) || []).length, 2);
  assert.match(profile, /autoComplete=['"]current-password['"]/);
  assert.match(profile, /autoComplete=['"]username['"]/);
  assert.equal((profile.match(/autoComplete=['"]new-password['"]/g) || []).length, 2);
});

test('profile labels and password visibility controls have accessible names', async () => {
  const source = await readFile(new URL('../app/profile/page.js', import.meta.url), 'utf8');
  for (const id of [
    'profile-name',
    'profile-email',
    'profile-department',
    'profile-cell',
    'profile-current-password',
    'profile-new-password',
    'profile-confirm-password',
  ]) {
    assert.match(source, new RegExp(`htmlFor=['"]${id}['"]`));
    assert.match(source, new RegExp(`id=['"]${id}['"]`));
  }
  assert.equal((source.match(/aria-label=\{t\(/g) || []).length, 3);
  assert.equal((source.match(/'profile\.show_password'/g) || []).length, 3);
  assert.equal((source.match(/'profile\.hide_password'/g) || []).length, 3);
});

test('lint ignores nested agent and framework build artifacts', async () => {
  const source = await readFile(new URL('../eslint.config.mjs', import.meta.url), 'utf8');
  assert.match(source, /['"]\.omo\/\*\*['"]/);
  assert.match(source, /['"]\*\*\/\.next\/\*\*['"]/);
});
