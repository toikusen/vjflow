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
const shot = (id: string, over: Partial<SubjectScript['shots'][number]> = {}): SubjectScript['shots'][number] => ({
  id, kind: 'still', frame: 'cutout', size: 'wide', subject: 'a bicycle', side: 'left', height: 0.4, camera: 'push', step: false, why: '', ...over,
});
const line = (cue: string, shots: string[], over: Partial<SubjectScript['lines'][number]> = {}): SubjectScript['lines'][number] => ({ cue, shots, ground: 'overprint', fx: '', fxWhy: '', ...over });
const script = (over: Partial<SubjectScript> = {}): SubjectScript => ({
  subject: { kind: 'object', what: 'a bicycle', why: '', alternatives: '', features: ['empty rear carrier'] }, story: '', world: '', peak: '',
  shots: [shot('S01'), shot('S02')],
  lines: [line('c001', ['S01']), line('c002', ['S02'])],
  text: [{ cue: 'c001', template: 'vertical', enter: 'drum-feed', exit: 'drum-out', idle: 'fill', emphasis: 'hollow', word: '夕方', why: '' }],
  candidates: [{ letter: 'A', idea: '', look: '', scheme: 'riso-pink' }],
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

test('candidates are lettered in order, capped, and given a scheme the language has', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ letter: 'Z', idea: `${i}`, look: '', scheme: i ? 'riso-cobalt' : 'neon' }));
  const s = cleanScript(script({ candidates: many }), vocab);
  assert.equal(s.candidates.length, MAX_CANDIDATES);
  assert.deepEqual(s.candidates.map((c) => c.letter), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(s.candidates[0].scheme, 'riso-cobalt');
});
