// Rebuild tests for typeplan.mts from a fixed plan (no director call): npx tsx scripts/lyric-vj/typeplan.test.mts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { landedEnd, stripUnsungSprites, unsungRule } from './interludes.mts';
import type { UnsungWindow } from '../../src/app/lyric-vj/structure';

const beats = Array.from({ length: 40 }, (_, i) => +(i * 0.78).toFixed(2)); // a 77 BPM ballad
const song = {
  title: 'fixture - ballad', duration: 31, tempo: 77, beats, downbeats: beats.filter((_, i) => i % 4 === 0),
  sections: [{ start: 0, end: 7.8, type: 'verse', energy: 0.2 }, { start: 7.8, end: 9.9, type: 'verse', energy: 0.2 }, { start: 9.9, end: 31, type: 'chorus', energy: 0.4 }],
  cues: [
    { id: 'c001', start: 0.5, end: 6, text: '重ねたすべては育つから' },
    { id: 'c002', start: 6.5, end: 9.5, text: '忘れないで' },
    { id: 'c003', start: 10, end: 16, text: '君の中に必ず' },
  ],
};
const sky = (colors: string[]) => [{ kind: 'paper', color: '#EDE4D3' }, { kind: 'bands', colors, from: 0, to: 0.7 }];
const treatment = {
  concept: 'a candle grows into a fire', shots: [{ id: 's1', start: 0, end: 7.8 }, { id: 's2', start: 7.8, end: 9.9 }, { id: 's3', start: 9.9, end: 31 }],
  cues: [{ cueId: 'c001', shot: 's1' }, { cueId: 'c002', shot: 's2' }, { cueId: 'c003', shot: 's3' }],
  design: { colorScript: [{ start: 0, shadow: '#0E1430', highlight: '#3A3F6E', accent: '#F2672E' }] },
  graphics: { sections: [{ start: 0, layers: sky(['#1B1530', '#3A1F45', '#E8A15A']) }, { start: 9, layers: sky(['#2A0F1E', '#B0402E', '#FFD08A']) }] },
};
const line = (cue: string) => ({ cue, enter: 'fade', exit: 'fade', idle: 'still', trail: false, emphasis: '', method: 'scale', symbol: 'star', emphasis2: '', method2: 'scale', zh: '' });
const cut = (beat: number, fx: string) => ({ beat, fx, flow: '', label: '', words: [], sprite: '', size: 0.85, heart: false, dark: false, cam: '', flash: '', transition: '' });
const plan = {
  backbone: '', thread: { what: '', mark: 'flame', sprite: '', why: '' }, document: false, print: 'duo', format: { pace: 'held', ground: 'flat', why: '' },
  devices: { revise: 'caret', document: 'blueprint', why: '' }, flowRule: '', styles: [], finish: '',
  shots: [
    // a heart beside a line with no love in it
    { shot: 's1', chapter: '', level: 0.2, backdrop: 'B1', lyric: { template: 'stair', side: 'right' }, lines: [{ ...line('c001'), emphasis: '育つ', method: 'symbol', symbol: 'heart' }], cuts: [cut(0, 'motes'), cut(8, 'stars')] },
    // lands 1.56 s after the cut before: under a held song's four beats, but it carries the shot's backdrop
    { shot: 's2', chapter: '', level: 0.4, backdrop: '', lyric: { template: 'stair', side: 'right' }, lines: [line('c002')], cuts: [cut(0, 'motes')] },
    { shot: 's3', chapter: '', level: 1, backdrop: 'B2', lyric: { template: 'stair', side: 'right' }, lines: [line('c003')], cuts: [{ ...cut(0, 'stars'), words: ['君の中', '夜空'] }] },
  ],
};

/** The plan rebuilt for a song (no director call): its output treatment and log. */
function rebuild(sng: object, pl: object, extra: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'typeplan-'));
  try {
    for (const [f, v] of [['song.json', sng], ['treatment.json', treatment], ['plan.json', pl]] as const) writeFileSync(join(dir, f), JSON.stringify(v));
    const r = spawnSync('npx', ['tsx', 'scripts/lyric-vj/typeplan.mts', '--song', join(dir, 'song.json'), '--treatment', join(dir, 'treatment.json'), '--backdrops', join(dir, 'treatment.json'), '--plan', join(dir, 'plan.json'), '--out', join(dir, 'out'), ...extra], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')) as { cues: { cueId: string; emphasis?: { method: string }[] }[]; graphics: { sections: { start: number; layers: { kind: string; fx?: string; colors?: string[] }[] }[] } };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a calm song keeps one backdrop through a part (its moves still change), no loud moves, no mark the line already prints', () => {
  const one = { ...song, sections: [{ start: 0, end: 31, type: 'verse', energy: 0.2 }], cues: song.cues.map((c) => (c.id === 'c002' ? { ...c, text: '忘れないで？' } : c)) };
  const pl = structuredClone(plan);
  pl.shots[1].lines = [{ ...line('c002'), emphasis: '忘れ', method: 'symbol', symbol: 'question' }];
  pl.shots[2].cuts = [cut(0, 'rays')];
  const t = rebuild(one, pl);
  const kin = t.graphics.sections.map((s) => s.layers.find((l) => l.kind === 'kinetic')!.fx);
  assert.ok(!kin.includes('rays'), `no loud move in a calm song: ${kin}`);
  const skies = t.graphics.sections.map((s) => JSON.stringify(s.layers.find((l) => l.kind === 'bands')?.colors));
  assert.equal(new Set(skies).size, 1, `one backdrop through the part: ${skies}`);
  assert.deepEqual(t.cues.find((c) => c.cueId === 'c002')!.emphasis!.map((e) => e.method), ['scale'], 'a ? sticker by a line ending in ？');
});

test('a shot keeps to its part\'s world: a backdrop outside the part\'s set takes the part\'s first', () => {
  const pl = { ...structuredClone(plan), parts: [{ from: 's1', shift: 'change', what: '', backdrops: ['B1'] }] };
  const t = rebuild(song, pl);
  const sky = (at: number) => JSON.stringify(t.graphics.sections.find((x) => Math.abs(x.start - at) < 0.01)!.layers.find((l) => l.kind === 'bands')?.colors);
  assert.equal(sky(9.9), sky(0), 's3 asked for B2 inside a part of B1');
  const free = rebuild(song, plan);
  const skyFree = JSON.stringify(free.graphics.sections.find((x) => Math.abs(x.start - 9.9) < 0.01)!.layers.find((l) => l.kind === 'bands')?.colors);
  assert.notEqual(skyFree, sky(0), 'without parts the shot keeps its own backdrop');
});

test('a calm song holds through the director\'s parts, warms a warm part and keeps its board through its cuts', () => {
  const one = { ...song, sections: [{ start: 0, end: 31, type: 'verse', energy: 0.2 }] };
  const keep = (style: string, words: string[]) => ({ style, items: words.map((word) => ({ sprite: '', word })) });
  const pl = { ...structuredClone(plan), parts: [
    { from: 's1', shift: 'change', what: '', warmth: 0.2, order: 1, keep: keep('', []), backdrops: ['B1'] },
    { from: 's3', shift: 'change', what: '', warmth: 0.9, order: 0, keep: keep('evidence', ['君の中', '夜空']), backdrops: ['B2'] },
  ] };
  const t = rebuild(one, pl, ['--board']);
  assert.ok(!JSON.stringify(rebuild(one, pl)).includes('"board"'), 'boards are off unless asked for');
  const at = (x: number) => t.graphics.sections.find((s) => Math.abs(s.start - x) < 0.01)!;
  const sky = (x: number) => JSON.stringify(at(x).layers.find((l) => l.kind === 'bands')?.colors);
  assert.notEqual(sky(9.9), sky(0), 'the second part kept the first part\'s sky inside one song section');
  assert.ok(!at(0).layers.some((l) => l.kind === 'fill'), 'a cold part is not warmed');
  assert.ok(at(9.9).layers.some((l) => l.kind === 'fill'), 'a warm part gets its glow');
  const board = (at(9.9).layers.find((l) => l.kind === 'kinetic') as unknown as { board?: { style: string; items: { text?: string; at: number }[]; order: number[] } }).board;
  assert.equal(board?.style, 'evidence');
  assert.deepEqual(board?.items.map((x) => x.text), ['君の中', '夜空'], 'no pictures in this version: the words are printed');
  assert.deepEqual(board?.order, [1, 0], 'its order eases from the part before');
  assert.ok(board!.items[0].at >= 9.9);
});

test('a rebuilt held song keeps every shot\'s first cut and both skies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'typeplan-'));
  try {
    for (const [f, v] of [['song.json', song], ['treatment.json', treatment], ['plan.json', plan]] as const) writeFileSync(join(dir, f), JSON.stringify(v));
    const r = spawnSync('npx', ['tsx', 'scripts/lyric-vj/typeplan.mts', '--song', join(dir, 'song.json'), '--treatment', join(dir, 'treatment.json'), '--backdrops', join(dir, 'treatment.json'), '--plan', join(dir, 'plan.json'), '--out', join(dir, 'out')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const [b1, b2] = [/B1 ([^|\n]*)/.exec(r.stdout)?.[1], /B2 ([^|\n]*)/.exec(r.stdout)?.[1]];
    assert.ok(b1 && b2 && b1.trim() !== b2.trim(), `two skies told apart: ${b1} / ${b2}`);
    const sections = JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')).graphics.sections as { start: number; layers: { kind: string }[] }[];
    const at = (t: number) => sections.find((s) => Math.abs(s.start - t) < 0.01);
    assert.ok(at(7.8), 'the second shot\'s first cut was skipped');
    assert.deepEqual(at(7.8)!.layers.map((l) => l.kind), ['kinetic'], 'the second shot asked for no backdrop');
    assert.ok(at(9.9)!.layers.some((l) => l.kind === 'bands'));
    const cues = JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')).cues as { cueId: string; emphasis?: { method: string }[] }[];
    assert.deepEqual(cues.find((c) => c.cueId === 'c001')!.emphasis!.map((e) => e.method), ['scale'], 'a heart by a line with no love in it');
    // a calm song's backgrounds carry no lyric words (one drawn while another line is sung reads as an extra line)
    assert.deepEqual((at(9.9)!.layers.find((l) => l.kind === 'kinetic') as unknown as { words: string[] }).words, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const OUTRO: UnsungWindow[] = [{ start: 16, end: 31, kind: 'outro' }];
const REASON = '尾奏回到前奏那盞燈，讓故事收在同一個房間';

test('stripUnsungSprites: a cut entirely inside a backdrop window loses its sprite', () => {
  const r = stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }], OUTRO, [{ start: 16, end: 31, mode: 'backdrop', reason: '' }]);
  assert.equal(r.removed, 1);
  assert.equal(r.cuts[0].sprite, undefined);
  assert.equal(r.cuts[0].at, 18);
});

test('stripUnsungSprites: a cut straddling the window edge keeps its sprite', () => {
  const r = stripUnsungSprites([{ at: 14, end: 20, sprite: 'moon' }, { at: 30, end: 32, sprite: 'sun' }], OUTRO);
  assert.equal(r.removed, 0);
  assert.deepEqual(r.cuts.map((c) => c.sprite), ['moon', 'sun']);
});

test('stripUnsungSprites: a cut inside a pictures window keeps its sprite', () => {
  const r = stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }], OUTRO, [{ start: 16, end: 31, mode: 'pictures', reason: REASON }]);
  assert.equal(r.removed, 0);
  assert.equal(r.cuts[0].sprite, 'moon');
});

test('stripUnsungSprites: pictures with a too-short reason counts as backdrop', () => {
  assert.equal(stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }], OUTRO, [{ start: 16, end: 31, mode: 'pictures', reason: '好看' }]).removed, 1);
});

test('stripUnsungSprites: no interludes data counts as backdrop', () => {
  assert.equal(stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }], OUTRO).removed, 1);
  assert.equal(stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }], OUTRO, []).removed, 1);
});

test('stripUnsungSprites: no windows removes nothing', () => {
  const r = stripUnsungSprites([{ at: 18, end: 24, sprite: 'moon' }, { at: 0, end: 3 }], []);
  assert.equal(r.removed, 0);
  assert.deepEqual(r.cuts.map((c) => c.sprite), ['moon', undefined]);
});

test('unsungRule: backdrop by default, no figures, props or illustrations', () => {
  const r = unsungRule(OUTRO);
  assert.ok(r.includes('用背景換段、圖形和節奏撐，不放人物、道具或插圖'), r);
  assert.ok(!r.includes('用圖形、人物和節奏撐'), r);
  assert.ok(r.includes('16.0–31.0 秒（尾奏）'), r);
  assert.ok(!r.includes('理由'), r);
});

test('unsungRule: a pictures window quotes the director\'s reason', () => {
  const r = unsungRule(OUTRO, [{ start: 16, end: 31, mode: 'pictures', reason: REASON }]);
  assert.ok(r.includes(`理由：「${REASON}」`), r);
  assert.ok(!r.includes('這首歌沒人唱的段落'), 'no backdrop windows left to list');
});

test('unsungRule: no windows keeps only the general rule', () => {
  assert.equal(unsungRule([]), '沒人唱的地方（前奏、間奏、尾奏）不要出現看得清楚的詞，用背景換段、圖形和節奏撐，不放人物、道具或插圖。');
});

test('a rebuild drops pictures from cuts inside a backdrop outro and logs it, keeps one over sung time', () => {
  const pl = structuredClone(plan);
  pl.shots[2].cuts = [{ ...cut(0, 'stars'), sprite: 'lamp' }, { ...cut(10, 'motes'), sprite: 'moon' }];
  const dir = mkdtempSync(join(tmpdir(), 'typeplan-'));
  try {
    for (const [f, v] of [['song.json', song], ['treatment.json', treatment], ['plan.json', pl]] as const) writeFileSync(join(dir, f), JSON.stringify(v));
    const r = spawnSync('npx', ['tsx', 'scripts/lyric-vj/typeplan.mts', '--song', join(dir, 'song.json'), '--treatment', join(dir, 'treatment.json'), '--backdrops', join(dir, 'treatment.json'), '--plan', join(dir, 'plan.json'), '--out', join(dir, 'out')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('interludes: removed 1 pictures'), r.stdout);
    const sections = JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')).graphics.sections as { start: number; layers: { kind: string; sprite?: string }[] }[];
    const kin = (s: { layers: { kind: string; sprite?: string }[] }) => s.layers.find((l) => l.kind === 'kinetic')!;
    assert.equal(kin(sections.find((s) => Math.abs(s.start - 9.9) < 0.01)!).sprite, 'lamp', 'the cut over sung time keeps its picture');
    const late = sections.filter((s) => s.start >= 16);
    assert.ok(late.length, 'the outro cut landed');
    assert.ok(late.every((s) => !kin(s).sprite), 'no picture in the outro');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a board keeps a picture over sung time and prints the word for one kept only inside a backdrop outro', () => {
  const one = { ...song, sections: [{ start: 0, end: 31, type: 'verse', energy: 0.2 }] };
  const pl = { ...structuredClone(plan), parts: [
    { from: 's1', shift: 'change', what: '', warmth: 0.2, order: 1, keep: { style: '', items: [] }, backdrops: ['B1'] },
    { from: 's3', shift: 'change', what: '', warmth: 0.5, order: 1, keep: { style: 'evidence', items: [{ sprite: 'lamp', word: '燈' }, { sprite: 'moon', word: '月' }] }, backdrops: ['B2'] },
  ] };
  const dir = mkdtempSync(join(tmpdir(), 'typeplan-'));
  try {
    for (const [f, v] of [['song.json', one], ['treatment.json', treatment], ['plan.json', pl]] as const) writeFileSync(join(dir, f), JSON.stringify(v));
    const lib = join(dir, 'sprites');
    mkdirSync(lib);
    writeFileSync(join(lib, 'library.json'), JSON.stringify({ sprites: [{ id: 'lamp', what: 'a lamp' }, { id: 'moon', what: 'the moon' }] }));
    writeFileSync(join(lib, 'assets.json'), '{}');
    const r = spawnSync('npx', ['tsx', 'scripts/lyric-vj/typeplan.mts', '--song', join(dir, 'song.json'), '--treatment', join(dir, 'treatment.json'), '--backdrops', join(dir, 'treatment.json'), '--plan', join(dir, 'plan.json'), '--out', join(dir, 'out'), '--sprites', lib, '--board'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const sections = JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')).graphics.sections as { start: number; layers: { kind: string; board?: { items: { sprite?: string; text?: string; at: number }[] } }[] }[];
    const board = sections.find((s) => Math.abs(s.start - 9.9) < 0.01)!.layers.find((l) => l.kind === 'kinetic')!.board!;
    assert.deepEqual(board.items.map((x) => x.sprite ?? `text:${x.text}`), ['lamp', 'text:月'], JSON.stringify(board.items));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('landedEnd: the next cut that lands ends this one; cuts inside the gap or at the shot end are skipped', () => {
  assert.equal(landedEnd([48, 49, 51], 0, 1.2, 60), 51, 'the cut 1 s later is skipped by the gap');
  assert.equal(landedEnd([48, 49.5], 0, 1.2, 60), 49.5);
  assert.equal(landedEnd([48, 49, 59.98], 0, 1.2, 60), 60, 'a cut at the shot end does not land');
  assert.equal(landedEnd([48], 0, 1.2, 60), 60);
});

test('unsungRule: board keep items follow the same rule', () => {
  assert.ok(unsungRule(OUTRO).includes('keep'), unsungRule(OUTRO));
});

test('a cut whose next cut is skipped by the hold runs into sung time and keeps its picture', () => {
  // s3 9.9–31 holds four beats (3.12 s): a cut at 21.06, the next planned at 22.62 is skipped, the one at 27.3 lands
  const sng = { ...song, cues: [...song.cues, { id: 'c004', start: 26, end: 30, text: '灯りをともして' }] };
  const tr = { ...treatment, cues: [...treatment.cues, { cueId: 'c004', shot: 's3' }] };
  const pl = structuredClone(plan);
  pl.shots[2].lines = [line('c003'), line('c004')];
  pl.shots[2].cuts = [cut(0, 'stars'), { ...cut(14, 'motes'), sprite: 'lamp' }, cut(16, 'wall'), cut(22, 'stars')];
  const dir = mkdtempSync(join(tmpdir(), 'typeplan-'));
  try {
    for (const [f, v] of [['song.json', sng], ['treatment.json', tr], ['plan.json', pl]] as const) writeFileSync(join(dir, f), JSON.stringify(v));
    const r = spawnSync('npx', ['tsx', 'scripts/lyric-vj/typeplan.mts', '--song', join(dir, 'song.json'), '--treatment', join(dir, 'treatment.json'), '--backdrops', join(dir, 'treatment.json'), '--plan', join(dir, 'plan.json'), '--out', join(dir, 'out')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const sections = JSON.parse(readFileSync(join(dir, 'out', 'treatment.json'), 'utf8')).graphics.sections as { start: number; layers: { kind: string; sprite?: string }[] }[];
    const starts = sections.map((s) => s.start);
    assert.ok(!starts.some((x) => Math.abs(x - 22.62) < 0.05), `the cut inside the hold was skipped: ${starts}`);
    const a = sections.find((s) => Math.abs(s.start - 21.06) < 0.05);
    assert.ok(a, `the picture cut landed: ${starts}`);
    assert.equal(a!.layers.find((l) => l.kind === 'kinetic')!.sprite, 'lamp', 'it runs on into c004');
    assert.ok(!r.stdout.includes('interludes: removed'), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
