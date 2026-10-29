// npx tsx --test scripts/lyric-vj/lesson-rules.test.mts
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lessonsBlock, MAX_LESSONS, readLessons } from './lesson-rules.mts';

const L = (id: string, text: string, scope: 'director' | 'typeplan' | 'both', createdAt: string) => ({ id, text, scope, createdAt });

test('lessonsBlock: a reader gets its own rules and the shared ones, newest first, capped; none gives an empty string', () => {
  const ls = [L('a', '間奏不放圖片', 'director', '2026-10-28'), L('b', '副歌回到同一組招式', 'typeplan', '2026-10-29'), L('c', '字一定要看得清楚', 'both', '2026-10-27')];
  assert.equal(lessonsBlock(ls, 'director'), '\n\n【使用者回饋整理出的規則（每一首都要遵守）】\n- 間奏不放圖片\n- 字一定要看得清楚');
  assert.equal(lessonsBlock(ls, 'typeplan'), '\n\n【使用者回饋整理出的規則（每一首都要遵守）】\n- 副歌回到同一組招式\n- 字一定要看得清楚');
  assert.equal(lessonsBlock([], 'director'), '');
  assert.equal(lessonsBlock([L('x', 'only typeplan', 'typeplan', '2026-10-29')], 'director'), '');
  const many = Array.from({ length: MAX_LESSONS + 5 }, (_, i) => L(`r${i}`, `rule ${i}`, 'both', `2026-${String(100 + i)}`));
  const block = lessonsBlock(many, 'director');
  assert.equal(block.split('\n- ').length - 1, MAX_LESSONS);
  assert.match(block, /rule 34/, 'the newest are kept');
  assert.doesNotMatch(block, /- rule 0\n/);
});

test('readLessons: the server file ({ lessons }) or a bare array; missing, broken or ill-shaped entries give nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lessons-'));
  const f = join(dir, 'lessons.json');
  assert.deepEqual(readLessons(f), []);
  assert.deepEqual(readLessons(undefined), []);
  writeFileSync(f, JSON.stringify({ lessons: [L('a', '規則', 'both', '2026-10-29'), { id: 'bad', text: '', scope: 'both' }, { id: 'odd', text: 'x', scope: 'nope' }] }));
  assert.deepEqual(readLessons(f).map((l) => l.id), ['a']);
  writeFileSync(f, JSON.stringify([L('b', '另一條', 'director', '2026-10-29')]));
  assert.deepEqual(readLessons(f).map((l) => l.id), ['b']);
  writeFileSync(f, '{not json');
  assert.deepEqual(readLessons(f), []);
});
