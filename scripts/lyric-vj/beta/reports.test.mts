// npx tsx --test scripts/lyric-vj/beta/reports.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Feedback } from './feedback.mts';
import { reportsText } from './reports.mts';

const f = (o: Partial<Feedback>): Feedback => ({ id: 'r1', jobId: 'j', songId: 's', userId: 'u', ok: false, marks: [], suggestion: '', action: 'none', createdAt: '2026-10-30T00:00:00Z', ...o });
const db = {
  songs: [{ id: 's', title: '終わりじゃない' }],
  lessons: [{ text: '間奏不放圖', scope: 'director' }],
  feedback: [f({ tier: 'img', style: '剪貼簿', marks: [{ at: 66.6, category: 'other', note: '音符看不清' }, { at: 70, end: 75, category: 'style', note: '' }], suggestion: '插圖太深' }), f({ id: 'r2', triage: { outcomes: ['code'], at: 'x', by: 'y' } }), f({ id: 'r3', ok: true })],
};

test('lists what waits with song, marks and the note, then the rules in force; --all adds the reviewed', () => {
  const t = reportsText(db);
  assert.match(t, /# 待處理回報 · 1/);
  assert.match(t, /## r1 · 終わりじゃない · img · 剪貼簿 · 有問題/);
  assert.match(t, /- 1:06 other：音符看不清/);
  assert.match(t, /- 1:10–1:15 style\n/);
  assert.match(t, /整體：插圖太深/);
  assert.match(t, /- \[director\] 間奏不放圖/);
  assert.doesNotMatch(t, /## r2|## r3/);
  assert.match(reportsText(db, true), /## r2 .*\n.*已歸類 code/);
});
