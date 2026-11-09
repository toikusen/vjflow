// npx tsx --test scripts/lyric-vj/label-score.test.mts
// label-score.mts on a synthetic filled table and key; label-samples.mts's draw on a synthetic pool.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEEN } from './frame-change.mts';
import { calibrate, consistency, detected, parseTable, scoreHeldout, type KeySample } from './label-score.mts';
import { anonymise, draw, type PoolEvent } from './label-samples.mts';

const still = { shift: 0.01, centre: 0.01, scale: 1.05, relation: 1.02, turned: false, page: 0.01, onCarrier: 0, outline: 0.01 };
const moved = { ...still, shift: 0.2 };
const ringOnly = { ...still, outline: 0.09 };
const strata = (worldGroup: string, lang = 'zh') => ({ worldGroup, tempo: 'fast', lang, length: 'mid', event: 'seat' });
const s = (pool: string, m: Record<string, number | boolean>, verdict = 'realized', extra: Partial<KeySample> = {}): KeySample => ({ pool, m, verdict, strata: strata('five'), ...extra });

const key: Record<string, KeySample> = {
  s001: s('calibration', moved), s002: s('calibration', still, 'unrealized'), s003: s('calibration', moved), s004: s('calibration', still, 'unrealized'),
  s005: s('heldout-random', moved), s006: s('heldout-random', still, 'unrealized'), s007: s('heldout-hard', ringOnly, 'outlineOnly', { strata: strata('eight', 'ja') }),
  s008: s('heldout-hard', moved, 'approvedNotDrawn'), s009: s('heldout-random', moved, 'realized', { strata: strata('other') }),
  s010: { ...s('calibration', moved), repeatOf: 's001' }, s011: { ...s('heldout-random', moved), repeatOf: 's005' },
};
const csv = ['﻿樣本,Q1,Q2,Q3,備註', 's001,是,座位,無,', 's002,否,,無,', 's003,是,座位/載體,無,', 's004,不確定,,無,', 's005,是,座位,無,', 's006,否,,"1.2 秒 字被切掉, 右下",', 's007,否,,無,', 's008,是,載體,無,', 's009,是,座位,無,', 's010,是,座位,無,', 's011,不確定,,無,'].join('\r\n');

test('the table parses Chinese answers, quoted fields and the BOM', () => {
  const t = parseTable(csv);
  assert.equal(Object.keys(t).length, 11);
  assert.deepEqual(t['s003'], { q1: 'yes', q2: ['座位', '載體'], q3: '無', note: '' });
  assert.equal(t['s004'].q1, 'unsure');
  assert.equal(t['s006'].q3, '1.2 秒 字被切掉, 右下');
});

test('a repeat that changes whether it counts is flagged (unsure is not a yes)', () => {
  const c = consistency(key, parseTable(csv));
  assert.equal(c.pairs, 2);
  assert.equal(c.ok, false);
  assert.deepEqual(c.countFlips, ['s005/s011: yes → unsure']);
});

test('calibration uses the 40 only and keeps zero false accepts first', () => {
  const r = calibrate(key, parseTable(csv));
  assert.equal(r.used, 4);
  assert.equal(r.best.fa, 0);
  assert.equal(r.best.agree, 4);
  // (a tie with the current thresholds keeps them)
  assert.deepEqual(r.best.t, SEEN);
});

test('held-out: unsure counts as no, approved-not-drawn is never a detection, outline-only reported apart, false accepts caught', () => {
  const r = scoreHeldout(key, parseTable(csv), SEEN);
  assert.equal(r.scored, 5);
  assert.equal(detected(key['s008'], SEEN), false);
  // s007: seen by the ring only, owner said no → the one false accept, and it is outline-only
  assert.deepEqual(r.checks.falseAccepts, [{ id: 's007', ownerSaid: 'no', outlineOnly: true }]);
  assert.equal(r.checks.zeroFalseAccept, false);
  assert.equal(r.outlineOnly.n, 1);
  assert.equal(r.outlineOnly.fp, 1);
  // owner yes: s005, s008, s009; detected: s005, s009 → recall 2/3 < 0.9
  assert.equal(r.overall.recall, 0.667);
  assert.equal(r.checks.recallAtLeast90, false);
  assert.equal(r.pass, false);
  assert.equal(r.byStratum['lang']['ja'].fp, 1);
  assert.deepEqual(r.hardFaults, [{ id: 's006', fault: '1.2 秒 字被切掉, 右下' }]);
});

test('held-out passes when every yes is seen and nothing else is', () => {
  const k2 = Object.fromEntries(Object.entries(key).filter(([id]) => !['s007', 's008', 's011'].includes(id)));
  const r = scoreHeldout(k2, parseTable(csv), SEEN);
  assert.equal(r.overall.recall, 1);
  assert.equal(r.pass, true);
});

const ev = (i: number, verdict: PoolEvent['verdict'], tags: string[] = []): PoolEvent => ({ group: `w${i % 30}|nun|c${i}`, world: `w${i % 30}`, song: 'nun', window: 'fast', version: 'v', commit: 'x', at: i, kind: 'layout-seat', scope: 'line', lineIds: [`c${i}`], text: '', t: [i - 1, i + 1], verdict, why: '', noReadingTime: false, strata: { worldGroup: 'other', tempo: 'fast', lang: 'zh', length: 'mid', event: 'seat' }, tags });

test('the draw: fixed seed, one group one pool, outline-only first, short outline flagged, 12 hidden repeats', () => {
  const pool = [...Array.from({ length: 200 }, (_, i) => ev(i, 'realized')), ...Array.from({ length: 6 }, (_, i) => ev(300 + i, 'outlineOnly', ['outlineOnly'])), ...Array.from({ length: 10 }, (_, i) => ev(400 + i, 'unrealized', ['edgeBelow']))];
  // (two events on one group: never in two pools)
  pool.push({ ...ev(500, 'realized'), group: pool[0].group });
  const a = draw(pool, 7);
  const b = draw(pool, 7);
  assert.deepEqual(a.drawn.map((d) => d.event.at), b.drawn.map((d) => d.event.at));
  assert.equal(a.drawn.length, 120);
  assert.equal(new Set(a.drawn.map((d) => d.event.group)).size, 120);
  assert.equal(a.drawn.filter((d) => d.pool === 'heldout-hard' && d.event.verdict === 'outlineOnly').length, 6);
  assert.equal(a.outlineShort, true);
  const ids = anonymise(a.drawn, 7);
  assert.equal(ids.length, 132);
  assert.equal(ids.filter((x) => x.repeatOf).length, 12);
  for (const x of ids.filter((y) => y.repeatOf)) assert.equal(ids.find((y) => y.id === x.repeatOf)!.of, x.of);
});
