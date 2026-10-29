// npx tsx --test scripts/lyric-vj/beta/quality.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Probe, releaseFindings } from './quality.mts';

const good: Probe = { streams: [{ codec_type: 'video', width: 1920, height: 1080, r_frame_rate: '30/1' }, { codec_type: 'audio' }], duration: 258.22 };
const metrics = { readable: { ok: true, failing: [] }, rendererErrors: [] };
const plan = { missing: [], unknownShots: [], unknownCues: [] };
const findings = (o: Parameters<typeof releaseFindings>[0]) => releaseFindings(o).findings;

test('a measured, complete video with every line readable is released', () => {
  assert.deepEqual(releaseFindings({ metrics, planCheck: plan, probe: good, expectedSec: 258, fps: 30 }), { findings: [], fileOk: true, rerender: false, notes: [] });
});

test('missing, broken or older records are a finding, never a pass', () => {
  assert.match(findings({ metrics: undefined, planCheck: plan, probe: good, expectedSec: 258 })[0], /metrics\.json/);
  assert.match(findings({ metrics: 'oops', planCheck: plan, probe: good, expectedSec: 258 })[0], /metrics\.json/);
  assert.match(findings({ metrics: { cues: [] }, planCheck: plan, probe: good, expectedSec: 258 })[0], /readable\.failing/);
  assert.match(findings({ metrics: { readable: {} }, planCheck: plan, probe: good, expectedSec: 258 })[0], /readable\.failing/);
  // a render from before rendererErrors existed proves nothing about renderer faults
  assert.match(findings({ metrics: { readable: { failing: [] } }, planCheck: plan, probe: good, expectedSec: 258 })[0], /舊版渲染，未驗證/);
  assert.match(findings({ metrics, planCheck: undefined, probe: good, expectedSec: 258 })[0], /plan-check\.json/);
  assert.match(findings({ metrics, planCheck: {}, probe: good, expectedSec: 258 })[0], /plan-check\.json/);
  // a tier whose plan never ran has no plan-check to miss
  assert.deepEqual(findings({ metrics, planCheck: undefined, planRan: false, probe: good, expectedSec: 258 }), []);
});

test('a malformed failing line is a finding, not an exception (an exception would strand the paid video in failed)', () => {
  const f = findings({ metrics: { readable: { failing: [{ text: 'x' }, { id: 'c2', text: 'y', readableSec: 1, requiredSec: 2 }] }, rendererErrors: [] }, planCheck: plan, probe: good, expectedSec: 258 });
  assert.deepEqual(f, ['1 句低於閱讀時間規則：y（1.0/2.0s）', '可讀時間紀錄格式錯誤：{"text":"x"}']);
});

test('lines too short to read, renderer faults and skipped shots each hold the video, named; a renderer fault asks for a fresh render', () => {
  const r = releaseFindings({
    metrics: { readable: { ok: false, failing: [{ id: 'c026', text: '「ねぇ久しぶりだね」', readableSec: 0.53, requiredSec: 1.2 }] }, rendererErrors: ['code layer: runtime: x is not defined'] },
    planCheck: { missing: ['s07'], unknownShots: ['s99'], unknownCues: [] }, probe: good, expectedSec: 258,
  });
  const f = r.findings;
  assert.equal(f.length, 4);
  assert.match(f[0], /1 句低於閱讀時間規則：「ねぇ久しぶりだね」（0\.5\/1\.2s）/);
  assert.match(f[1], /渲染器出錯 1 筆：code layer: runtime/);
  assert.match(f[2], /漏排了鏡頭 s07/);
  assert.match(f[3], /不存在的鏡頭或歌詞：s99/);
  assert.deepEqual([r.rerender, r.fileOk], [true, true]);
});

test('a line readFix already landed at once that misses by under 0.5 s is a note, not a hold; a wider miss, or one never cut, holds', () => {
  const r = releaseFindings({
    metrics: { readable: { failing: [
      { id: 'c004', text: '硬底子功夫', readableSec: 2.16, requiredSec: 2.24, adjust: ['tight-line', 'read-cut'] },
      { id: 'c007', text: '什麼兵器', readableSec: 1.82, requiredSec: 2.18, adjust: ['read-cut'] },
      { id: 'c010', text: '太短', readableSec: 1.0, requiredSec: 1.6, adjust: ['read-cut'] },
      { id: 'c011', text: '沒切', readableSec: 2.0, requiredSec: 2.2, adjust: ['read-hold'] },
    ] }, rendererErrors: [] }, planCheck: plan, probe: good, expectedSec: 258,
  });
  assert.deepEqual(r.findings, ['2 句低於閱讀時間規則：太短（1.0/1.6s）、沒切（2.0/2.2s）']);
  assert.deepEqual(r.notes.map((n) => n.slice(0, 21)), ['已盡渲染器所能、仍短少不到 0.5 秒：硬', '已盡渲染器所能、仍短少不到 0.5 秒：什']);
});

test('the file itself: unreadable or a missing stream makes it undeliverable; wrong size, rate or length only hold it', () => {
  assert.deepEqual(releaseFindings({ metrics, planCheck: plan, probe: 'unreadable', expectedSec: 258 }), { findings: ['影片檔無法解析'], fileOk: false, rerender: true, notes: [] });
  const r = releaseFindings({ metrics, planCheck: plan, probe: { streams: [{ codec_type: 'video', width: 1280, height: 720, r_frame_rate: '60/1' }], duration: 250 }, expectedSec: 258, fps: 30 });
  assert.deepEqual(r, { findings: ['影像尺寸 1280×720，不是 1920×1080', '影格率 60.00，不是 30', '影片檔沒有聲音軌', '影片長 250.00s，歌長 258.00s'], fileOk: false, rerender: true, notes: [] });
  assert.deepEqual(releaseFindings({ metrics, planCheck: plan, probe: { streams: [{ codec_type: 'video', width: 1920, height: 1080, r_frame_rate: '0/0' }, { codec_type: 'audio' }], duration: 258 }, expectedSec: 258, fps: 30 }), { findings: ['影格率無法判讀（0/0）'], fileOk: true, rerender: false, notes: [] });
  assert.deepEqual(findings({ metrics, planCheck: plan, probe: good, expectedSec: NaN }), ['歌長無法判讀（NaN）']);
  // half a second of slack: a range ends on a frame and AAC adds priming
  assert.deepEqual(findings({ metrics, planCheck: plan, probe: { ...good, duration: 258.45 }, expectedSec: 258 }), []);
});
