// npx tsx --test scripts/lyric-vj/char-cuts.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cutGrid, energyReader, holdBeats, stillShare } from '../../src/app/lyric-vj/char-cuts';

const grid = (bpm: number, from: number, to: number) => {
  const beat = 60 / bpm;
  const beats: number[] = [];
  for (let t = from; t <= to + beat; t += beat) beats.push(+t.toFixed(4));
  return beats;
};

test('holdBeats follows energy: quiet songs hold bars, loud ones cut on beats', () => {
  assert.equal(holdBeats(0.2), 8);
  assert.equal(holdBeats(0.4), 4);
  assert.equal(holdBeats(0.6), 2);
  assert.equal(holdBeats(0.8), 2);
});

test('cuts fall on beats, every line starts a cut, shots cycle in the planned order', () => {
  const beats = grid(120, 0, 20); // beat 0.5 s
  const lines = [
    { cue: 'c1', start: 0, end: 4, shots: ['A', 'B'] },
    { cue: 'c2', start: 4, end: 8, shots: ['C'] },
  ];
  const cuts = cutGrid(beats, lines, { energyAt: () => 0.7 });
  assert.equal(cuts[0].start, 0);
  assert.equal(cuts.find((c) => c.cue === 'c2')?.start, 4);
  for (const c of cuts) assert.ok(beats.some((b) => Math.abs(b - c.start) < 1e-3) || c.start === 0 || c.start === 4, `cut at ${c.start} is not on a beat`);
  assert.deepEqual(cuts.filter((c) => c.cue === 'c1').map((c) => c.shot), ['A', 'B', 'A', 'B']); // 2 beats each
  assert.ok(cuts.every((c) => c.end > c.start));
  assert.ok(cuts.every((c, i) => i === 0 || cuts[i - 1].end === c.start), 'cuts tile the lines');
});

test('a slow quiet song holds for bars from the same rule', () => {
  const beats = grid(80, 0, 40); // beat 0.75 s
  const lines = [{ cue: 'c1', start: 0, end: 24, shots: ['A', 'B', 'C'] }];
  const cuts = cutGrid(beats, lines, { energyAt: () => 0.3 });
  assert.ok(cuts.every((c) => c.end - c.start >= 5.9), JSON.stringify(cuts)); // 8 beats × 0.75 s
  assert.equal(cuts.length, 4);
});

test('a leftover shorter than the minimum joins the cut before; showing counts repeats', () => {
  const beats = grid(120, 0, 10);
  const lines = [{ cue: 'c1', start: 0, end: 3.2, shots: ['A'] }];
  const cuts = cutGrid(beats, lines, { energyAt: () => 0.7, minCut: 0.3 });
  assert.equal(cuts[cuts.length - 1].end, 3.2);
  assert.ok(cuts.every((c) => c.end - c.start >= 0.3));
  assert.deepEqual(cuts.map((c) => c.showing), cuts.map((_, i) => i));
});

test('a line may call its own hold in beats (a one-beat run on the hook)', () => {
  const beats = grid(120, 0, 10);
  const cuts = cutGrid(beats, [{ cue: 'c1', start: 0, end: 2, shots: ['A', 'B'], beats: 1 }], { energyAt: () => 0.2 });
  assert.equal(cuts.length, 4);
  assert.ok(cuts.every((c) => Math.abs(c.end - c.start - 0.5) < 1e-3));
});

test('stillShare and energyReader', () => {
  const cuts = cutGrid(grid(120, 0, 10), [{ cue: 'c1', start: 0, end: 4, shots: ['A', 'B'] }], { energyAt: () => 0.7 });
  assert.ok(Math.abs(stillShare(cuts, (s) => s === 'B') - 2 / 4) < 1e-6);
  const e = energyReader([0, 0, 1, 1], 1, 2);
  assert.ok(Math.abs(e(2) - 0.5) < 1e-6);
  assert.equal(e(3), 1);
});
