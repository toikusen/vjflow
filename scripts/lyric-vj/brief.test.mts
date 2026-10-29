// npx tsx --test scripts/lyric-vj/brief.test.mts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { briefFields, briefText, designBriefText, interludeText, loadRefs, normaliseInterludes, readStyle, sipsArgs, userPrompt, withRefs, type UserPromptParts } from './brief.mts';
import type { UnsungWindow } from '../../src/app/lyric-vj/structure';
import type { Interlude } from '../../src/app/lyric-vj/treatment';

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

test('briefText: a redo names the previous concept only as something not to repeat, never the adjust keep-rules', () => {
  const t = briefText({ previous: { concept: '夜晚的城市', language: 'silkscreen', font: 'Noto Sans TC' }, candidates: [], hasRefs: false });
  assert.ok(t.includes('這是重做') && t.includes('上一版') && t.includes('夜晚的城市') && t.includes('不能和上一版重複'));
  for (const r of [ADJUST, '沒有要求改的', '都保留', '只改意見提到的地方']) assert.ok(!t.includes(r), r);
  assert.ok(t.includes('設計語言也考慮換'));
  // a language the person picked stays: the redo changes everything else
  const picked = briefText({ previous: { concept: '夜晚的城市', language: 'silkscreen', font: 'Noto Sans TC' }, chosen: 'silkscreen', candidates: [], hasRefs: false });
  assert.ok(picked.includes('這是重做') && picked.includes(CHOSEN) && !picked.includes('設計語言也考慮換'));
  // a blank note is a redo too; a real note is the adjustment
  assert.ok(briefText({ previous: { concept: 'c', language: 'l', font: 'f' }, note: '  ', candidates: [], hasRefs: false }).includes('這是重做'));
  assert.ok(briefText({ previous: { concept: 'c', language: 'l', font: 'f' }, note: '亮一點', candidates: [], hasRefs: false }).includes(ADJUST));
});

test('designBriefText: a redo asks for a different font and colour; an adjustment keeps them', () => {
  const prev = { concept: 'c', language: 'silkscreen', font: 'Noto Sans TC' };
  const redo = designBriefText({ previous: prev, hasRefs: false });
  assert.ok(redo.includes('這是重做') && redo.includes('Noto Sans TC') && redo.includes('明顯不同'));
  for (const r of [ADJUST, '保留']) assert.ok(!redo.includes(r), r);
  const adjust = designBriefText({ previous: prev, note: '亮一點', hasRefs: false });
  assert.ok(adjust.includes(ADJUST) && adjust.includes('保留上一版的') && !adjust.includes('這是重做'));
});

test('designBriefText is empty with no inputs and carries the reading, previous font and refs', () => {
  assert.equal(designBriefText({ hasRefs: false }), '');
  const t = designBriefText({ style: '夏天', briefReading: '你寫的『夏天』我理解成：強光', previous: { concept: 'c', language: 'silkscreen', font: 'Noto Sans TC' }, hasRefs: true });
  assert.ok(t.includes('夏天') && t.includes('強光') && t.includes('Noto Sans TC') && t.includes('參考圖'));
});

/** A valid RGB PNG of the given size (one flat colour), written from bytes. */
function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
const hasSips = (() => { try { execFileSync('sips', ['--help'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('sipsArgs: long edge 1568, JPEG quality 85, into the given file', () => {
  assert.deepEqual(sipsArgs('/in/a.png', '/tmp/x/0.jpg'), ['-Z', '1568', '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '/in/a.png', '--out', '/tmp/x/0.jpg']);
});

test('loadRefs caps at 5, sorts by name, skips non-images and files sips cannot read', { skip: !hasSips && 'sips not available' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-'));
  for (const n of ['f.png', 'a.jpg', 'c.webp', 'b.jpeg', 'e.PNG', 'd.png', 'g.png']) writeFileSync(join(dir, n), png(8, 8));
  writeFileSync(join(dir, 'notes.txt'), 'x');
  writeFileSync(join(dir, '0-broken.png'), 'not an image');
  const refs = loadRefs(dir);
  assert.deepEqual(refs.map((r) => r.name), ['a.jpg', 'b.jpeg', 'c.webp', 'd.png', 'e.PNG']);
  assert.ok(refs.every((r) => r.media_type === 'image/jpeg' && Buffer.from(r.data, 'base64').subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))));
  assert.deepEqual(loadRefs(join(dir, 'missing')), []);
});

test('loadRefs turns a large PNG into a JPEG no larger than 1568 px', { skip: !hasSips && 'sips not available' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'refs-big-'));
  writeFileSync(join(dir, 'big.png'), png(3000, 2000));
  const [r] = loadRefs(dir);
  assert.equal(r.media_type, 'image/jpeg');
  const f = join(dir, 'check.jpg');
  writeFileSync(f, Buffer.from(r.data, 'base64'));
  const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', f], { encoding: 'utf8' });
  const num = (k: string) => Number(info.match(new RegExp(`${k}: (\\d+)`))![1]);
  assert.ok(/format: jpeg/.test(info));
  assert.ok(num('pixelWidth') <= 1568 && num('pixelHeight') <= 1568 && Math.max(num('pixelWidth'), num('pixelHeight')) === 1568);
});

test('briefText and designBriefText leave out empty parts of the previous version', () => {
  const t = briefText({ previous: { concept: '', language: 'silkscreen', font: '' }, candidates: [], hasRefs: false });
  assert.ok(t.includes('設計語言 silkscreen') && !t.includes('字型 。') && !t.includes('「」') && !t.includes('字型 ，'));
  const d = designBriefText({ previous: { concept: 'c', language: 'silkscreen', font: '' }, hasRefs: false });
  assert.ok(!d.includes('字型 ；'));
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

const WINDOWS: UnsungWindow[] = [{ start: 0, end: 12.5, kind: 'intro' }, { start: 90, end: 106, kind: 'interlude' }, { start: 220, end: 238.4, kind: 'outro' }];

test('interludeText is empty without windows', () => {
  assert.equal(interludeText([]), '');
});

test('interludeText lists every window as mm:ss–mm:ss and its kind', () => {
  const t = interludeText(WINDOWS);
  for (const w of ['00:00–00:12 前奏', '01:30–01:46 間奏', '03:40–03:58 尾奏']) assert.ok(t.includes(w), w);
});

test('interludeText states the backdrop default and when pictures may be used', () => {
  const t = interludeText(WINDOWS);
  assert.ok(t.includes('backdrop') && t.includes('背景換段、圖形動態、節奏撐畫面') && t.includes('不放道具'));
  assert.ok(t.includes('pictures') && t.includes('reason') && t.includes('故事'));
});

test('userPrompt carries the interlude block where the brief goes', () => {
  const brief = [briefText({ candidates: [], hasRefs: false }), interludeText(WINDOWS)].filter(Boolean).join('\n');
  assert.ok(userPrompt({ ...parts, brief }).includes(`【這首歌的說明】\n${parts.style}\n${interludeText(WINDOWS)}\n結構`));
  // no windows and no brief: the prompt stays as it was
  const none = [briefText({ candidates: [], hasRefs: false }), interludeText([])].filter(Boolean).join('\n');
  assert.equal(userPrompt({ ...parts, brief: none }), legacy(parts, parts.style));
});

const withInterludes = (interludes?: Interlude[]) => ({ interludes });

test('normaliseInterludes fills every window with backdrop when the director wrote none', () => {
  const t = withInterludes();
  const fixes = normaliseInterludes(t, WINDOWS);
  assert.deepEqual(t.interludes, WINDOWS.map((w) => ({ start: w.start, end: w.end, mode: 'backdrop', reason: '' })));
  assert.equal(fixes.length, 3);
});

test('normaliseInterludes drops entries outside every window', () => {
  const t = withInterludes([{ start: 40, end: 50, mode: 'pictures', reason: '主角在雨中回頭看那扇窗' }]);
  const fixes = normaliseInterludes(t, WINDOWS);
  assert.ok(t.interludes!.every((x) => x.start !== 40));
  assert.ok(fixes.some((f) => f.includes('40.0') && f.includes('刪除')));
});

test('normaliseInterludes snaps an entry to its window', () => {
  const t = withInterludes([{ start: 91.2, end: 104, mode: 'pictures', reason: '間奏時兩人終於在月台重逢' }]);
  const fixes = normaliseInterludes(t, WINDOWS);
  assert.deepEqual(t.interludes![1], { start: 90, end: 106, mode: 'pictures', reason: '間奏時兩人終於在月台重逢' });
  assert.ok(fixes.some((f) => f.includes('對齊')));
});

test('normaliseInterludes turns pictures with a short reason into backdrop', () => {
  const t = withInterludes([{ start: 0, end: 12.5, mode: 'pictures', reason: '很好看' }, { start: 220, end: 238.4, mode: 'pictures', reason: '  1234567  ' }]);
  const fixes = normaliseInterludes(t, WINDOWS);
  assert.equal(t.interludes![0].mode, 'backdrop');
  assert.equal(t.interludes![2].mode, 'backdrop');
  assert.equal(fixes.filter((f) => f.includes('backdrop') && f.includes('理由')).length, 2);
});

test('normaliseInterludes keeps a pictures entry with a story reason and leaves a correct plan untouched', () => {
  const plan: Interlude[] = [
    { start: 0, end: 12.5, mode: 'backdrop', reason: '' },
    { start: 90, end: 106, mode: 'pictures', reason: '間奏時兩人終於在月台重逢' },
    { start: 220, end: 238.4, mode: 'backdrop', reason: '' },
  ];
  const t = withInterludes(structuredClone(plan));
  assert.deepEqual(normaliseInterludes(t, WINDOWS), []);
  assert.deepEqual(t.interludes, plan);
});

test('normaliseInterludes keeps one entry per window (the one covering most of it)', () => {
  const t = withInterludes([{ start: 90, end: 93, mode: 'pictures', reason: '短短一下的回憶畫面閃過' }, { start: 93, end: 106, mode: 'backdrop', reason: '' }]);
  const fixes = normaliseInterludes(t, WINDOWS);
  assert.deepEqual(t.interludes![1], { start: 90, end: 106, mode: 'backdrop', reason: '' });
  assert.equal(t.interludes!.length, 3);
  assert.ok(fixes.some((f) => f.includes('刪除')));
});

test('normaliseInterludes with no windows removes any interludes', () => {
  const t = withInterludes([{ start: 0, end: 5, mode: 'backdrop', reason: '' }]);
  normaliseInterludes(t, []);
  assert.equal(t.interludes, undefined);
  const empty = withInterludes();
  assert.deepEqual(normaliseInterludes(empty, []), []);
});
