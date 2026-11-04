// npx tsx scripts/lyric-vj/linedirect.test.mts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { piecesAt } from '../../src/app/lyric-vj/render/build-rows';
import { kn, KNOBS } from '../../src/app/lyric-vj/render/knobs';
import { ENTER_KINDS, EXIT_KINDS, IDLE_KINDS } from '../../src/app/lyric-vj/treatment';
import { TEMPLATES } from './typehelp.mts';
import { Cue, RECIPES } from './lineplan-core.mts';
import { NOTE_PER_PART, noteRefusal, songScript, checkDirection, Ctx, directedPlan, Direction, directionSchema, directorBase, directorPrompt, EXCLUDED_FX, LineChoice, paidClock, PaidPlan, keyFor, resolveSame, rowsOf, setTogetherLines, SongIn, stackOf, TUNABLE, unsungCuts, usdOf, wordPieces } from './linedirect-core.mts';

const why = { cut: '理由', layout: '理由', enter: '理由', idle: '理由', exit: '理由', decor: '' };
const line = (cue: string, over: Partial<LineChoice> = {}): LineChoice => ({ cue, sameAs: '', cut: 'hold', pieces: [], layout: 'stair', side: 'left', enter: 'fade', idle: 'still', exit: 'fade', decor: 'none', note: '', noteKind: '', handoff: '', joinNext: '', lineCam: '', hit: '', emphasis: '', method: 'color', ground: '', evidence: '', why, ...over });
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

// signature moments: only a run that asks gets the field and the offer
assert.ok(!('moments' in directionSchema().properties), 'the schema has no moments unless asked');
assert.ok(directionSchema(true).required.includes('moments'), 'asked, moments are required');
assert.ok(!directorPrompt(song, ctx, { language: 'x', languageWhat: '', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '' }).includes('專屬時刻'), 'no offer unless asked');
const offered = directorPrompt(song, ctx, { language: 'x', languageWhat: '', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '', moments: { overused: ['shape/chain'] } });
assert.ok(offered.includes('strike/tear') && offered.includes('shape/wave') && offered.includes('這首避免：shape/chain'), 'the forms on offer and the overused ones');
assert.ok(['strike/burn', 'strike/melt', 'strike/slice', 'strike/fly', 'shape/circle', 'freeze/stop', 'echo/ghost'].every((v) => offered.includes(v)), 'every drawn variant is offered');
assert.ok(offered.includes('strike/wipe') && offered.includes('shape/rise'), 'the wipe and the smoke rise, passed, are offered');
assert.ok(offered.includes('燃') && offered.includes('瞬間'), 'with the senses it can show');
// the director is asked for the line's meaning, the whole word, and told zero is normal; a character inside another word is no reason
assert.ok(offered.includes('空陣列是正常的') && offered.includes('整個詞') && offered.includes('振り切って') && offered.includes('輪郭'), 'moments by meaning: the whole word, the refused examples, zero as the norm');
assert.ok(!offered.includes('shape/spiral') && !offered.includes('shape/heart'), 'a variant not drawn is not offered');
assert.deepEqual(directionSchema(true).properties.moments.items.properties.form.enum, ['strike', 'shape', 'freeze', 'echo'], 'the schema offers every form');
assert.ok(offered.includes('昇天') && offered.includes('空へ') && offered.includes('往上升'), 'the rise is offered for lines that mean going up, not only smoke');

// word sync: only a run that asks gets the field and the offer; the director is told it is a choice, with the guards
assert.ok(!('wordSync' in directionSchema().properties) && !('wordSync' in directionSchema(true).properties), 'the schema has no word sync unless asked');
assert.ok(directionSchema(false, true).required.includes('wordSync'), 'asked, word sync is required');
assert.deepEqual(directionSchema(false, true).properties.wordSync.items.required, ['cue', 'why'], 'each ask is a line and its reason');
assert.ok(!directorPrompt(song, ctx, { language: 'x', languageWhat: '', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '' }).includes('逐字同步'), 'no word sync offer unless asked');
const synced = directorPrompt(song, ctx, { language: 'x', languageWhat: '', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '', wordSync: true });
assert.ok(synced.includes('wordSync（逐字同步）') && synced.includes('不是每句都要') && synced.includes('零句是正常的') && synced.includes(`整首最多 ${Math.ceil(cues.length * 0.4)} 句`), 'word sync is offered as a choice, with its share');

// the director's own small words: never a part's name, a made-up number, an echo of nothing sung, a stranger singing
assert.equal(noteRefusal('scene', '凌晨三點・月台', '我等你回來到天亮', [], []), undefined);
assert.match(noteRefusal('chapter', '副歌', '我等你回來到天亮', [], []) ?? '', /generic/);
assert.match(noteRefusal('scene', '03:00 月台', '我等你回來到天亮', [], []) ?? '', /numbers/);
assert.equal(noteRefusal('scene', '第 2 天的車站', '第 2 次說再見', [], []), undefined, 'a number the line sings may stand');
assert.equal(noteRefusal('echo', '整條街的燈', '你說過的話還留著', ['我等你回來到天亮', '整條街的燈都熄了'], []), undefined);
assert.match(noteRefusal('echo', '從沒唱過', '你說過的話還留著', ['我等你回來到天亮'], []) ?? '', /sung before/);
assert.match(noteRefusal('singer', '小明', 'x', [], ['阿花']) ?? '', /singers/);
assert.match(noteRefusal('scene', '夜晚・橋邊', '夜晚的橋邊在飄雪', [], []) ?? '', /own words/, 'a scene that only repeats the line');
assert.equal(noteRefusal('chapter', '又一個冬天', '數不盡想你的黑夜', [], []), undefined);
assert.match(noteRefusal('scene', '一二三四五六七八九十一二三四五', 'x', [], []) ?? '', /characters/);
{
  const ok = checkDirection(direction(full({ c2: { decor: 'fine-note', noteKind: 'echo', note: '整條街的燈' } })), ctx);
  assert.equal(ok.accepted.get('c2')?.note, '整條街的燈', 'an echo of c1 stands on c2');
  const bad = checkDirection(direction(full({ c2: { decor: 'fine-note', noteKind: 'chapter', note: '副歌' } })), ctx);
  assert.ok(!bad.accepted.get('c2')?.note && bad.fallbacks.some((f) => f.cue === 'c2' && f.field === 'note'), 'a part name is refused and logged');
  const many = checkDirection(direction(full(Object.fromEntries(cues.map((c) => [c.id, { decor: 'fine-note', noteKind: 'scene', note: '雨夜' }])))), ctx);
  assert.equal([...many.accepted.values()].filter((a) => a.note).length, NOTE_PER_PART, 'a part carries at most NOTE_PER_PART notes');
}

// on a style world (paid-world.mts): the director chooses inside the world's closed pool
{
  const { poolOf } = await import('../../src/app/lyric-vj/style-world');
  const { worldById } = await import('../../src/app/lyric-vj/style-worlds');
  const { planWorldOf } = await import('./paid-world.mts');
  const { worldStackOf } = await import('./linedirect-core.mts');
  const silk = worldById('silk')!;
  const W = poolOf(silk, RECIPES, 0);
  const wctx: Ctx = { ...ctx, world: W };
  const ws = worldStackOf('silk/top-slab', 'squeegee', 'plate-lift', 'press-set', 1, W)!;
  assert.equal(ws.recipe.wline?.set, 'silk/top-slab');
  assert.deepEqual(ws.fixes, [], 'the set\'s own moves stand');
  const fixed = worldStackOf('silk/top-slab', 'fade', 'glyph-shed', 'still', 1, W)!;
  assert.deepEqual([fixed.recipe.wline?.enter, fixed.recipe.wline?.exit, fixed.fixes], ['squeegee', 'plate-lift', ['enter', 'exit', 'idle']], 'moves not the set\'s take its first, each named');
  assert.equal(worldStackOf('stair', 'fade', 'still', 'still', 1, W), undefined, 'an open layout names no set');
  const wline = (cue: string, over: Partial<LineChoice> = {}) => line(cue, { layout: 'silk/top-slab', enter: 'squeegee', idle: 'press-set', exit: 'plate-lift', side: 'center', ...over });
  const wfull = (edit: Record<string, Partial<LineChoice>> = {}) => cues.map((c) => wline(c.id, edit[c.id]));
  const ok = checkDirection(direction(wfull()), wctx);
  assert.equal(ok.fallbacks.length, 0, `world sets pass: ${JSON.stringify(ok.fallbacks)}`);
  assert.equal(ok.accepted.get('c0')?.recipe?.template, 'world-set');
  assert.equal(ok.accepted.get('c0')?.exit, undefined, 'a world set\'s exit is in its recipe, not a separate choice');
  const out = checkDirection(direction(wfull({ c1: { layout: 'stair', enter: 'fade', idle: 'still', exit: 'fade' } })), wctx);
  assert.ok(out.fallbacks.some((f) => f.cue === 'c1' && f.field === 'layout' && /pool/.test(f.reason)), 'an open stack outside the pool goes back to the composer');
  const shared = checkDirection(direction(wfull({ c1: { layout: 'punch', enter: 'slam', idle: 'thump', exit: 'fade' } })), wctx);
  assert.equal(shared.accepted.get('c1')?.recipe?.template, 'punch', 'a shared stack the world lets in stands');
  const tooMany = checkDirection(direction(cues.map((c) => line(c.id, { layout: 'punch', enter: 'slam', idle: 'thump', exit: 'fade' }))), wctx);
  assert.ok(tooMany.fallbacks.some((f) => f.field === 'layout' && /share/.test(f.reason)), 'shared stacks past their share of the world go back');
  const split = checkDirection(direction(wfull({ c1: { cut: 'split', pieces: ['整條街的燈都', '熄了'] } })), wctx);
  assert.ok(split.accepted.get('c1')?.hold && split.fallbacks.some((f) => f.cue === 'c1' && f.field === 'cut'), 'a world set holds the line whole, the split logged');
  const ground = checkDirection(direction(wfull({ c1: { ground: 'herringbone' }, c2: { ground: 'rain' } })), wctx);
  assert.equal(ground.accepted.get('c1')?.ground, 'herringbone', 'a ground of the world at this level stands');
  assert.ok(!ground.accepted.get('c2')?.ground && ground.fallbacks.some((f) => f.cue === 'c2' && f.field === 'ground'), 'a ground outside the world is refused');
  const cam = checkDirection(direction(wfull({ c1: { lineCam: 'lean' }, c2: { hit: 'zoom' } })), { ...wctx, levelOf: () => 2 });
  assert.ok(cam.fallbacks.some((f) => f.cue === 'c1' && f.field === 'lineCam'), 'a world set carries its own motion');
  assert.ok(cam.fallbacks.some((f) => f.cue === 'c2' && f.field === 'hit'), 'no hit a world does not have');
  // a world without paper devices: no small marks but the director's own words, no drawn exits, no handoffs
  const chalk = worldById('chalkboard')!;
  const C = poolOf(chalk, RECIPES, 0);
  assert.ok(!C.devices && !C.handoffs);
  const cline = (cue: string, over: Partial<LineChoice> = {}) => line(cue, { layout: 'chalkboard/lesson', enter: 'chalk-write', idle: 'hand-shake', exit: 'wipe-off', side: 'center', ...over });
  const cd = checkDirection(direction(cues.map((c) => cline(c.id, c.id === 'c1' ? { decor: 'oval' } : c.id === 'c2' ? { decor: 'fine-note', noteKind: 'echo', note: '整條街的燈' } : c.id === 'c3' ? { handoff: 'relay' } : {}))), { ...ctx, world: C });
  assert.ok(cd.fallbacks.some((f) => f.cue === 'c1' && f.field === 'decor'), 'no ring in a world without paper devices');
  assert.equal(cd.accepted.get('c2')?.note, '整條街的燈', 'the director\'s own words still stand');
  assert.ok(cd.fallbacks.some((f) => f.cue === 'c3' && f.field === 'handoff'), 'no handoff in a world without them');
  // the plan on the world: its lines are world lines, no backdrop or paid finish, the world recorded on the plan
  const pw = planWorldOf(silk, song, false, '理由', 'director');
  const wb = directedPlan(song, direction(wfull({ c2: { layout: 'stair', enter: 'fade', idle: 'still' } })), wctx, paid, paidShots, parts, song.beats, new Set(), pw);
  const wshots = wb.plan.shots as unknown as { lines: Record<string, unknown>[]; cuts: Record<string, unknown>[]; lyric: { template: string }; backdrop: string }[];
  const wshot = (id: string) => wshots.find((s) => s.lines.some((l) => l['cue'] === id))!;
  assert.equal((wshot('c0').lines[0]['world'] as { set: string }).set, 'silk/top-slab', 'the director\'s set reaches the line');
  assert.equal(wshot('c0').lyric.template, 'world-set');
  // a director's ground the composer's cut just before already stands on: the composer's gives way, the director's stays
  {
    const flat = (b: typeof wb) => (b.plan.shots as unknown as { lines: { cue: string }[]; cuts: { fx: string }[] }[]).flatMap((s) => s.cuts.map((c, k) => ({ fx: c.fx, cue: k === 0 ? s.lines[0]?.cue : undefined })));
    const cuts0 = flat(wb);
    const hit = cuts0.findIndex((x, i) => i > 0 && x.cue && x.cue !== 'c0' && checkDirection(direction(wfull({ [x.cue]: { ground: cuts0[i - 1].fx } })), wctx).accepted.get(x.cue)?.ground);
    assert.ok(hit > 0, 'the test finds a line whose cut before stands on a ground it may take');
    const asked = cuts0[hit - 1].fx;
    const again = flat(directedPlan(song, direction(wfull({ c2: { layout: 'stair', enter: 'fade', idle: 'still' }, [cuts0[hit].cue!]: { ground: asked } })), wctx, paid, paidShots, parts, song.beats, new Set(), pw));
    const at = again.findIndex((x) => x.cue === cuts0[hit].cue);
    assert.equal(again[at].fx, asked, 'the director\'s ground stands');
    assert.notEqual(again[at - 1].fx, asked, 'the cut before gives way');
  }
  assert.ok((wshot('c2').lines[0]['world'] as { set?: string } | undefined)?.set, 'a line the director lost keeps a set the composer chose in the world');
  assert.ok(wshots.every((s) => !s.backdrop), 'no backdrop of the old design');
  assert.ok(wshots.every((s) => s.cuts.every((c) => typeof c['scheme'] === 'number')), 'every cut carries the world\'s scheme');
  assert.equal(wb.plan.finish, '', 'no paid finish on a world');
  assert.deepEqual((wb.plan as { world?: unknown }).world, pw, 'the plan carries its world');
  assert.equal(wb.plan.backbone, '骨幹', 'the paid reading stays');
  assert.equal(wb.decisions.find((x) => x['cue'] === 'c0')?.['set'], 'silk/top-slab', 'the set is in the decisions');
  const wprompt = directorPrompt(song, wctx, { language: 'x', languageWhat: '', concept: '', backbone: '', change: '', palette: '', parts: [], lessons: '', world: { w: silk, pool: W } });
  assert.ok(wprompt.includes('silk/top-slab') && wprompt.includes('風格世界') && !wprompt.includes('horizon-light'), 'the director reads the world\'s kit, not the open one');
}

// a note is in the song's language: a Japanese song's chapter in Chinese is refused, the song's own words pass
assert.equal(songScript(['またおんなじ歌を歌うたび', 'あなたを誘うでしょう']), 'ja');
assert.equal(songScript(['數不盡想你的黑夜', '三年後的大雪']), 'zh');
assert.equal(songScript(['사랑해', '너를']), 'ko');
assert.equal(songScript(['I wanna drift', 'Tokyo night']), 'latin');
assert.match(noteRefusal('chapter', '海邊童年的疑問', 'あなたを誘うでしょう', [], [], 'ja') ?? '', /language/);
assert.equal(noteRefusal('chapter', '一・海辺の問い', 'あなたを誘うでしょう', [], [], 'ja'), undefined);
assert.match(noteRefusal('scene', '夜の橋', '夜晚的橋邊在飄雪', [], [], 'zh') ?? '', /language/);
assert.equal(noteRefusal('scene', '深夜・石橋', '我再也不在你身邊', [], [], 'zh'), undefined, 'a middle dot is no kana: a Chinese scene note stands');
assert.match(noteRefusal('scene', '深夜・石橋', 'あなたを誘うでしょう', [], [], 'ja') ?? '', /language/, 'nor does it make Chinese Japanese');
assert.equal(noteRefusal('echo', 'またおんなじ歌を', 'あなたを誘うでしょう', ['またおんなじ歌を歌うたび'], [], 'ja'), undefined, 'an echo is the song\'s own words');
