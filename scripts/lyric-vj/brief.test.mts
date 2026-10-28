// npx tsx --test scripts/lyric-vj/brief.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { briefFields, briefText, designBriefText, loadRefs, readStyle, userPrompt, withRefs, type UserPromptParts } from './brief.mts';

const NAMES = '畫面裡絕對不能出現這些名字';
const READING = 'briefReading 必填';
const CHOSEN = '使用者指定了設計語言';
const CANDIDATE = 'candidateReason';
const ADJUST = '這是調整';

test('briefText is empty with no inputs', () => {
  assert.equal(briefText({ candidates: [], hasRefs: false }), '');
  assert.equal(briefText({ style: '  ', candidates: [], hasRefs: false }), '');
});

test('briefText: written text brings the name rule and briefReading only', () => {
  const t = briefText({ style: '想要宮崎駿那種夏天', candidates: [], hasRefs: false });
  assert.ok(t.includes(NAMES) && t.includes(READING));
  for (const r of [CHOSEN, CANDIDATE, ADJUST, '參考圖']) assert.ok(!t.includes(r), r);
});

test('briefText: refs alone bring briefReading and the picture rule, not the name rule', () => {
  const t = briefText({ candidates: [], hasRefs: true });
  assert.ok(t.includes(READING) && t.includes('參考圖'));
  assert.ok(!t.includes(NAMES));
});

test('briefText: a chosen language is used as given, concerns when it does not suit', () => {
  const t = briefText({ chosen: 'silkscreen', candidates: ['scrapbook'], hasRefs: false });
  assert.ok(t.includes(CHOSEN) && t.includes('silkscreen') && t.includes('concerns'));
  // a pick by the person: no candidates to choose from, no reading of nothing
  assert.ok(!t.includes(CANDIDATE) && !t.includes(READING));
});

test('briefText: candidates only when the director picks', () => {
  const t = briefText({ candidates: ['scrapbook', 'pop-art'], hasRefs: false });
  assert.ok(t.includes(CANDIDATE) && t.includes('scrapbook、pop-art'));
  assert.ok(!t.includes(CHOSEN) && !t.includes('concerns'));
});

test('briefText: an adjustment quotes the previous version and keeps the rest', () => {
  const t = briefText({ previous: { concept: '夜晚的城市', language: 'silkscreen', font: 'Noto Sans TC' }, note: '再亮一點', candidates: [], hasRefs: false });
  assert.ok(t.includes(ADJUST) && t.includes('上一版') && t.includes('夜晚的城市') && t.includes('Noto Sans TC') && t.includes('再亮一點'));
  assert.ok(t.includes('沒有要求改的'));
});

test('designBriefText is empty with no inputs and carries the reading, previous font and refs', () => {
  assert.equal(designBriefText({ hasRefs: false }), '');
  const t = designBriefText({ style: '夏天', briefReading: '你寫的『夏天』我理解成：強光', previous: { concept: 'c', language: 'silkscreen', font: 'Noto Sans TC' }, hasRefs: true });
  assert.ok(t.includes('夏天') && t.includes('強光') && t.includes('Noto Sans TC') && t.includes('參考圖'));
});

test('loadRefs caps at 5, sorts by name and skips non-images', () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-'));
  for (const n of ['f.png', 'a.jpg', 'c.webp', 'b.jpeg', 'notes.txt', 'e.PNG', 'd.png']) writeFileSync(join(dir, n), n);
  const refs = loadRefs(dir);
  assert.equal(refs.length, 5);
  assert.deepEqual(refs.map((r) => Buffer.from(r.data, 'base64').toString()), ['a.jpg', 'b.jpeg', 'c.webp', 'd.png', 'e.PNG']);
  assert.deepEqual(refs.map((r) => r.media_type), ['image/jpeg', 'image/jpeg', 'image/webp', 'image/png', 'image/png']);
  assert.deepEqual(loadRefs(join(dir, 'missing')), []);
});

test('withRefs: plain text without refs, images before the text with them', () => {
  assert.equal(withRefs('hi', []), 'hi');
  const c = withRefs('hi', [{ media_type: 'image/png', data: 'AAA' }]);
  assert.deepEqual(c, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }, { type: 'text', text: 'hi' }]);
});

test('readStyle reads an @file and keeps plain text as is', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'style-')), 'brief.txt');
  writeFileSync(f, '夏天的海\n\n使用者對上一版的意見：亮一點\n');
  assert.equal(readStyle(`@${f}`), '夏天的海\n\n使用者對上一版的意見：亮一點');
  assert.equal(readStyle(' 原文 '), ' 原文 ');
  assert.equal(readStyle(undefined), '');
});

test('briefFields drops empty fields and keeps the rest unchanged', () => {
  const t = { concept: 'c', briefReading: ' 讀成夜行 ', concerns: '', candidateReason: '  ' };
  briefFields(t);
  assert.deepEqual(t, { concept: 'c', briefReading: ' 讀成夜行 ' });
});

const parts: UserPromptParts = {
  toolbox: '\n\n設計師常用手法：x', expectShots: 12, shotSec: [3, 6], cueCount: 2, style: '一首夏天的歌', brief: '',
  structure: '結構：A B', suggested: 'drop@10.00 strength 1', keyWords: ['夏', '海'], repeat: '（無）', titleCards: '不要用 title-card。',
  win: { start: 0, end: 60 }, tempo: 120.4, sections: '0.0–30.0s verse 能量 0.40', downbeats: '0.50 2.50', cueLines: 'c1｜…', catalog: '- plain：…', dbText: '（無）',
};
// today's template (direct.mts before the brief), copied verbatim: the builder must reproduce it without the new inputs
const legacy = (p: UserPromptParts, style: string) => `${p.toolbox ? `${p.toolbox}\n\n` : ''}【輸出要求】shots 大約 ${p.expectShots} 個（每個 ${p.shotSec[0]}–${p.shotSec[1]} 秒，連續覆蓋整個範圍）；cues 必須包含下列全部 ${p.cueCount} 句。\n\n【這首歌的說明】\n${style ? `${style}\n` : ''}${p.structure}\n\n【程式建議的爆點】（依結構產生，可以調整強度與長度，位置除非有明確理由不要改）\n${p.suggested}\n\n【關鍵詞（可以換色的詞）】\n${p.keyWords.join('、') || '（無）'}\n\n【重複段落】\n${p.repeat}\n\n【標題卡】\n${p.titleCards}\n\n【範圍】${p.win.start}–${p.win.end} 秒；BPM 約 ${p.tempo.toFixed(0)}\n【段落】\n${p.sections}\n【強拍】${p.downbeats}\n\n【歌詞】\n${p.cueLines}\n\n【模板】\n${p.catalog}\n\n【VJ 資料庫參考】（50 支歌詞 VJ 的分析，是觀察與推測，不是規則）\n${p.dbText}`;

test('userPrompt is byte-identical to the old prompt without the new inputs', () => {
  assert.equal(userPrompt(parts), legacy(parts, parts.style));
  assert.equal(userPrompt({ ...parts, style: '', toolbox: '', keyWords: [] }), legacy({ ...parts, toolbox: '', keyWords: [] }, ''));
});

test('userPrompt puts the brief right after the person\'s text', () => {
  const p = userPrompt({ ...parts, brief: '導演須知：x' });
  assert.ok(p.includes('【這首歌的說明】\n一首夏天的歌\n導演須知：x\n結構：A B'));
  assert.ok(userPrompt({ ...parts, style: '', brief: '導演須知：x' }).includes('【這首歌的說明】\n導演須知：x\n結構：A B'));
});
