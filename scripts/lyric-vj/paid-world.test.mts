// npx tsx --test scripts/lyric-vj/paid-world.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composePlan, RECIPES, type Cue } from './lineplan-core.mts';
import { poolOf } from '../../src/app/lyric-vj/style-world';
import { STYLE_WORLDS, worldById } from '../../src/app/lyric-vj/style-worlds';
import { FREE_BASE } from '../../src/app/lyric-vj/free-plan';
import { HELD_WORLDS } from '../../src/app/lyric-vj/free-styles';
import { overusedWorlds, planWorldOf, recordWorld, worldBase, worldCandidates, worldKitPrompt, worldPickPrompt, worldPoolOf, worldTreatment, worldDrawStyle, worldPageLook } from './paid-world.mts';

const texts = ['我等你回來到天亮', '整條街的燈都熄了', '你說過的話還留著', '我把信寫到最後一頁', '風吹過河面的時候', '我一個人走回家'];
const cues: Cue[] = texts.map((t, i) => ({ id: `c${i}`, start: 10 + i * 5, end: 10 + i * 5 + 3, text: t }));
const song = { title: 'T - 歌', duration: 60, tempo: 120, beats: Array.from({ length: 120 }, (_, i) => i / 2), downbeats: [] as number[], beatStrength: [] as number[], cues, sections: [{ start: 0, end: 60, type: 'verse', energy: 0.5 }] };

test('worldCandidates: a language names its worlds, an id its one, anything else every world', () => {
  assert.deepEqual(worldCandidates('silkscreen').map((w) => w.id), ['silk', 'silk-cold']);
  assert.deepEqual(worldCandidates('riso').map((w) => w.id), ['riso']);
  const OFFERED = STYLE_WORLDS.length - HELD_WORLDS.size;
  assert.equal(worldCandidates('auto').some((w) => HELD_WORLDS.has(w.id)), false, 'worlds being redrawn are not offered');
  assert.equal(worldCandidates('phone').length, OFFERED, 'a style with no world yet: the director picks');
  assert.equal(worldCandidates('auto').length, OFFERED);
  assert.equal(worldCandidates(undefined).length, OFFERED);
});

test('the design history: worlds used twice in the last songs are to be avoided; a song\'s world is written in once', () => {
  const h = [{ song: 'a', world: 'silk' }, { song: 'b', world: 'silk' }, { song: 'c', world: 'riso' }, { song: 'd', language: 'x' }];
  assert.deepEqual(overusedWorlds(h, 'z'), ['silk']);
  assert.deepEqual(overusedWorlds(h, 'a'), [], 'the song\'s own record does not count');
  const r = recordWorld(h, 'd', 'ukiyoe');
  assert.equal(r.length, 4);
  assert.equal(r[3].world, 'ukiyoe');
  assert.equal(recordWorld(h, 'new', 'card').at(-1)?.world, 'card');
});

test('planWorldOf: the free tier\'s scheme rule, the world\'s colours and face', () => {
  const pw = planWorldOf(worldById('silk')!, song, false, '理由', 'director');
  assert.equal(pw.id, 'silk');
  assert.ok(pw.scheme >= 0 && pw.scheme < 3);
  assert.match(pw.palette.ink, /^#/);
  assert.equal(pw.font, 'Chiron Hei HK', 'Han-only lyrics take the world\'s tc face');
  assert.equal(planWorldOf(worldById('silk')!, { ...song, cues: [{ ...cues[0], text: 'ひかり' }] }, false, '', 'buyer').font, 'Zen Kaku Gothic New');
  assert.equal(worldPoolOf(pw).id, 'silk');
});

test('the prompts: the pick lists every candidate with its reason to avoid; the kit lists the sets, shared stacks and grounds', () => {
  const pick = worldPickPrompt(song, worldCandidates('silkscreen'), ['silk'], '概念', true);
  assert.ok(pick.includes('- silk｜') && pick.includes('- silk-cold｜') && pick.includes('這首避免：silk') && pick.includes('安靜的歌'));
  const chalk = worldById('chalkboard')!;
  const kit = worldKitPrompt(chalk, poolOf(chalk, RECIPES, 0), false, 30);
  assert.ok(kit.includes('chalkboard/lesson') && kit.includes('chalk-hand') && kit.includes('共用版面：這個世界沒有') && kit.includes('decor 只能 none 或 fine-note') && kit.includes('handoff 一律空字串'));
  const silk = worldById('silk')!;
  const skit = worldKitPrompt(silk, poolOf(silk, RECIPES, 0), false, 30);
  assert.ok(skit.includes('punch + zoom + thump') && skit.includes('整首最多 12 句') && !skit.includes('decor 只能'));
});

test('worldBase and worldTreatment: the free tier\'s treatment on the world, the concept kept, props on their cuts', () => {
  const silk = worldById('silk')!;
  const pw = planWorldOf(silk, song, false, '', 'buyer');
  const { plan, shots } = composePlan(song, { palette: 'tea', ground: 'grain', reading: '', parts: [{ from: 'c0', tension: 0.5, fx: [], what: '等' }], keys: [] }, false, { director: true, world: worldPoolOf(pw) });
  const base0 = { ...FREE_BASE(), concept: '概念', design: { ...FREE_BASE().design, language: 'silkscreen', signature: { x: 1 } } };
  const base = worldBase(base0 as never, plan as never, shots, pw);
  assert.equal(base.concept, '概念', 'the concept is what the world does not cover');
  assert.equal(base.design.font, pw.font);
  assert.ok(base.design.lineDirect && base.design.composer);
  assert.equal(base.design.language, undefined, 'the old language\'s devices stay out');
  assert.equal(base.design.colorScript[0].shadow, pw.palette.ink);
  // a prop bound into a cut reaches its layer, smaller under a centred line, on a side
  const planned = plan.shots as unknown as { lines: unknown[]; cuts: Record<string, unknown>[] }[];
  const sung = planned.find((s) => s.lines.length)!;
  sung.cuts[0]['sprite'] = 'lamp.street';
  sung.cuts[0]['size'] = 1.2;
  const tr = worldTreatment(song as never, plan as never, base as never, pw);
  assert.equal(tr.design!.font, pw.font);
  assert.equal((tr.design as { world?: { id: string } }).world?.id, 'silk');
  assert.equal(tr.design!.grain, silk.frameStack.grain, 'the world\'s frame stack');
  const layers = tr.graphics!.sections.flatMap((s) => s.layers as { kind: string; sprite?: string; size?: number; side?: string; world?: unknown }[]);
  const prop = layers.find((l) => l.sprite === 'lamp.street');
  assert.ok(prop, 'the prop is on its cut');
  assert.ok(prop!.size! <= 0.75 && prop!.side !== 'center', 'smaller and to a side under a centred world line');
  assert.ok(layers.some((l) => l.world), 'the cuts are world grounds');
  assert.ok(tr.cues.some((c) => (c as { world?: unknown }).world), 'the lines are world lines');
});

test('the story tier on a world: drawn in its print and inks, its pages on its paper', () => {
  const pw = planWorldOf(worldById('riso')!, song, false, '理由', 'director');
  const style = worldDrawStyle(pw);
  assert.match(style, /risograph/, 'the world\'s print');
  for (const c of [pw.palette.ink, pw.palette.accent, pw.palette.paper]) assert.ok(style.includes(c), `its ink ${c}`);
  assert.ok(style.includes(worldById('riso')!.refuses[0]), 'what the world refuses');
  const look = worldPageLook({ paper: '#000', ink: '#111', accent: '#222', texture: 'grain', border: 6 }, pw);
  assert.deepEqual([look.paper, look.ink, look.accent, look.texture, look.border], [pw.palette.paper, pw.palette.ink, pw.palette.accent, 'grain', 6], 'the inks are the world\'s, the rest the art director\'s');
  assert.throws(() => worldDrawStyle({ ...pw, id: 'nope' }));
});
