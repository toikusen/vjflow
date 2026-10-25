// npx tsx scripts/lyric-vj/preview.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partFor, stillAt, warmthOf, warmthOff } from './preview.mts';

const shots = [{ id: 's1', start: 0, end: 10 }, { id: 's2', start: 10, end: 20 }, { id: 's3', start: 20, end: 30 }];

test('a still shows the middle of the shot\'s first sung line, or the shot\'s middle when nothing is sung', () => {
  assert.equal(stillAt(shots[1], [{ id: 'c1', start: 12, end: 16, text: 'a' }]), 14);
  assert.equal(stillAt(shots[1], [{ id: 'c1', start: 18, end: 25, text: 'a' }]), 19);
  assert.equal(stillAt(shots[0], []), 5);
});

test('a shot belongs to the last part starting at or before it', () => {
  const parts = [{ from: 's1', shift: 'change', what: 'A' }, { from: 's3', shift: 'hold', what: 'C' }];
  assert.equal(partFor(parts, shots, 's2')?.what, 'A');
  assert.equal(partFor(parts, shots, 's3')?.what, 'C');
});

test('a frame\'s warmth is its red over its blue, and a plan it misses by more than a quarter is flagged', () => {
  assert.equal(warmthOf([120, 120, 120]), 0.5);
  assert.equal(warmthOf([45, 75, 160]) < 0.1, true, 'a blue night is cold');
  assert.equal(warmthOff(0.8, warmthOf([45, 75, 160])), true, 'a red part drawn blue');
  assert.equal(warmthOff(0.8, 0.7), false);
  assert.equal(warmthOff(undefined, 0.1), false);
});
