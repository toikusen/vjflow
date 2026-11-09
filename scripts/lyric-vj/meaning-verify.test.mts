// npx tsx scripts/lyric-vj/meaning-verify.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Meaning } from './lineplan-core.mts';
import { applyVerdicts, type Verdict, verifyRequest, voteVerdicts } from './meaning-read.mts';

const cues = [
  { id: 'c1', start: 0, end: 1, text: '思念的人總學不會說再見' },
  { id: 'c2', start: 1, end: 2, text: '整句都是' },
  { id: 'c3', start: 2, end: 3, text: '不要下雨' },
  { id: 'c4', start: 3, end: 4, text: '那些悲傷融化了從前' },
  { id: 'c5', start: 4, end: 5, text: 'あの日遊んだ海のにおいは' },
  { id: 'c6', start: 5, end: 6, text: 'どうして すぎる季節に消えてしまうの' },
  { id: 'c7', start: 6, end: 7, text: '期盼著那三年大雪下的一瞬間' },
];
const reading: Meaning = {
  reading: '', palette: 'tea', ground: 'grain', parts: [],
  keys: [{ cue: 'c1', phrase: '思念的人總學不會說再見', why: 'a' }, { cue: 'c2', phrase: '整句都是', why: 'b' }, { cue: 'c3', phrase: '不要下雨', why: 'c' }],
  moments: [
    { cues: ['c4'], form: 'strike', variant: 'melt', word: '融化', evidenceCueId: 'c4', why: 'd' },
    { cues: ['c5'], form: 'shape', variant: 'wave', word: '海', why: 'e' },
    { cues: ['c6'], form: 'strike', variant: 'wipe', word: '消えて', evidenceCueId: 'c6', why: 'f' },
    { cues: ['c7'], form: 'freeze', variant: 'stop', word: '那三年大雪下的一瞬間', evidenceCueId: 'c7', why: 'g' },
  ],
};
const v = (id: string, verdict: 'keep' | 'drop', over: Partial<Verdict> = {}): Verdict =>
  ({ id, phraseSung: true, lineSupports: true, mapping: '非比喻', directionOk: true, wholeLineKey: false, narrowedPhrase: '', phraseOk: true, whyOk: true, correctedWhy: '', verdict, reason: `r-${id}`, ...over });

test('a fixture response drops what the verdicts drop, overrules inconsistent keeps, and drops what has no verdict', () => {
  const fixture = JSON.parse(JSON.stringify({ verdicts: [
    v('k0', 'keep'), v('k0', 'drop'),
    v('k1', 'drop', { wholeLineKey: true }),
    v('k2', 'keep', { lineSupports: false }),
    v('m0', 'keep', { directionOk: false }),
    // a lament question (why does it vanish) asserts the vanishing: kept; a wish (longing for the moment) is not: dropped
    v('m2', 'keep'),
    v('m3', 'drop', { lineSupports: false }),
  ] })) as { verdicts: Verdict[] };
  const { meaning, dropped } = applyVerdicts(reading, fixture.verdicts, cues);
  assert.deepEqual(meaning.keys, [reading.keys[0]]);
  assert.deepEqual(meaning.moments, [reading.moments![2]]);
  assert.deepEqual(dropped, [
    { id: 'k1', why: 'drop: r-k1' },
    { id: 'k2', why: 'keep overruled: line does not support it' },
    { id: 'm0', why: 'keep overruled: direction wrong' },
    { id: 'm1', why: 'no verdict' },
    { id: 'm3', why: 'drop: r-m3' },
  ]);
  assert.equal(meaning.palette, 'tea');
});

test('a whole-line key comes back narrowed to a piece sung in the same line, or is dropped', () => {
  const ok = applyVerdicts(reading, [v('k0', 'keep', { wholeLineKey: true, narrowedPhrase: '說再見' })], cues);
  assert.deepEqual(ok.meaning.keys, [{ cue: 'c1', phrase: '說再見', why: 'a' }]);
  assert.deepEqual(ok.narrowed, [{ id: 'k0', from: '思念的人總學不會說再見', to: '說再見' }]);
  const invented = applyVerdicts(reading, [v('k0', 'keep', { wholeLineKey: true, narrowedPhrase: '學會說再見' })], cues);
  assert.deepEqual(invented.meaning.keys, []);
  assert.deepEqual(invented.dropped[0], { id: 'k0', why: 'narrowed phrase 「學會說再見」 is not sung in c1' });
  const elsewhere = applyVerdicts(reading, [v('k0', 'keep', { narrowedPhrase: '不要下雨' })], cues);
  assert.deepEqual(elsewhere.meaning.keys, []);
});

test('the request names every candidate once, allows only those ids, and states the question rule', () => {
  const { prompt, schema, ids } = verifyRequest({ title: 't', cues }, reading);
  assert.deepEqual(ids, ['k0', 'k1', 'k2', 'm0', 'm1', 'm2', 'm3']);
  assert.match(prompt, /m0 moment strike\/melt｜句 c4（證據句 c4）｜word「融化」/);
  assert.match(prompt, /問「為什麼／怎麼會 X」.*支持；問「X 會不會發生」或希望 X 發生.*不支持/);
  assert.match(prompt, /narrowedPhrase/);
  const items = (schema as { properties: { verdicts: { items: { required: string[]; properties: { id: { enum: string[] } } } } } }).properties.verdicts.items;
  assert.deepEqual(items.properties.id.enum, ids);
  assert.ok(items.required.includes('narrowedPhrase'));
});

test('the vote keeps a candidate only when all 3 calls keep it; 1–2 keeps are uncertain, 0 rejected, all recorded', () => {
  const runs = [
    [v('k0', 'keep'), v('k1', 'drop'), v('k2', 'keep'), v('m0', 'keep'), v('m1', 'drop'), v('m2', 'keep'), v('m3', 'drop')],
    [v('k0', 'keep'), v('k1', 'drop'), v('k2', 'drop'), v('m0', 'keep', { directionOk: false }), v('m1', 'drop'), v('m2', 'keep')],
    [v('k0', 'keep'), v('k1', 'drop'), v('k2', 'keep'), v('m0', 'keep'), v('m1', 'drop'), v('m2', 'keep'), v('m3', 'keep')],
  ];
  const { meaning, votes, dropped, uncertain } = voteVerdicts(reading, runs, cues);
  assert.deepEqual(meaning.keys, [reading.keys[0]]);
  assert.deepEqual(meaning.moments, [reading.moments![2]]);
  assert.deepEqual(votes.map((r) => [r.id, r.keepVotes, r.status]), [['k0', 3, 'kept'], ['k1', 0, 'rejected'], ['k2', 2, 'uncertain'], ['m0', 2, 'uncertain'], ['m1', 0, 'rejected'], ['m2', 3, 'kept'], ['m3', 1, 'uncertain']]);
  assert.deepEqual(uncertain.map((r) => r.id), ['k2', 'm0', 'm3']);
  // an overruled keep counts as a drop vote, a missing verdict as a drop
  assert.deepEqual(votes[3].votes.map((x) => [x.verdict, x.kept, x.reason]), [['keep', true, 'r-m0'], ['keep', false, 'keep overruled: direction wrong'], ['keep', true, 'r-m0']]);
  assert.deepEqual(votes[6].votes.map((x) => x.verdict), ['drop', 'none', 'keep']);
  assert.deepEqual(dropped.find((d) => d.id === 'm3'), { id: 'm3', why: 'uncertain (1/3 keep): drop: r-m3 | no verdict' });
  // a keep whose phraseOk is false is overruled
  assert.equal(voteVerdicts(reading, [[v('k0', 'keep')], [v('k0', 'keep')], [v('k0', 'keep', { phraseOk: false })]], cues).votes[0].status, 'uncertain');
});

test('a narrowing is adopted only when two calls agree; otherwise the key is uncertain', () => {
  const n = (to: string) => v('k0', 'keep', { wholeLineKey: true, narrowedPhrase: to });
  const agreed = voteVerdicts(reading, [[n('說再見')], [n('學不會說再見')], [n('學不會說再見')]], cues);
  assert.deepEqual(agreed.meaning.keys, [{ cue: 'c1', phrase: '學不會說再見', why: 'a' }]);
  assert.deepEqual(agreed.narrowed, [{ id: 'k0', from: '思念的人總學不會說再見', to: '學不會說再見' }]);
  assert.deepEqual(agreed.votes[0].votes.map((x) => x.phrase), ['說再見', '學不會說再見', '學不會說再見']);
  // two different narrowings and the original: no two agree, so uncertain and dropped
  const split = voteVerdicts(reading, [[n('說再見')], [n('學不會說再見')], [v('k0', 'keep')]], cues);
  assert.deepEqual(split.meaning.keys, []);
  assert.equal(split.votes[0].status, 'uncertain');
  // two calls keep the original, one narrows: the original has two votes
  const most = voteVerdicts(reading, [[v('k0', 'keep')], [v('k0', 'keep')], [n('說再見')]], cues);
  assert.deepEqual(most.meaning.keys, [reading.keys[0]]);
  // a narrowing not sung in the cue is that call's drop vote: no longer unanimous
  const bad = voteVerdicts(reading, [[n('學會說再見')], [n('說再見')], [n('說再見')]], cues);
  assert.deepEqual(bad.meaning.keys, []);
  assert.equal(bad.votes[0].status, 'uncertain');
});

test('a key dropped only for a wrong why keeps its phrase (phraseOk, whyOk false) and takes the corrected why', () => {
  const kCues = [...cues, { id: 'c9', start: 8, end: 9, text: '習武之人切記 仁者無敵' }];
  const k: Meaning = { ...reading, keys: [{ cue: 'c9', phrase: '習武之人切記 仁者無敵', why: '戲謔的反差' }], moments: [] };
  const whyWrong = (fix: string) => v('k0', 'drop', { wholeLineKey: true, narrowedPhrase: '仁者無敵', whyOk: false, correctedWhy: fix });
  const rescued = voteVerdicts(k, [[whyWrong('習武的核心價值')], [whyWrong('正面的習武格言')], [v('k0', 'keep', { narrowedPhrase: '仁者無敵' })]], kCues);
  assert.deepEqual(rescued.meaning.keys, [{ cue: 'c9', phrase: '仁者無敵', why: '習武的核心價值' }]);
  assert.equal(rescued.votes[0].status, 'kept');
  assert.deepEqual(rescued.votes[0].votes.map((x) => x.whyOnly), [true, true, false]);
  assert.deepEqual(rescued.rewhy, [{ id: 'k0', from: '戲謔的反差', to: '習武的核心價值' }]);
  // one call drops for another reason (phraseOk false): not why-only, so uncertain
  const mixed = voteVerdicts(k, [[whyWrong('x')], [whyWrong('y')], [v('k0', 'drop', { phraseOk: false })]], kCues);
  assert.deepEqual(mixed.meaning.keys, []);
  assert.equal(mixed.votes[0].status, 'uncertain');
  // why-only drops never rescue a moment
  const mo = voteVerdicts(reading, [0, 1, 2].map(() => [v('m0', 'drop', { whyOk: false, correctedWhy: 'z' })]), cues);
  assert.equal(mo.votes.find((r) => r.id === 'm0')!.status, 'rejected');
});

test('the schema asks phraseOk, whyOk and correctedWhy, and the prompt states the rule', () => {
  const { prompt, schema } = verifyRequest({ title: 't', cues }, reading);
  const items = (schema as { properties: { verdicts: { items: { required: string[] } } } }).properties.verdicts.items;
  for (const f of ['phraseOk', 'whyOk', 'correctedWhy']) assert.ok(items.required.includes(f));
  assert.match(prompt, /why 寫錯但詞組本身值得強調時，phraseOk 填 true、whyOk 填 false，並在 correctedWhy/);
});

test('a simile the line itself states is kept; the vehicle drawn for a line about something else is dropped', () => {
  const simCues = [...cues, { id: 'c8', start: 7, end: 8, text: '回憶就像是那凋落的楓葉' }];
  const sim: Meaning = { ...reading, keys: [], moments: [
    { cues: ['c8'], form: 'shape', variant: 'fall', word: '凋落的楓葉', why: '回憶被比作凋落的楓葉' },
    { cues: ['c5'], form: 'shape', variant: 'wave', word: '海', why: '海的回憶' },
  ] };
  const { prompt } = verifyRequest({ title: 't', cues: simCues }, sim);
  assert.match(prompt, /例外：句子本身明白說出「本體像／是喻體」.*回憶就像是那凋落的楓葉.*判為支持；只有句子在講別的事、形式卻畫出喻體或字面物件時才不支持/);
  assert.match(prompt, /海的氣味，形式卻畫海浪/);
  const keepSimile = v('m0', 'keep', { mapping: '回憶→凋落的楓葉' });
  const dropSmell = v('m1', 'drop', { lineSupports: false, mapping: '非比喻' });
  const { meaning } = voteVerdicts(sim, [[keepSimile, dropSmell], [keepSimile, dropSmell], [keepSimile, v('m1', 'keep')]], simCues);
  assert.deepEqual(meaning.moments, [sim.moments![0]]);
});
