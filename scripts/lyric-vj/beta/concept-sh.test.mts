// npx tsx --test scripts/lyric-vj/beta/concept-sh.test.mts
// concept.sh on a stub tree: a fake npx logs every step's arguments; only the director step is left to run.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

/** A song with a previous concept run `c1` and a new run `c2` whose type plan and stills are already there. */
function tree(inputs: Record<string, unknown>) {
  const t = mkdtempSync(join(tmpdir(), 'conceptsh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'concept.sh'), join(t, 'repo/scripts/lyric-vj/beta/concept.sh'));
  mkdirSync(join(t, 'bin'));
  writeFileSync(join(t, 'bin/npx'), '#!/bin/bash\nprintf \'%s\\n\' "npx $*" >> "$NPX_LOG"\n', { mode: 0o755 });
  const song = join(t, 'song'), run = join(song, 'runs/c2');
  mkdirSync(join(song, 'runs/c1/base'), { recursive: true });
  writeFileSync(join(song, 'runs/c1/base/treatment.json'), '{}');
  mkdirSync(join(run, 'noimg'), { recursive: true });
  mkdirSync(join(run, 'stills'));
  writeFileSync(join(song, 'song.json'), JSON.stringify({ duration: 10, cues: [] }));
  writeFileSync(join(run, 'inputs.json'), JSON.stringify(inputs));
  writeFileSync(join(run, 'noimg/treatment.json'), '{}');
  const log = join(t, 'npx.log');
  const concept = (env: Record<string, string> = {}) => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/concept.sh'), song, run], { encoding: 'utf8', env: { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, NPX_LOG: log, ...env } });
  const direct = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').find((l) => l.includes('direct.mts')) ?? '';
  return { run, concept, direct };
}

test('concept.sh: an adjustment passes the previous treatment and the note; the note stays out of brief.txt', () => {
  const t = tree({ concept: '夏天的夜市', note: '再亮一點', from: 'c1', refs: [] });
  const r = t.concept();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = t.direct();
  assert.match(d, /--previous \S+\/runs\/c1\/base\/treatment\.json/);
  assert.match(d, /--note=再亮一點/);
  assert.equal(readFileSync(join(t.run, 'brief.txt'), 'utf8'), '夏天的夜市\n');
});

test('concept.sh: a redo passes the previous treatment without a note', () => {
  const t = tree({ concept: '夏天的夜市', from: 'c1', refs: [] });
  const r = t.concept();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const d = t.direct();
  assert.match(d, /--previous \S+\/runs\/c1\/base\/treatment\.json/);
  assert.doesNotMatch(d, /--note/);
});
