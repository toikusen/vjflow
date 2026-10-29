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

/**
 * A song with one run whose director and type plan are done; the fake render leaves a fresh mp4 and metrics.json.
 * `concept` adds what concept.sh leaves in an accepted run: brief.txt, request.txt and reference images.
 */
function tree(o: { tier?: 'none' | 'hybrid'; concept?: { brief?: string; request?: string; refs?: string[] } } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'makesh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'make.sh'), join(t, 'repo/scripts/lyric-vj/beta/make.sh'));
  mkdirSync(join(t, 'bin'));
  writeFileSync(join(t, 'bin/npx'), [
    '#!/bin/bash',
    'printf \'%s\\n\' "npx $*" | tr \'\\n\' \' \' >> "$NPX_LOG"; echo >> "$NPX_LOG"',
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
  if (o.concept?.brief !== undefined) writeFileSync(join(run, 'brief.txt'), o.concept.brief);
  if (o.concept?.request !== undefined) writeFileSync(join(run, 'request.txt'), o.concept.request);
  if (o.concept?.refs?.length) mkdirSync(join(run, 'refs'));
  for (const r of o.concept?.refs ?? []) writeFileSync(join(run, 'refs', r), 'jpg');
  const log = join(t, 'npx.log');
  const make = () => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/make.sh'), song, o.tier ?? 'none', run], { encoding: 'utf8', env: { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, NPX_LOG: log } });
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '');
  const call = (step: string) => calls().split('\n').find((l) => l.includes(step)) ?? '';
  return { run, make, calls, call };
}

test('make.sh hybrid: the accepted concept text and first reference image reach keyframes; cutout draws from that board', () => {
  const t = tree({ tier: 'hybrid', concept: { brief: '水彩的夏天夜市\n', refs: ['ref-2.png', 'ref-1.jpg'] } });
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const kf = t.call('keyframes.mts');
  assert.match(kf, /--sheets-only --from 0 --to 10\.00 --out \S+\/kf --style=水彩的夏天夜市 --style-ref \S+\/runs\/m1\/refs\/ref-1\.jpg ?$/);
  assert.match(t.call('cutout.mts'), /--keyframes \S+\/runs\/m1\/kf --treatment \S+\/base\/treatment\.json/);
});

test('make.sh hybrid: an adjusted-then-accepted concept passes its whole request, not the original text', () => {
  const t = tree({ tier: 'hybrid', concept: { brief: '水彩的夏天\n', request: '水彩的夏天\n\n使用者對上一版的意見：改成版畫\n' } });
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(t.call('keyframes.mts'), /--style=水彩的夏天  使用者對上一版的意見：改成版畫 $/);
});

test('make.sh hybrid: a blank brief and no refs add nothing to keyframes', () => {
  const t = tree({ tier: 'hybrid', concept: { brief: ' \n' } });
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.doesNotMatch(t.call('keyframes.mts'), /--style/);
  const bare = tree({ tier: 'hybrid' });
  assert.equal(bare.make().status, 0);
  assert.doesNotMatch(bare.call('keyframes.mts'), /--style/);
});

test('make.sh: a video file left by an unfinished render is rendered again, not handed over', () => {
  const t = tree();
  writeFileSync(join(t.run, 'noimg/video/lyric-vj_vocal_0-10s.mp4'), 'stale\n');
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(t.calls(), /render\.mts/);
  assert.equal(readFileSync(join(t.run, 'video.mp4'), 'utf8'), 'fresh\n');
});

test('make.sh guard (passes before the fix too): a finished render (metrics.json beside the video) is resumed, not rendered again', () => {
  const t = tree();
  writeFileSync(join(t.run, 'noimg/video/lyric-vj_vocal_0-10s.mp4'), 'made\n');
  writeFileSync(join(t.run, 'noimg/video/metrics.json'), '{}');
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.doesNotMatch(t.calls(), /render\.mts/);
  assert.equal(readFileSync(join(t.run, 'video.mp4'), 'utf8'), 'made\n');
  assert.match(r.stdout, /##PHASE 完成/);
});
