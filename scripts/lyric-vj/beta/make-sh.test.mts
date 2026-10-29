// npx tsx --test scripts/lyric-vj/beta/make-sh.test.mts
// make.sh on a stub tree: a fake npx stands in for every step (the render writes what render.mts writes).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

/** A song with one none-tier run whose director and type plan are done; the fake render leaves a fresh mp4 and metrics.json. */
function tree() {
  const t = mkdtempSync(join(tmpdir(), 'makesh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'make.sh'), join(t, 'repo/scripts/lyric-vj/beta/make.sh'));
  mkdirSync(join(t, 'bin'));
  writeFileSync(join(t, 'bin/npx'), [
    '#!/bin/bash',
    'echo "npx $*" >> "$NPX_LOG"',
    'if [[ "$2" == *render.mts ]]; then',
    '  while [ $# -gt 0 ]; do [ "$1" = --out ] && out=$2; shift; done',
    '  mkdir -p "$out"; echo fresh > "$out/lyric-vj_vocal_0-10s.mp4"; echo "{}" > "$out/metrics.json"',
    'fi',
    '',
  ].join('\n'), { mode: 0o755 });
  const song = join(t, 'song'), run = join(song, 'runs/m1');
  mkdirSync(join(run, 'base'), { recursive: true });
  mkdirSync(join(run, 'noimg/video'), { recursive: true });
  writeFileSync(join(song, 'song.json'), JSON.stringify({ duration: 10, cues: [] }));
  writeFileSync(join(run, 'song.json'), JSON.stringify({ duration: 10, cues: [] }));
  writeFileSync(join(run, 'base/treatment.json'), '{}');
  writeFileSync(join(run, 'noimg/treatment.json'), '{}');
  const log = join(t, 'npx.log');
  const make = () => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/make.sh'), song, 'none', run], { encoding: 'utf8', env: { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, NPX_LOG: log } });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  return { run, make, calls };
}

test('make.sh: a video file left by an unfinished render is rendered again, not handed over', () => {
  const t = tree();
  writeFileSync(join(t.run, 'noimg/video/lyric-vj_vocal_0-10s.mp4'), 'stale\n');
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(t.calls(), /render\.mts/);
  assert.equal(readFileSync(join(t.run, 'video.mp4'), 'utf8'), 'fresh\n');
});

test('make.sh: a finished render (metrics.json beside the video) is resumed, not rendered again', () => {
  const t = tree();
  writeFileSync(join(t.run, 'noimg/video/lyric-vj_vocal_0-10s.mp4'), 'made\n');
  writeFileSync(join(t.run, 'noimg/video/metrics.json'), '{}');
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.doesNotMatch(t.calls(), /render\.mts/);
  assert.equal(readFileSync(join(t.run, 'video.mp4'), 'utf8'), 'made\n');
  assert.match(r.stdout, /##PHASE 完成/);
});
