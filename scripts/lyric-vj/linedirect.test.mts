// npx tsx scripts/lyric-vj/linedirect.test.mts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { piecesAt } from '../../src/app/lyric-vj/render/build-rows';
import { kn, KNOBS } from '../../src/app/lyric-vj/render/knobs';
import { ENTER_KINDS, EXIT_KINDS, IDLE_KINDS } from '../../src/app/lyric-vj/treatment';
import { TEMPLATES } from './typehelp.mts';
import { Cue, RECIPES } from './lineplan-core.mts';
import { checkDirection, Ctx, directedPlan, Direction, directionSchema, directorBase, directorPrompt, EXCLUDED_FX, LineChoice, paidClock, PaidPlan, keyFor, resolveSame, rowsOf, setTogetherLines, SongIn, stackOf, TUNABLE, unsungCuts, usdOf, wordPieces } from './linedirect-core.mts';

const why = { cut: '理由', layout: '理由', enter: '理由', idle: '理由', exit: '理由', decor: '' };
const line = (cue: string, over: Partial<LineChoice> = {}): LineChoice => ({ cue, sameAs: '', cut: 'hold', pieces: [], layout: 'stair', side: 'left', enter: 'fade', idle: 'still', exit: 'fade', decor: 'none', handoff: '', joinNext: '', lineCam: '', hit: '', emphasis: '', method: 'color', ground: '', evidence: '', why, ...over });
const texts = ['我等你回來到天亮', '整條街的燈都熄了', '你說過的話還留著', '我把信寫到最後一頁', '風吹過河面的時候', '我一個人走回家', '雨下到第二天早上', '你說過的話還留著'];
const cue = (i: number, text: string): Cue => ({ id: `c${i}`, start: 10 + i * 5, end: 10 + i * 5 + 3, text });
const cues = texts.map((t, i) => cue(i, t));
const song: SongIn = { title: 'T - 歌', duration: 60, tempo: 120, beats: Array.from({ length: 120 }, (_, i) => i / 2), cues, sections: [{ start: 0, end: 60, type: 'verse', energy: 0.5 }] };
const ctx: Ctx = { song, calm: false, partWhat: () => '等一個人回來', levelOf: () => 1, screenGrounds: ['rain', 'meteor'] };
const direction = (lines: LineChoice[], over: Partial<Direction> = {}): Direction => ({ reading: '等', icon: '', techniques: [], parts: [{ from: 's1', tension: 0.5, why: '' }], tune: [], lines, ...over });
const refused = (lines: LineChoice[], c = ctx, over: Partial<Direction> = {}) => checkDirection(direction(lines, over), c).fallbacks;
const full = (edit: Record<string, Partial<LineChoice>> = {}) => cues.map((c) => line(c.id, edit[c.id]));

// stacks
assert.equal(stackOf('lyric-carrier', 'tether-drop', 'tether-settle', 1)?.enter, 'tether-drop', 'a recipe pairing stands');
assert.equal(stackOf('stair', 'dash', 'drift', 1)?.template, 'stair', 'a plain entrance on a plain layout stands');
assert.equal(stackOf('lyric-carrier', 'dash', 'still', 1), undefined, 'a paper takes no plain entrance the kit never drew on it');
assert.equal(stackOf('punch', 'edge-light', 'drift', 1), undefined, 'a surface keeps its own hold');
assert.equal(stackOf('stair', 'gather', 'still', 1), undefined, 'scattered pieces are not on offer');
assert.equal(stackOf('build-cut', 'slam', 'thump', 1)?.enter, 'cut', 'a built line lands its own pieces whatever was asked');
assert.equal(stackOf('build-cut', 'cut', 'still', 1, true)?.params?.['soft'], true, 'a calm song builds softly');
assert.notEqual(stackOf('build-cut', 'cut', 'still', 1, false)?.id, 'build-calm', 'a loud song does not');
assert.equal(stackOf('punch', 'rise', 'still', 1)?.template, 'punch', 'a recipe that needs another hold does not close a plain stack');
assert.equal(stackOf('punch', 'edge-light', 'ink-state', 1)?.state, 'edge', 'its state comes with it');

// pieces
assert.deepEqual(rowsOf('快使用雙截棍 哼哼哈兮', ['快使用雙截棍', '哼哼哈兮']), [7]);
assert.equal(rowsOf('快使用雙截棍 哼哼哈兮', ['快使用雙', '截棍', '哼哼哈兮']), undefined, 'a word is never cut');
assert.equal(rowsOf('快使用雙截棍 哼哼哈兮', ['別的字', '哼哼哈兮']), undefined, 'the pieces are the line');
assert.equal(rowsOf('快使用雙截棍 哼哼哈兮', ['快使用雙截棍']), undefined, 'one piece is no split');
assert.deepEqual(rowsOf('半端ないステージ︕ 刮目せんかい︕ (かい!)', ['半端ないステージ！', '刮目せんかい！', '（かい！）']), [10], 'marks are one mark to a reader, a call is not a piece');
assert.deepEqual(rowsOf('(幹什麼? 幹什麼?) 呼吸吐納心自在', ['(幹什麼? 幹什麼?)', '呼吸', '吐納心自在']), [14], 'a call in front is no piece either');
assert.deepEqual(rowsOf('(幹什麼? 幹什麼?) 已被我一腳踢開 哈!', ['(幹什麼?', '幹什麼?)', '已被我', '一腳踢開', '哈!']), [15], 'a bracket cut in two is still a call, a lone cry stays with the piece before');
assert.equal(keyFor('もっと話した～い！！', '話した～い'), '話した～い！！', 'marks that end the line go with the big word, not on a row of their own');
assert.equal(keyFor('あたしのココ、空いてますよ︖', 'ココ、'), 'ココ', 'a comma is not set huge');
assert.deepEqual(piecesAt('快使用雙截棍 哼哼哈兮', [7]), [{ text: '快使用雙截棍', from: 0 }, { text: '哼哼哈兮', from: 7 }]);
assert.ok(wordPieces('快使用雙截棍 哼哼哈兮').every((p) => p.trim()), 'the breaks shown to the director are whole words');

// guards
assert.equal(refused(full()).length, 0, 'plain lines pass');
const none = (f: { cue: string; field: string }[], cue: string, field: string) => !f.some((x) => x.cue === cue && x.field === field);
assert.ok(!none(refused(full({ c0: { layout: 'no-such' } })), 'c0', 'layout'), 'an unknown layout falls back');
assert.ok(!none(refused(full({ c0: { exit: 'nope' } })), 'c0', 'exit'), 'an unknown exit falls back');
assert.ok(!none(refused(full({ c0: { ground: 'hud' } })), 'c0', 'ground'), 'an excluded move is refused');
assert.ok(!none(refused(full({ c0: { ground: 'glitch' } })), 'c0', 'ground'), 'an excluded move is refused');
assert.ok(!none(refused(full({ c0: { cut: 'split' } })), 'c0', 'layout'), 'split on a held layout is a contradiction');
assert.ok(!none(refused(full({ c0: { layout: 'build-cut', enter: 'cut' } })), 'c0', 'layout'), 'so is hold on a built line');
assert.ok(none(refused(full({ c0: { layout: 'build-cut', enter: 'cut', cut: 'split' } })), 'c0', 'layout'));
const tether = { layout: 'lyric-carrier', enter: 'tether-drop', idle: 'tether-settle', side: 'left' };
assert.ok(none(refused(full({ c0: { ...tether } })), 'c0', 'layout'), 'the words name it: no quote needed');
assert.ok(!none(refused(full({ c1: { ...tether } })), 'c1', 'layout'), 'a device nothing in the line gives a reason for is refused');
assert.ok(none(refused(full({ c1: { ...tether, evidence: '熄' } })), 'c1', 'layout'), 'quoted from the line it stands');
assert.ok(none(refused(full({ c1: { ...tether, evidence: '等一個人' } })), 'c1', 'layout'), 'or from its part');
assert.ok(!none(refused(full({ c1: { ...tether, evidence: '沒唱過的字' } })), 'c1', 'layout'), 'not from nowhere');
const twoClose = refused(full({ c0: { ...tether }, c1: { ...tether, evidence: '熄' } }));
assert.ok(!none(twoClose, 'c1', 'layout'), 'papers keep their distance');
const calm = { ...ctx, calm: true, levelOf: () => 0 };
assert.ok(!none(refused(full({ c2: { enter: 'slam' } }), calm), 'c2', 'layout'), 'a calm song takes nothing loud');
assert.ok(!none(refused(full({ c2: { ground: 'meteor' } }), calm), 'c2', 'ground'));
assert.ok(!none(refused(full({ c2: { hit: 'zoom' } }), { ...ctx, levelOf: () => 2, calm: true }), 'c2', 'hit'));
assert.ok(!none(refused(full({ c2: { exit: 'glyph-shed' } }), calm), 'c2', 'exit'));
assert.ok(!none(refused(full({ c2: { decor: 'oval' }, c3: { decor: 'oval' } })), 'c3', 'decor'), 'one ring a part');
assert.ok(!none(refused(full({ c2: { decor: 'icon' } })), 'c2', 'decor'), 'no icon without the song naming one');
assert.ok(none(refused(full({ c2: { decor: 'icon' } }), ctx, { icon: 'flower' }), 'c2', 'decor'));
assert.ok(!none(refused(cues.slice(1).map((c) => line(c.id))), 'c0', 'line'), 'a line left out is logged');
const quick: Cue[] = [{ id: 'q0', start: 1, end: 2, text: '這是一句唱得飛快的歌詞' }, { id: 'q1', start: 2.1, end: 3.1, text: '後面還有更快的一句歌' }, { id: 'q2', start: 8, end: 11, text: '後面這句慢' }];
assert.deepEqual([...setTogetherLines(quick)], ['q0', 'q1'], 'too fast to read apart: set together');
const q = checkDirection(direction(quick.map((c) => line(c.id))), { ...ctx, song: { ...song, cues: quick } });
assert.ok(!q.accepted.get('q0')?.recipe && !q.accepted.get('q1')?.recipe && q.accepted.get('q2')?.recipe, 'the director cannot pull them apart');
assert.ok(none(q.fallbacks, 'q0', 'layout'), 'lines set together by rule are not logged as a mistake of the director');
const same = resolveSame([line('c0', { layout: 'punch', enter: 'pop' }), line('c7', { sameAs: 'c0', layout: 'stair', enter: 'fade' })]).get('c7')!;
assert.equal(same.layout, 'punch', 'a repeat takes the earlier line');
assert.equal(same.cue, 'c7');

assert.ok(!none(refused(full({ c2: { layout: 'punch', enter: 'edge-light', idle: 'ink-state', exit: 'glyph-shed', evidence: '話' } })), 'c2', 'exit'), 'a held surface takes no drawn exit');
// the plan
const paidShots = [{ id: 's1', start: 0, end: 10 }, { id: 's2', start: 10, end: 40 }, { id: 's3', start: 40, end: 60 }];
const paid: PaidPlan = { vision: { kinds: ['mood'], change: '光', why: '' }, parts: [{ from: 's1', what: '前奏' }, { from: 's3', what: '後段' }], format: { pace: 'mixed', ground: 'grain', why: '' }, finish: 'dots', backbone: '骨幹', shots: [{ shot: 's1', backdrop: 'B1', cuts: [{ beat: 0, fx: 'credits', words: ['歌'] }, { beat: 8, fx: 'hud', words: ['假'] }] }, { shot: 's2', backdrop: 'B2', cuts: [{ beat: 0, fx: 'rain' }] }, { shot: 's3', backdrop: '', cuts: [{ beat: 0, fx: 'motes' }] }] };
const parts = [{ cue: 'c0', what: '前奏', energy: 0.5 }, { cue: 'c6', what: '後段', energy: 0.4 }];
const lines = full({ c0: { emphasis: '天亮', method: 'mark' }, c1: { layout: 'build-cut', enter: 'cut', cut: 'split', pieces: ['整條街的燈都', '熄了'], ground: 'rain' }, c2: { layout: 'no-such' } });
const d = direction(lines, { tune: [{ key: 'rain.n', value: 170, cue: 'c1', why: '雨很大' }, { key: 'hud.ticks', value: 5, cue: 'c1', why: '' }], techniques: [{ id: 'hold', where: 'c0', why: '停' }] });
const built = directedPlan(song, d, ctx, paid, paidShots, parts, song.beats);
const shotOf = (cueId: string) => (built.plan.shots as unknown as { lines: Record<string, unknown>[]; cuts: Record<string, unknown>[]; lyric: { template: string }; backdrop: string }[]).find((s) => s.lines.some((l) => l['cue'] === cueId))!;
const lineOf = (cueId: string) => shotOf(cueId).lines.find((l) => l['cue'] === cueId)!;
assert.equal(shotOf('c0').cuts.length, 1, 'a held line has one background however many beats it spans');
assert.ok(shotOf('c1').cuts.length > 1, 'a split line keeps its cuts');
assert.deepEqual(lineOf('c1')['rows'], [6], 'the director\'s breaks reach the line');
assert.equal(shotOf('c1').cuts[0]['fx'], 'rain');
assert.equal((shotOf('c1').cuts[0]['tune'] as Record<string, number>)['rain.n'], 170, 'a count from the lyric reaches every cut of that move');
assert.equal(lineOf('c0')['method'], 'mark');
assert.equal(lineOf('c0')['emphasis'], '天亮');
assert.deepEqual((lineOf('c0')['direct'] as { why: unknown }).why, why, 'the reasons are stored in the plan');
assert.deepEqual((lineOf('c2')['direct'] as { fallback: string[] }).fallback, ['layout'], 'a fallback is marked on its line');
assert.ok(RECIPES.some((r) => r.template === shotOf('c2').lyric.template && r.enter === lineOf('c2')['enter']), 'a line the director lost keeps a stack the composer chose');
assert.equal(built.plan.document, false, 'no line counter in the corner');
assert.equal(built.plan.finish, 'dots', 'the paid finish stays');
assert.equal(shotOf('c0').backdrop, 'B2', 'the paid world stays at its time');
assert.ok(built.fallbacks.some((f) => f.field === 'tune'), 'a count not on offer is logged');
assert.ok(built.decisions.every((x) => x['cut'] === 'hold' || x['cut'] === 'split'));
const rejected = directedPlan(song, d, ctx, paid, paidShots, parts, song.beats, new Set(['c0']));
assert.ok(rejected.fallbacks.some((f) => f.cue === 'c0' && f.reason.includes('render')), 'a render\'s verdict sends a line back');
assert.ok(rejected.plan.shots.length > 0 && !(rejected.plan.shots as unknown as { lines: { cue: string; direct: { why: unknown } }[]; cuts: unknown[] }[]).find((s) => s.lines.some((l) => l.cue === 'c0'))!.lines.some((l) => l.cue === 'c0' && (l as unknown as { rows?: number[] }).rows));

const twice = [cue(0, '我等你回來到天亮'), cue(1, '我等你回來到天亮'), cue(2, '整條街的燈都熄了')];
const repeatSong = { ...song, cues: twice };
const again = directedPlan(repeatSong, direction(twice.map((c) => line(c.id, { ...tether, evidence: '等' }))), { ...ctx, song: repeatSong }, paid, paidShots, parts.slice(0, 1).map((p) => ({ ...p, cue: 'c0' })), song.beats);
assert.ok(again.fallbacks.some((f) => f.cue === 'c1' && f.field === 'layout'), 'the second paper is refused');
assert.notEqual((again.plan.shots as unknown as { lines: { cue: string; enter: string }[] }[]).find((s) => s.lines.some((l) => l.cue === 'c1'))?.lines[0].enter, 'tether-drop', 'and a repeat does not inherit the stack it lost');
const refusedPair = directedPlan(repeatSong, direction(twice.map((c) => line(c.id, { joinNext: c.id === 'c0' ? 'reply' : '' }))), { ...ctx, song: repeatSong }, paid, paidShots, parts.slice(0, 1).map((p) => ({ ...p, cue: 'c0' })), song.beats);
assert.ok(refusedPair.fallbacks.some((f) => f.field === 'joinNext'), 'one line sung twice is no pair, and it says so');
const noParts = directedPlan(song, direction(full()), ctx, { ...paid, parts: undefined }, paidShots, [], song.beats);
assert.ok(noParts.plan.shots.length, 'a paid plan with no parts still plans, on the song\'s sections');
const clock = paidClock(paid, paidShots, song.beats);
const intro = unsungCuts(clock, { start: 0, end: 10 }, song.beats);
assert.equal(intro[0].fx, 'credits', 'an unsung stretch keeps the paid director\'s cut');
assert.equal(intro[0].beat, 0);
assert.deepEqual([intro[1]?.fx, intro[1]?.words], ['motes', []], 'an excluded move gives way, and its words with it');
const introShot = (built.plan.shots as unknown as { lines: unknown[]; cuts: { fx: string }[] }[]).find((s) => !s.lines.length)!;
assert.equal(introShot.cuts[0].fx, 'credits');

// the base and the guards on it
const base = { design: { language: 'risograph', techniques: ['flash', 'pieces', 'skeleton'], colorScript: [{ highlight: '#EEEEEE' }] }, shots: [{ id: 's1', camera: 'push' }], cues: [], graphics: { sections: [{ start: 0, layers: [{ kind: 'mist' }, { kind: 'mist', color: '#123456' }] }] }, moments: [{ at: 3 }], concept: '概念' };
const b = directorBase(base, built.plan as never, built.shots);
assert.equal(b.design.language, 'risograph', 'the paid language stays');
assert.equal(b.concept, '概念');
assert.deepEqual(b.design.techniques, ['skeleton'], 'no flying strokes, no keyword flash over a line being read');
assert.ok(b.design.composer && b.design.lineDirect, 'word-safe breaks on, the keyline kept');
assert.deepEqual(b.graphics.sections[0].layers.map((l: { color?: string }) => l.color), ['#EEEEEE', '#123456'], 'a mist with no ink is given one, not thrown');
assert.equal(b.moments.length, 1);

// the prompt offers no excluded move and no key it cannot honour
const prompt = directorPrompt(song, ctx, { language: 'x', languageWhat: 'y', concept: 'z', backbone: 'b', change: 'c', palette: 'p', parts: [{ id: 's1', cue: 'c0', start: 0, what: 'w', energy: 0.5 }], lessons: '' });
for (const f of EXCLUDED_FX) assert.ok(!new RegExp(`\\b${f}（`).test(prompt), `${f} is not offered`);
for (const k of ['B40', 'B43', 'B44', 'B45', 'B46', 'B49', 'B50']) assert.ok(prompt.includes(k) , `${k} reaches the prompt with its condition`);
assert.ok(prompt.includes('hold') && prompt.includes('split') && prompt.includes('不是每句都要拆'), 'where to split is the director\'s call');
assert.ok(TUNABLE.every((k) => KNOBS[k]), 'every tunable count is a real knob');
assert.equal(kn({ tune: { 'meteor.n': 3 } }, 'meteor.n'), 3, 'a count set from the lyric is used');
assert.equal(kn({ tune: { 'meteor.n': 90 } }, 'meteor.n'), KNOBS['meteor.n'][2], 'but stays what the move can draw');
assert.equal(kn({ song: 7, mood: 0.5 }, 'meteor.n'), kn({ song: 7, mood: 0.5, tune: {} }, 'meteor.n'), 'unset, the song\'s own pick');
assert.equal(usdOf(1e6, 1e6), 24, 'the current director\'s prices');
assert.ok(JSON.stringify(directionSchema()).length < 4000, 'the schema stays small: enums blew the grammar limit once');

// the paid director's own lists stay as they were
const lists = readFileSync('src/app/lyric-vj/treatment.ts', 'utf8');
assert.ok(lists.includes("export const ENTER_KINDS: EnterKind[] = ['pop', 'slam'"));
assert.equal(ENTER_KINDS.length, 28);
assert.equal(EXIT_KINDS.length, 18);
assert.equal(IDLE_KINDS.length, 9);
assert.equal(Object.keys(TEMPLATES).length, 15);
assert.ok(RECIPES.length > 90);
console.log('linedirect: ok');

// the picture tier's director is asked to leave its props a side, and only it
{
  const facts = { language: 'x', languageWhat: 'x', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '' };
  assert.ok(directorPrompt(song, ctx, { ...facts, props: true }).includes('這一版有插圖'), 'props: told to leave a side');
  assert.ok(!directorPrompt(song, ctx, facts).includes('這一版有插圖'), 'no props: not told');
}
