// npx tsx --test scripts/lyric-vj/subject-script.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanScript, MAX_CANDIDATES, type ScriptVocabulary, type SubjectScript } from '../../src/app/lyric-vj/subject-script';

const vocab: ScriptVocabulary = {
  cues: ['c001', 'c002'],
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
  id, kind: 'still', frame: 'cutout', cues: ['c001'], size: 'wide', subject: 'a bicycle', ground: 'overprint', fx: '', fxWhy: '', side: 'left', height: 0.4, camera: 'push', step: false, why: '', ...over,
});
const script = (over: Partial<SubjectScript> = {}): SubjectScript => ({
  subject: { kind: 'object', what: 'a bicycle', why: '', alternatives: '' }, story: '', world: '', peak: '',
  shots: [shot('S01'), shot('S02', { cues: ['c002'] })],
  lines: [{ cue: 'c001', shots: ['S01'] }, { cue: 'c002', shots: ['S02'] }],
  text: [{ cue: 'c001', template: 'vertical', enter: 'drum-feed', exit: 'drum-out', idle: 'fill', emphasis: 'hollow', why: '' }],
  candidates: [{ letter: 'A', idea: '', look: '', scheme: 'riso-pink' }],
  sameness: '', ...over,
});

test('names the song and the language do not have are cleared, and a warning says which', () => {
  const warned: string[] = [];
  const s = cleanScript(script({ shots: [shot('S01', { ground: 'lava', fx: 'fireworks', fxWhy: 'because', cues: ['c001', 'c999'], height: 9 }), shot('S02', { cues: ['c002'] })] }), vocab, (m) => warned.push(m));
  assert.equal(s.shots[0].ground, '');
  assert.equal(s.shots[0].fx, '');
  assert.equal(s.shots[0].fxWhy, '');
  assert.deepEqual(s.shots[0].cues, ['c001']);
  assert.equal(s.shots[0].height, 1.6);
  assert.equal(warned.length, 2);
});

test('text motions the language does not offer fall back to the plainest; a stray emphasis is dropped', () => {
  const s = cleanScript(script({ text: [{ cue: 'c001', template: 'orbit', enter: 'teleport', exit: 'vanish', idle: 'wobble', emphasis: 'rainbow', why: '' }, { cue: 'c999', template: 'stair', enter: 'cut', exit: 'cut', idle: 'still', emphasis: '', why: '' }] }), vocab);
  assert.equal(s.text.length, 1);
  assert.deepEqual([s.text[0].template, s.text[0].enter, s.text[0].exit, s.text[0].idle, s.text[0].emphasis], ['stair', 'cut', 'cut', 'still', '']);
});

test('offered motions are kept as the director chose them', () => {
  const s = cleanScript(script(), vocab);
  assert.deepEqual([s.text[0].template, s.text[0].enter, s.text[0].exit, s.text[0].idle, s.text[0].emphasis], ['vertical', 'drum-feed', 'drum-out', 'fill', 'hollow']);
});

test('a line whose shots are all unknown is an error: the edit would show nothing over it', () => {
  assert.throws(() => cleanScript(script({ lines: [{ cue: 'c001', shots: ['S01'] }, { cue: 'c002', shots: ['S77'] }] }), vocab), /c002 has no shots/);
});

test('candidates are lettered in order, capped, and given a scheme the language has', () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ letter: 'Z', idea: `${i}`, look: '', scheme: i ? 'riso-cobalt' : 'neon' }));
  const s = cleanScript(script({ candidates: many }), vocab);
  assert.equal(s.candidates.length, MAX_CANDIDATES);
  assert.deepEqual(s.candidates.map((c) => c.letter), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(s.candidates[0].scheme, 'riso-cobalt');
});
