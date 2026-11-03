// npx tsx --test scripts/lyric-vj/beta/covers-backfill.test.mts
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { backfillPlan } from './covers-backfill.mts';

test('the backfill renders only live, prepared songs without a cover, and says why it skips the rest', () => {
  const root = mkdtempSync(join(tmpdir(), 'covers-'));
  const song = (id: string, files: Record<string, string>) => {
    mkdirSync(join(root, 'songs', id), { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'songs', id, name), body);
    return { id, userId: 'u', title: id, artist: '', language: 'ja', createdAt: '2026-11-03T00:00:00Z' };
  };
  const timed = JSON.stringify({ cues: [{ start: 1, end: 3, text: '夜をこえて' }], sections: [] });
  const songs = [
    song('todo', { 'song.json': timed }),
    song('covered', { 'song.json': timed, 'cover.jpg': 'x' }),
    song('draft', {}),
    song('wordless', { 'song.json': JSON.stringify({ cues: [] }) }),
    { ...song('deleted', { 'song.json': timed }), deletedAt: '2026-11-03T01:00:00Z' },
  ];
  const plan = backfillPlan(root, { songs });
  assert.deepEqual(plan.map((i) => [i.song.id, i.action]), [['todo', 'render'], ['covered', 'skip'], ['draft', 'skip'], ['wordless', 'skip']]);
  assert.deepEqual(plan.filter((i) => i.why).map((i) => i.why), ['已有封面', '還在準備中（沒有 song.json）', '沒有可用的歌詞時間']);
});
