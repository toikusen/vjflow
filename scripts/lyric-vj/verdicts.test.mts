// npx tsx scripts/lyric-vj/verdicts.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCards, parseCard, pick, relevant } from './verdicts.mts';

const card = (id: string, extra: string) => parseCard(
  `---\nid: ${id}\ndate: 2026-11-09\nverdict: accept\nscope: global\nworlds: []\nrules: [8]\nevidence: []\npair: ""\nsupersedes: ""\nblind: false\n${extra}\n---\n## 業主原話\n\n> ok\n`, id);

test('parses flat frontmatter and rejects a card without the owner quote', () => {
  const c = card('a', 'worlds: [riso, notebook]  # two\nscope: world');
  assert.deepEqual(c.worlds, ['riso', 'notebook']);
  assert.deepEqual(c.rules, [8]);
  assert.throws(() => parseCard('---\nid: x\ndate: 2026-11-09\nverdict: accept\nscope: global\n---\nno quote', 'x'), /業主原話/);
  assert.throws(() => card('b', 'verdict: maybe'), /bad verdict/);
});

test('relevant keeps world + global cards, drops superseded and blind ones', () => {
  const cards = [
    card('g', ''),
    card('w', 'scope: world\nworlds: [riso]'),
    card('other', 'scope: world\nworlds: [silk]'),
    card('old', 'scope: world\nworlds: [riso]'),
    card('new', 'scope: world\nworlds: [riso]\nsupersedes: old'),
    card('held', 'blind: true'),
  ];
  assert.deepEqual(relevant(cards, 'riso').map((c) => c.id).sort(), ['g', 'new', 'w']);
  // --rule ranks, it does not filter
  assert.equal(relevant(cards, 'riso', 3).length, 3);
  assert.equal(relevant([card('r3', 'rules: [3]'), card('r8', 'date: 2026-12-01')], undefined, 3)[0].id, 'r3');
});

test('a blind card cannot retire a live card through supersedes', () => {
  const cards = [card('live', ''), card('hidden', 'blind: true\nsupersedes: live')];
  assert.deepEqual(relevant(cards).map((c) => c.id), ['live']);
});

test('pick: global hard faults always, then 2/2/1, pairs kept, unquoted cards never anchor', () => {
  const cards = [
    card('hard', 'verdict: reject\nrules: [8]'),
    ...['a1', 'a2', 'a3'].map((id) => card(id, 'rules: [2]')),
    ...['r1', 'r2', 'r3'].map((id) => card(id, 'verdict: reject\nrules: [2]')),
    ...['b1', 'b2'].map((id) => card(id, 'verdict: boundary\nrules: []')),
    card('partner', 'verdict: accept\nrules: [2]\npair: r1'),
  ].map((c) => (c.id === 'r1' ? { ...c, pair: 'partner' } : c));
  assert.deepEqual(pick(cards).map((c) => c.id), ['hard', 'a1', 'a2', 'r1', 'r2', 'b1', 'partner']);
  const unquoted = parseCard(`---\nid: u\ndate: 2026-11-09\nverdict: accept\nscope: global\nrules: [2]\n---\n## 業主原話\n\n> （無原話，見 inferred）\n`, 'u');
  assert.equal(unquoted.quoted, false);
  assert.deepEqual(pick([unquoted]), []);
});

test('every checked-in card parses', () => {
  assert.ok(loadCards().length >= 0);
});

test('song-scoped cards appear only with a matching --song; anchor:false cards never pack', () => {
  const s = card('s', 'scope: song\nsong: "sweet timer"\nverdict: reject\nrules: [2]');
  const proc = card('p', 'anchor: false\nverdict: reject\nrules: [2]');
  assert.deepEqual(relevant([s, proc], 'riso').map((c) => c.id), ['p']);
  assert.deepEqual(relevant([s, proc], 'riso', undefined, 'sweet timer').map((c) => c.id), ['s', 'p']);
  assert.deepEqual(pick([s, proc]).map((c) => c.id), ['s']);
});
