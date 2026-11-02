// npx tsx --test scripts/lyric-vj/beta/feedback.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addFeedback, fixKindFor, fixRanges, isPending, parseFeedback, parseTriage, readProposals } from './feedback.mts';
import { emptyDb } from './store.mts';

const mark = (o: object = {}) => ({ at: 1, category: 'lyrics', note: 'x', ...o });
const bad2 = (body: unknown, tier: 'none' | 'img' | 'hybrid') => { const r = parseFeedback(body, 10, tier); assert.equal(r.ok, false); return r.ok ? '' : r.error; };
const bad = (body: unknown, duration?: number) => { const r = parseFeedback(body, duration); assert.equal(r.ok, false); return r.ok ? '' : r.error; };

test('a clean report parses and text is trimmed', () => {
  const r = parseFeedback({ ok: false, marks: [mark({ note: '  hi  ', end: 3 })], suggestion: ' s ', action: 'none' }, 10);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.marks[0].note, 'hi'); assert.equal(r.value.suggestion, 's'); }
});
test('ok with marks is allowed; ok:true needs nothing', () => {
  assert.ok(parseFeedback({ ok: true, marks: [mark()], suggestion: '', action: 'none' }).ok);
  assert.ok(parseFeedback({ ok: true }).ok);
});
test('limits are enforced', () => {
  assert.ok(bad({ ok: false, marks: Array.from({ length: 21 }, () => mark()) }));
  assert.ok(bad({ ok: false, marks: [mark({ note: 'a'.repeat(1001) })] }));
  assert.ok(bad({ ok: false, suggestion: 'a'.repeat(1001) }));
  assert.ok(bad({ ok: false, marks: [mark({ at: 5, end: 4 })] }));
  assert.ok(bad({ ok: false, marks: [mark({ at: 11 })] }, 10));
  assert.ok(bad({ ok: false, marks: [mark({ at: 1, end: 11 })] }, 10));
  assert.ok(bad({ ok: false, marks: [mark({ at: -1 })] }));
  assert.ok(bad({ ok: false, marks: [mark({ category: 'nope' })] }));
  assert.ok(parseFeedback({ ok: false, marks: [mark({ at: 500 })] }).ok);
});
test('marks may run up to half a second past the known length', () => {
  assert.ok(parseFeedback({ ok: false, marks: [mark({ at: 10.5 })] }, 10).ok);
  assert.ok(parseFeedback({ ok: false, marks: [mark({ at: 9, end: 10.4 })] }, 10).ok);
  assert.equal(bad({ ok: false, marks: [mark({ at: 10.6 })] }, 10), '標記超出影片長度');
  assert.equal(bad({ ok: false, marks: [mark({ at: 9, end: 10.6 })] }, 10), '標記超出影片長度');
});
test('redo is accepted on every tier and needs no fixable marks; an unknown action is rejected', () => {
  for (const tier of ['none', 'img', 'hybrid'] as const) {
    const r = parseFeedback({ ok: false, marks: [mark()], suggestion: '換個方向', action: 'redo' }, 10, tier);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.value.action, 'redo');
  }
  assert.ok(parseFeedback({ ok: false, suggestion: '整首重來', action: 'redo' }).ok);
  assert.equal(bad({ ok: false, action: 'redo' }), '請標出哪裡有問題，或寫下建議');
  assert.ok(bad({ ok: false, marks: [mark()], action: 'zzz' }));
});
test('fixKindFor: timing when every mark is timing; picture when every mark is picture on img; else replan on none/img; nothing on hybrid or unmarked', () => {
  assert.equal(fixKindFor([], 'none'), undefined);
  assert.equal(fixKindFor([mark({ category: 'picture' }), mark({ category: 'picture' })] as never, 'img'), 'picture');
  assert.equal(fixKindFor([mark({ category: 'picture' })] as never, 'none'), 'replan', 'a "picture" on the text tier is a shape the plan drew');
  assert.equal(fixKindFor([mark({ category: 'timing' })] as never, 'hybrid'), 'timing');
  assert.equal(fixKindFor([mark({ category: 'picture' }), mark({ category: 'timing' })] as never, 'img'), 'replan');
  assert.equal(fixKindFor([mark({ category: 'lyrics' })] as never, 'none'), 'replan');
  assert.equal(fixKindFor([mark({ category: 'lyrics' })] as never, 'hybrid'), undefined);
  assert.equal(fixKindFor([mark({ category: 'lyrics' })] as never), undefined);
});
test('fixRanges carries each mark\'s category and note (a point mark spans 2 s)', () => {
  assert.deepEqual(fixRanges([{ at: 2, category: 'lyrics', note: '太粗' }, { at: 5, end: 6, category: 'picture', note: '' }]), [{ at: 2, end: 4, category: 'lyrics', note: '太粗' }, { at: 5, end: 6, category: 'picture' }]);
});
test('a fix is accepted for timing marks on any tier, picture on img, other marks on none and img; refused on hybrid and without marks', () => {
  const pic = { ok: false, marks: [mark({ category: 'picture' })], action: 'fix' };
  const tim = { ok: false, marks: [mark({ category: 'timing' })], action: 'fix' };
  assert.ok(parseFeedback(pic, 10, 'img').ok);
  assert.equal(bad2(pic, 'hybrid'), '故事版目前只能修歌詞時間，其他請重做或只回報');
  assert.ok(parseFeedback(pic, 10, 'none').ok);
  for (const tier of ['none', 'img', 'hybrid'] as const) assert.ok(parseFeedback(tim, 10, tier).ok);
  assert.ok(parseFeedback({ ok: false, marks: [mark()], action: 'fix' }, 10, 'img').ok);
  assert.equal(bad2({ ok: false, marks: [mark()], action: 'fix' }, 'hybrid'), '故事版目前只能修歌詞時間，其他請重做或只回報');
  assert.ok(parseFeedback({ ok: false, marks: [mark({ category: 'picture' }), mark({ category: 'timing' })], action: 'fix' }, 10, 'img').ok);
  assert.equal(bad2({ ok: false, suggestion: 'x', action: 'fix' }, 'img'), '這類問題目前只能重做或只回報');
  assert.equal(bad({ ok: false, suggestion: 'x', action: 'fix' }), '這類問題目前只能重做或只回報', 'no tier known: nothing to re-plan');
});
test('not ok with nothing is rejected', () => {
  assert.equal(bad({ ok: false, marks: [], suggestion: '  ' }), '請標出哪裡有問題，或寫下建議');
});
test('addFeedback keeps every record and copies tier', () => {
  const db = emptyDb();
  const job = { id: 'j', userId: 'u', songId: 's', kind: 'make' as const, tier: 'img' as const, status: 'done' as const, reservedUsd: 6, createdAt: 'x' };
  const v = { ok: true, marks: [], suggestion: '', action: 'none' as const };
  const a = addFeedback(db, job, v, 'u'); const b = addFeedback(db, job, v, 'u');
  assert.equal(db.feedback.length, 2);
  assert.notEqual(a.id, b.id);
  assert.equal(a.tier, 'img');
  assert.equal(a.style, undefined);
});

test('isPending: an untriaged report that says something; a bare 沒問題 and a triaged report do not wait', () => {
  const base = { ok: false, marks: [], suggestion: '' };
  assert.equal(isPending(base), true);
  assert.equal(isPending({ ...base, ok: true }), false);
  assert.equal(isPending({ ...base, ok: true, suggestion: '不錯' }), true);
  assert.equal(isPending({ ...base, triage: { outcomes: ['song'], at: 'x', by: 'y' } }), false);
});
test('parseTriage: known outcomes without repeats, a trimmed note; nothing or an unknown outcome is refused', () => {
  assert.deepEqual(parseTriage({ outcomes: ['code', 'rule', 'code'], note: ' 已修 ' }), { ok: true, value: { outcomes: ['code', 'rule'], note: '已修' } });
  assert.deepEqual(parseTriage({ outcomes: ['song'] }), { ok: true, value: { outcomes: ['song'] } });
  for (const b of [{}, { outcomes: [] }, { outcomes: ['nope'] }, null]) assert.equal(parseTriage(b).ok, false);
  assert.equal(parseTriage({ outcomes: ['song'], note: '字'.repeat(1001) }).ok, false);
});
test('readProposals keeps well-formed items, drops the rest, and a missing or broken file is none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proposals-'));
  const file = join(dir, 'proposals.json');
  assert.deepEqual(readProposals(file), {});
  writeFileSync(file, '{broken');
  assert.deepEqual(readProposals(file), {});
  writeFileSync(file, JSON.stringify({ a: { summary: 's', items: [{ outcome: 'rule', text: 'r', scope: 'typeplan' }, { outcome: 'nope', text: 'x' }, { outcome: 'code', text: ' ' }] }, b: { items: [] }, c: null }));
  assert.deepEqual(readProposals(file), { a: { summary: 's', items: [{ outcome: 'rule', text: 'r', scope: 'typeplan' }] } });
});
