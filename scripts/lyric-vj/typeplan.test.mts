// Rebuild tests for typeplan.mts from a fixed plan (no director call): npx tsx scripts/lyric-vj/typeplan.test.mts
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

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
