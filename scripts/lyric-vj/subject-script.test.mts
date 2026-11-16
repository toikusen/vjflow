// npx tsx --test scripts/lyric-vj/subject-script.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanScript, MAX_CANDIDATES, type ScriptVocabulary, type SubjectScript } from '../../src/app/lyric-vj/subject-script';

const vocab: ScriptVocabulary = {
  cues: [{ id: 'c001', text: '一人自転車に乗る夕方' }, { id: 'c002', text: '風の匂い' }],
  grounds: ['overprint', 'disc'],
  fx: ['flow', 'bloom'],
  templates: ['stair', 'vertical'],
  enters: ['cut', 'slam', 'drum-feed'],
  exits: ['cut', 'drum-out'],
  idles: ['still', 'fill'],
  emphases: ['color', 'hollow'],
  schemes: ['riso-cobalt', 'riso-pink'],
};
const bike = { id: 'bike', kind: 'object' as const, tier: 'main' as const, what: 'a bicycle', look: '', role: 'the I', features: ['empty rear carrier'], why: '' };
const shot = (id: string, over: Partial<SubjectScript['shots'][number]> = {}): SubjectScript['shots'][number] => ({
  id, kind: 'still', frame: 'cutout', cast: ['bike'], size: 'wide', subject: 'a bicycle', side: 'left', height: 0.4, camera: 'push', step: false, why: '', ...over,
});
const line = (cue: string, shots: string[], over: Partial<SubjectScript['lines'][number]> = {}): SubjectScript['lines'][number] => ({ cue, shots, ground: 'overprint', fx: '', fxWhy: '', ...over });
const cand = (over: Partial<SubjectScript['candidates'][number]> = {}): SubjectScript['candidates'][number] => ({ for: 'bike', letter: 'Z', idea: '', look: '', scheme: 'riso-pink', together: '', ...over });
const script = (over: Partial<SubjectScript> = {}): SubjectScript => ({
  cast: [bike], alternatives: '', tradeoffs: '', story: '', world: '', peak: '',
  shots: [shot('S01'), shot('S02')],
  lines: [line('c001', ['S01']), line('c002', ['S02'])],
  text: [{ cue: 'c001', template: 'vertical', enter: 'drum-feed', exit: 'drum-out', idle: 'fill', emphasis: 'hollow', word: '夕方', why: '' }],
  candidates: [cand()],
  sameness: '', ...over,
});

test('a ground or move the language does not have is cleared from the line, and a warning says which', () => {
  const warned: string[] = [];
  const s = cleanScript(script({ lines: [line('c001', ['S01', 'S99'], { ground: 'lava', fx: 'fireworks', fxWhy: 'because' }), line('c002', ['S02'])], shots: [shot('S01', { height: 9 }), shot('S02')] }), vocab, (m) => warned.push(m));
  assert.deepEqual([s.lines[0].ground, s.lines[0].fx, s.lines[0].fxWhy, s.lines[0].shots], ['', '', '', ['S01']]);
  assert.equal(s.shots[0].height, 1.6);
  assert.equal(warned.length, 2);
});

test('a line whose shots put the subject on both sides is warned, centre shots not counted', () => {
  const warned: string[] = [];
  cleanScript(script({ shots: [shot('S01'), shot('S02', { side: 'right' }), shot('S03', { side: 'center' })], lines: [line('c001', ['S01', 'S03']), line('c002', ['S02', 'S01'])] }), vocab, (m) => warned.push(m));
  assert.equal(warned.length, 1);
  assert.match(warned[0], /c002: subject on right and left/);
});

test('text motions the language does not offer fall back to the plainest; an emphasis needs a word the line sings', () => {
  const warned: string[] = [];
  const s = cleanScript(script({ text: [
    { cue: 'c001', template: 'orbit', enter: 'teleport', exit: 'vanish', idle: 'wobble', emphasis: 'color', word: '君', why: '' },
    { cue: 'c002', template: 'stair', enter: 'cut', exit: 'cut', idle: 'still', emphasis: 'color', word: '風', why: '' },
    { cue: 'c999', template: 'stair', enter: 'cut', exit: 'cut', idle: 'still', emphasis: '', word: '', why: '' },
  ] }), vocab, (m) => warned.push(m));
  assert.equal(s.text.length, 2);
  assert.deepEqual([s.text[0].template, s.text[0].enter, s.text[0].exit, s.text[0].idle, s.text[0].emphasis, s.text[0].word], ['stair', 'cut', 'cut', 'still', '', '']);
  assert.deepEqual([s.text[1].emphasis, s.text[1].word], ['color', '風']);
  assert.equal(warned.length, 1);
});

test('offered motions are kept as the director chose them', () => {
  const s = cleanScript(script(), vocab);
  assert.deepEqual([s.text[0].template, s.text[0].enter, s.text[0].exit, s.text[0].idle, s.text[0].emphasis, s.text[0].word], ['vertical', 'drum-feed', 'drum-out', 'fill', 'hollow', '夕方']);
});

test('a line whose shots are all unknown is an error: the edit would show nothing over it', () => {
  assert.throws(() => cleanScript(script({ lines: [line('c001', ['S01']), line('c002', ['S77'])] }), vocab), /c002 has no shots/);
});

test('candidates are lettered in order per member, capped, and given a scheme the language has', () => {
  const many = Array.from({ length: 8 }, (_, i) => cand({ idea: `${i}`, scheme: i ? 'riso-cobalt' : 'neon' }));
  const s = cleanScript(script({ candidates: many }), vocab);
  assert.equal(s.candidates.length, MAX_CANDIDATES);
  assert.deepEqual(s.candidates.map((c) => c.letter), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(s.candidates[0].scheme, 'riso-cobalt');
});

test('cast: a decided member keeps its own fields and comes first; props need a look, main members candidates; unknown members leave the shots', () => {
  const warned: string[] = [];
  const fixedBike = { ...bike, what: 'the picked bicycle', features: ['scuffed frame', 'empty rear carrier'], look: 'look D', scheme: 'riso-cobalt', sheet: 'D.jpg' };
  const rider = { id: 'rider', kind: 'person' as const, tier: 'main' as const, what: 'a schoolboy', look: '', role: 'the one who rides', features: ['uniform'], why: 'the lyric rides' };
  const s = cleanScript(script({
    cast: [rider, { ...bike, what: 'redrawn by the director', role: 'my role for it', features: ['other'] }, { ...rider, id: 'cat' }, { ...rider, id: 'sun', tier: 'prop' }, { ...rider, id: 'leaf', tier: 'prop', look: 'a leaf' }],
    shots: [shot('S01', { cast: ['rider', 'bike'] }), shot('S02', { cast: ['ghost'] }), shot('S03', { cast: ['bike', 'leaf'] })],
    lines: [line('c001', ['S01']), line('c002', ['S03'])],
    candidates: [cand({ for: 'rider', scheme: 'riso-cobalt' }), cand({ for: 'rider' }), cand({ for: 'bike' }), cand({ for: 'leaf' })],
  }), { ...vocab, fixed: [fixedBike] }, (m) => warned.push(m));
  assert.deepEqual(s.cast.map((m) => [m.id, m.tier, !!m.fixed]), [['bike', 'main', true], ['rider', 'main', false], ['cat', 'main', false], ['sun', 'prop', false], ['leaf', 'prop', false]]);
  assert.deepEqual([s.cast[0].what, s.cast[0].look, s.cast[0].features, s.cast[0].role], ['the picked bicycle', 'look D', ['scuffed frame', 'empty rear carrier'], 'my role for it']);
  assert.deepEqual(s.shots[1].cast, []);
  assert.deepEqual(s.shots[2].cast, ['bike', 'leaf']);
  assert.deepEqual(s.candidates.map((c) => [c.for, c.letter]), [['rider', 'A'], ['rider', 'B']]);
  assert.ok(warned.some((m) => /prop sun has no look/.test(m)));
  assert.ok(warned.some((m) => /main member cat has no candidates/.test(m)));
  assert.ok(warned.some((m) => /S02: unknown cast member ghost/.test(m)));
  assert.ok(warned.some((m) => /S02: a cut-out with nobody/.test(m)));
  assert.ok(warned.some((m) => /candidate for bike: not an undecided/.test(m)));
  assert.ok(warned.some((m) => /candidate for leaf: not an undecided/.test(m)));
});

test('cast: a decided member missing from the answer is put back', () => {
  const fixedBike = { ...bike, look: 'look D', scheme: 'riso-cobalt', sheet: 'D.jpg' };
  const s = cleanScript(script({ cast: [], candidates: [] }), { ...vocab, fixed: [fixedBike] });
  assert.deepEqual(s.cast.map((m) => m.id), ['bike']);
  assert.equal(s.candidates.length, 0);
});
