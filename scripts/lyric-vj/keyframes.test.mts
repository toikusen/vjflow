// npx tsx scripts/lyric-vj/keyframes.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Board, drawnBox, frameCount, frameTimes, badLook, longHolds, sidePaper, withoutBlankNotes } from './keyframes.mts';

test('each frame holds from its line until the next frame; the first opens the passage; frames off it are dropped', () => {
  const cues = [{ id: 'c1', start: 36.1, end: 39, text: '' }, { id: 'c2', start: 44, end: 47, text: '' }, { id: 'c9', start: 90, end: 92, text: '' }];
  const f = (cue: string) => ({ cue, shows: '', who: [], feeling: '', change: '', side: 'left' as const });
  const b: Board = { logline: '', style: '', people: [], frames: [f('c2'), f('c1'), f('c9')] };
  assert.deepEqual(frameTimes(b, cues, 36, 71).map((x) => [x.cue, x.start, x.end]), [['c1', 36, 44], ['c2', 44, 71]]);
});

test('the drawn part of a frame is found inside its paper margins', () => {
  const [w, h] = [20, 10];
  const rgb = new Uint8Array(w * h * 3).fill(250);
  for (let y = 2; y < 8; y++) for (let x = 5; x < 15; x++) rgb.set([40, 50, 120], (y * w + x) * 3);
  assert.deepEqual(drawnBox(rgb, w, h), [5, 2, 15, 8]);
  assert.deepEqual(drawnBox(new Uint8Array(w * h * 3).fill(250), w, h), [0, 0, w, h]);
});

test('a passage takes a frame per 7.5 s (5 to 32); the writer\'s blank-area notes are dropped from a frame', () => {
  assert.equal(frameCount(35), 5);
  assert.equal(frameCount(224), 30);
  assert.equal(frameCount(600), 32);
  assert.equal(withoutBlankNotes('A man on a bridge. The left third is empty sky for lyrics. Snow falls.'), 'A man on a bridge. Snow falls.');
});

test('a lyric side left as bare paper is measured', () => {
  const [w, h] = [30, 10];
  const rgb = new Uint8Array(w * h * 3).fill(250);
  for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) rgb.set([40, 50, 120], (y * w + x) * 3);
  assert.equal(sidePaper(rgb, w, h, 'left'), 1);
  assert.equal(sidePaper(rgb, w, h, 'right'), 0);
});

test('frames keyed by seconds land in unsung stretches; holds past 12 s are found', () => {
  const cues = [{ id: 'c1', start: 10, end: 14, text: '' }];
  const f = (cue: string) => ({ cue, shows: '', who: [], feeling: '', change: '', side: 'left' as const });
  const t = frameTimes({ logline: '', style: '', people: [], frames: [f('c1'), f('@30')] }, cues, 0, 60);
  assert.deepEqual(t.map((x) => [x.start, x.end]), [[0, 30], [30, 60]]);
  assert.deepEqual(longHolds(t), [[0, 30], [30, 60]]);
});

test('a frame is redrawn when it is panels, or shows people where the board has nobody', () => {
  assert.equal(badLook({ panels: true, people: 1 }, ['he']), true);
  assert.equal(badLook({ panels: false, people: 1 }, []), true);
  assert.equal(badLook({ panels: false, people: 2 }, ['he']), false);
  assert.equal(badLook({ panels: false, people: 0 }, []), false);
});
