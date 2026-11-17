import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBase, selectBestMatch } from './extensions.ts';

const T = (id: string, title: string, artist: string, duration?: number) => ({ id, title, artist, duration });

test('picks the exact song by the same artist', () => {
  const m = selectBestMatch([T('1', 'Yellow (Live)', 'Coldplay'), T('2', 'Yellow', 'Coldplay', 269), T('3', 'Yellow', 'Someone Else')], 'Yellow', 'Coldplay', 269000);
  assert.equal(m?.id, '2');
});
test('never substitutes another artist', () => {
  assert.equal(selectBestMatch([T('1', 'Yellow', 'Someone Else')], 'Yellow', 'Coldplay'), null);
});
test('a requested remix is not served the original', () => {
  assert.equal(selectBestMatch([T('1', 'Blinding Lights', 'The Weeknd')], 'Blinding Lights (Remix)', 'The Weeknd'), null);
});
test('"yes" does not match "yesterday" (prefix rule)', () => {
  assert.equal(selectBestMatch([T('1', 'Yesterday', 'The Beatles')], 'Yes', 'The Beatles'), null);
});
test('normalizeBase accepts http(s) only and trims manifest.json', () => {
  assert.equal(normalizeBase('https://ext.example.com/manifest.json'), 'https://ext.example.com');
  assert.equal(normalizeBase('file:///etc/passwd'), null);
  assert.equal(normalizeBase('not a url'), null);
});
