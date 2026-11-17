import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTracks, applyPlayback, cleanTrack, createRoom, memberByToken, newCode } from './room.js';

const t = (id: string) => ({ id, title: `Song ${id}`, artists: [{ name: 'A' }] });
const ID = (n: number) => `abcdefghij${n}`;

test('codes are 6 unambiguous characters', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^[A-HJ-NP-Z2-9]{6}$/);
});

test('cleanTrack rejects bad ids and strips unknown thumbnails', () => {
  assert.equal(cleanTrack({ id: 'x', title: 'y' }), null);
  assert.equal(cleanTrack({ id: ID(1), title: 'ok', thumbnail: 'https://evil.com/a.png' })?.thumbnail, undefined);
  assert.equal(cleanTrack({ id: ID(1), title: 'ok', thumbnail: 'https://lh3.googleusercontent.com/a' })?.thumbnail, 'https://lh3.googleusercontent.com/a');
});

test('host token identifies the host; playback snapshot applies', () => {
  const room = createRoom('ABCDEF', 'Host', 'tok', 1000);
  const host = memberByToken(room, 'tok')!;
  assert.equal(host.id, room.hostId);
  assert.equal(memberByToken(room, 'nope'), undefined);
  assert.equal(applyPlayback(room, host, { queue: [t(ID(1)), t(ID(2))], index: 1, playing: true, position: 12.5 }, 2000), null);
  assert.deepEqual([room.index, room.playing, room.position, room.at], [1, true, 12.5, 2000]);
});

test('guests cannot control when the host turns control off, but can still add songs', () => {
  const room = createRoom('ABCDEF', 'Host', 'tok', 0);
  room.allowControl = false;
  const guest = { id: 'g', name: 'Guest', tokenHash: 'x', lastSeen: 0 };
  room.members.push(guest);
  assert.match(applyPlayback(room, guest, { queue: [], index: -1, playing: false, position: 0 }, 1)!, /Only the host/);
  assert.equal(addTracks(room, guest, [t(ID(3)), t(ID(3))], 5), null);
  assert.deepEqual(room.queue.map((x) => x.id), [ID(3)]);
  assert.equal(room.index, 0);
});

test('invalid index is rejected', () => {
  const room = createRoom('ABCDEF', 'Host', 'tok', 0);
  const host = room.members[0];
  assert.ok(applyPlayback(room, host, { queue: [t(ID(1))], index: 5, playing: true, position: 0 }, 1));
});

test('custom room codes: format rules', () => {
  const CODE = /^[A-Z0-9]{4,12}$/;
  assert.ok(CODE.test('PRAVEEN'));
  assert.ok(CODE.test('PARTY1'));
  assert.ok(!CODE.test('AB'));
  assert.ok(!CODE.test('HAS SPACE'));
  assert.ok(!CODE.test('WAYTOOLONGCODE123'));
});
