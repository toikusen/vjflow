import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { logEvent, readEvents } from './events.mts';

test('events append as JSON lines and read back in order, skipping broken lines', () => {
  const root = mkdtempSync(join(tmpdir(), 'beta-ev-'));
  assert.deepEqual(readEvents(root, 's1'), []);
  logEvent(root, 's1', { type: 'song.created', by: 'u1' }, () => 'T1');
  logEvent(root, 's1', { type: 'audio.uploaded' }, () => 'T2');
  appendFileSync(join(root, 'songs', 's1', 'events.jsonl'), 'not json\n');
  logEvent(root, 's1', { type: 'job.queued', jobId: 'j1', priceUsd: 6 });
  const ev = readEvents(root, 's1');
  assert.deepEqual(ev.map((e) => e.type), ['song.created', 'audio.uploaded', 'job.queued']);
  assert.deepEqual([ev[0].at, ev[0].by, ev[2].priceUsd], ['T1', 'u1', 6]);
});
