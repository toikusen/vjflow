// npx tsx --test scripts/lyric-vj/beta/feedback.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFeedback, fixKindFor, parseFeedback } from './feedback.mts';
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
test('fixKindFor: picture or timing only when every mark agrees', () => {
  assert.equal(fixKindFor([]), undefined);
  assert.equal(fixKindFor([mark({ category: 'picture' }), mark({ category: 'picture' })] as never), 'picture');
  assert.equal(fixKindFor([mark({ category: 'timing' })] as never), 'timing');
  assert.equal(fixKindFor([mark({ category: 'picture' }), mark({ category: 'timing' })] as never), undefined);
  assert.equal(fixKindFor([mark({ category: 'lyrics' })] as never), undefined);
});
test('a fix is accepted for picture marks on img, timing marks on any tier; else refused', () => {
  const pic = { ok: false, marks: [mark({ category: 'picture' })], action: 'fix' };
  const tim = { ok: false, marks: [mark({ category: 'timing' })], action: 'fix' };
  assert.ok(parseFeedback(pic, 10, 'img').ok);
  assert.equal(bad2(pic, 'hybrid'), '這類問題目前只能重做或只回報');
  assert.equal(bad2(pic, 'none'), '這類問題目前只能重做或只回報');
  for (const tier of ['none', 'img', 'hybrid'] as const) assert.ok(parseFeedback(tim, 10, tier).ok);
  assert.equal(bad2({ ok: false, marks: [mark()], action: 'fix' }, 'img'), '這類問題目前只能重做或只回報');
  assert.equal(bad2({ ok: false, marks: [mark({ category: 'picture' }), mark({ category: 'timing' })], action: 'fix' }, 'img'), '這類問題目前只能重做或只回報');
  assert.equal(bad2({ ok: false, suggestion: 'x', action: 'fix' }, 'img'), '這類問題目前只能重做或只回報');
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
