// npx tsx --test scripts/lyric-vj/beta/feedback.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addFeedback, parseFeedback } from './feedback.mts';
import { emptyDb } from './store.mts';

const mark = (o: object = {}) => ({ at: 1, category: 'lyrics', note: 'x', ...o });
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
test('fix and redo are rejected in this plan', () => {
  assert.equal(bad({ ok: false, marks: [mark()], action: 'fix' }), '修正與重做即將開放');
  assert.equal(bad({ ok: true, action: 'redo' }), '修正與重做即將開放');
  assert.ok(bad({ ok: false, marks: [mark()], action: 'zzz' }));
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
