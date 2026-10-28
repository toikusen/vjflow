// npx tsx --test scripts/lyric-vj/beta/concept-summary.test.mts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { stillTimes, summarize, writeSummary } from './concept-summary.mts';

const w = (p: string, o: unknown) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(o)); };

function fixture() {
  const run = mkdtempSync(join(tmpdir(), 'concept-'));
  w(join(run, 'song.json'), { duration: 100, cues: [
    { id: 'c1', start: 2, end: 6, text: 'a' }, { id: 'c2', start: 22, end: 26, text: 'b' },
    { id: 'c3', start: 52, end: 58, text: 'c' }, { id: 'c4', start: 81, end: 85, text: 'd' } ] });
  w(join(run, 'base/treatment.json'), {
    concept: '一座夜晚的城市', language: 'silkscreen', briefReading: '讀成夜行', concerns: '歌詞偏長',
    design: { language: 'silkscreen', font: 'Noto Sans TC',
      colorScript: [ { start: 0, shadow: '#111111', highlight: '#eeeeee', accent: '#ff0000' }, { start: 30, shadow: '#111111', highlight: '#eeeeee', accent: '#00ff00' }, { start: 60, shadow: '#222222', highlight: '#eeeeee', accent: '#0000ff' } ] } });
  w(join(run, 'noimg/treatment.json'), { shots: [ { id: 's1', start: 0, end: 20 }, { id: 's2', start: 20, end: 50 }, { id: 's3', start: 50, end: 80 }, { id: 's4', start: 80, end: 100 } ] });
  for (const n of ['still_24.00.png', 'still_55.00.png', 'still_83.00.png']) w(join(run, 'stills', n), 0);
  return run;
}

test('stillTimes picks the middle of the first sung line of the shots at 20, 50 and 80 percent', () => {
  assert.deepEqual(stillTimes(fixture()), [24, 55, 83]);
});

test('summarize gathers language, unique palette, concept text and the stills', () => {
  const s = summarize(fixture());
  assert.equal(s.language, 'silkscreen');
  assert.equal(s.languageName, '絲網海報');
  assert.equal(s.font, 'Noto Sans TC');
  assert.deepEqual(s.palette, ['#111111', '#eeeeee', '#ff0000', '#00ff00', '#222222']);
  assert.equal(s.concept, '一座夜晚的城市');
  assert.equal(s.briefReading, '讀成夜行');
  assert.equal(s.concerns, '歌詞偏長');
  assert.equal(s.candidateReason, undefined);
  assert.deepEqual(s.stills, ['still_24.00.png', 'still_55.00.png', 'still_83.00.png']);
});

test('writeSummary writes concept.json', () => {
  const run = fixture();
  writeSummary(run);
  assert.equal(JSON.parse(readFileSync(join(run, 'concept.json'), 'utf8')).language, 'silkscreen');
});

const timesRun = (shots: unknown[], duration = 100) => {
  const run = mkdtempSync(join(tmpdir(), 'concept-'));
  w(join(run, 'song.json'), { duration, cues: [] });
  w(join(run, 'noimg/treatment.json'), { shots });
  return run;
};

test('two points in one shot still give three distinct times when shots allow', () => {
  const run = timesRun([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 60, end: 85 }, { id: 'c', start: 85, end: 100 }]);
  const t = stillTimes(run);
  assert.equal(new Set(t).size, 3);
  assert.deepEqual(t, [30, 72.5, 92.5]);
});

test('a one-shot song gives one time', () => {
  assert.deepEqual(stillTimes(timesRun([{ id: 'a', start: 0, end: 100 }])), [50]);
});

test('no shots is a clear error', () => {
  assert.throws(() => stillTimes(timesRun([])), /沒有鏡頭，無法選示意畫面/);
});

test('summarize lists interludes and keeps a reason only for pictures entries', () => {
  const run = fixture();
  const t = JSON.parse(readFileSync(join(run, 'base/treatment.json'), 'utf8'));
  t.interludes = [
    { start: 8, end: 20, mode: 'pictures', reason: '間奏回到那盞燈，交代時間過了一夜' },
    { start: 60, end: 70, mode: 'backdrop', reason: '弱理由不該出現' },
  ];
  w(join(run, 'base/treatment.json'), t);
  assert.deepEqual(summarize(run).interludes, [
    { start: 8, end: 20, mode: 'pictures', reason: '間奏回到那盞燈，交代時間過了一夜' },
    { start: 60, end: 70, mode: 'backdrop' },
  ]);
});

test('summarize has no interludes key when the treatment has none', () => {
  assert.equal('interludes' in summarize(fixture()), false);
});
