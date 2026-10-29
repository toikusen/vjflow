// npx tsx --test scripts/lyric-vj/beta/make-sh.test.mts
// make.sh on a stub tree: a fake npx stands in for every step (the render writes what render.mts writes).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * A song with one run whose director and type plan are done; the fake render leaves a fresh mp4 and metrics.json.
 * `concept` adds what concept.sh leaves in an accepted run: brief.txt, request.txt and reference images.
 */
function tree(o: { tier?: 'none' | 'img' | 'hybrid'; plan?: boolean; concept?: { brief?: string; request?: string; refs?: string[] } } = {}) {
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
    // its log (make.sh redirects the render\'s output there): HIDES names a lyric-cover share
    '  [ -n "$HIDES" ] && echo "code layer: lyric covered: p1 hides ${HIDES}% of the lyric box"',
    'fi',
    // the delivery gate: QUALITY_HOLD names the fault, else the video passes
    'if [[ "$2" == *quality.mts ]]; then',
    '  [ -n "$QUALITY_RERENDER" ] && { echo "quality: 渲染器出錯 1 筆"; exit 20; }',
    '  [ -n "$QUALITY_HOLD" ] && { echo "quality: $QUALITY_HOLD"; echo "quality: 第二項"; exit 10; }',
    '  echo "quality: ok"',
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
  if (o.plan) writeFileSync(join(run, 'noimg/typeplan.json'), '{"shots":[]}');
  if (o.concept?.brief !== undefined) writeFileSync(join(run, 'brief.txt'), o.concept.brief);
  if (o.concept?.request !== undefined) writeFileSync(join(run, 'request.txt'), o.concept.request);
  if (o.concept?.refs?.length) mkdirSync(join(run, 'refs'));
  for (const r of o.concept?.refs ?? []) writeFileSync(join(run, 'refs', r), 'jpg');
  const log = join(t, 'npx.log');
  const make = (env: Record<string, string> = {}) => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/make.sh'), song, o.tier ?? 'none', run], { encoding: 'utf8', env: { ...process.env, ...env, PATH: `${join(t, 'bin')}:${process.env.PATH}`, NPX_LOG: log } });
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

test('make.sh: a finished render of the same inputs is resumed, not rendered again; one of other inputs, or without its manifest, is', () => {
  const t = tree();
  assert.equal(t.make().status, 0);
  assert.equal((t.calls().match(/render\.mts/g) ?? []).length, 1);
  assert.match(readFileSync(join(t.run, 'noimg/video/manifest.txt'), 'utf8'), /^[0-9a-f]{16}$/);
  // the same inputs again: resumed
  const r = t.make();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal((t.calls().match(/render\.mts/g) ?? []).length, 1, 'no second render');
  assert.match(r.stdout, /##PHASE 完成/);
  // the treatment changed under it (a retry after horizon or a renderer fix): rendered again
  writeFileSync(join(t.run, 'noimg/treatment.json'), '{"changed":1}');
  assert.equal(t.make().status, 0);
  assert.equal((t.calls().match(/render\.mts/g) ?? []).length, 2, 'a render for the new treatment');
  // a video and metrics from before manifests existed are not trusted either
  rmSync(join(t.run, 'noimg/video/manifest.txt'));
  assert.equal(t.make().status, 0);
  assert.equal((t.calls().match(/render\.mts/g) ?? []).length, 3);
});

test('make.sh: the delivery gate runs on the finished file and its plan check; a fault holds the video (exit 10) with the reason as the phase', () => {
  const t = tree();
  const r = t.make({ QUALITY_HOLD: '2 句可讀時間不足：x', HIDES: '55' });
  assert.equal(r.status, 10, r.stderr + r.stdout);
  // every finding, and every other hold reason, in the one phase line
  assert.match(r.stdout, /##PHASE 等管理者確認：2 句可讀時間不足：x；第二項；有歌詞被遮住 55%/);
  assert.doesNotMatch(r.stdout, /##PHASE 完成/);
  const gate = t.call('quality.mts');
  assert.match(gate, /--video \S+\/runs\/m1\/video\.mp4 --metrics \S+\/noimg\/video\/metrics\.json --plan-check \S+\/noimg\/plan-check\.json --expected-sec 10\.00 --fps 30 --report \S+\/runs\/m1\/quality\.json/);
  // the video is made (the admin can watch it) even though it is held
  assert.equal(readFileSync(join(t.run, 'video.mp4'), 'utf8'), 'fresh\n');
});

test('make.sh hybrid: the gate reads the plan check from noimg/, where the hybrid plan ran', () => {
  const t = tree({ tier: 'hybrid' });
  t.make();
  assert.match(t.call('quality.mts'), /--metrics \S+\/cut\/video\/metrics\.json --plan-check \S+\/noimg\/plan-check\.json/);
});

test('make.sh img: an accepted concept\'s plan is bound with the props, not planned again; without one the img tier plans afresh', () => {
  const t = tree({ tier: 'img', plan: true });
  assert.equal(t.make().status, 0);
  assert.match(t.call('typeplan.mts'), /--out \S+\/runs\/m1\/img --sprites \S+\/props\/library --bind \S+\/runs\/m1\/noimg\/typeplan\.json/);
  const fresh = tree({ tier: 'img' });
  assert.equal(fresh.make().status, 0);
  assert.match(fresh.call('typeplan.mts'), /--sprites \S+\/props\/library $/);
  assert.doesNotMatch(fresh.call('typeplan.mts'), /--bind/);
});

test('make.sh: a fault a fresh render may mend throws the render away and fails the job (the queue runs it once more), never hands the file over', () => {
  const t = tree();
  const r = t.make({ QUALITY_RERENDER: '1' });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.stdout, /##PHASE 成品有渲染錯誤，整段重做/);
  assert.equal(existsSync(join(t.run, 'video.mp4')), false);
  assert.equal(existsSync(join(t.run, 'noimg/video')), false, 'the render folder is gone, so the rerun renders afresh');
});
