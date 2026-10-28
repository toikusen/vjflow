// npx tsx --test scripts/lyric-vj/beta/fix-apply.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutTimes, holdGap } from '../interludes.mts';
import { applyPictureFix, cutSpans, KEEP_REASON, keptInterludes, NOTHING_TO_REMOVE, type FixPlan } from './fix-apply.mts';

const cut = (beat: number, sprite: string) => ({ beat, sprite, fx: 'wall' });
const plan = (): FixPlan => ({
  shots: [
    { shot: 's1', cuts: [cut(0, 'a'), cut(2, 'b'), cut(4, ''), cut(6, 'c')] },
    { shot: 's2', cuts: [cut(0, 'd'), cut(2, 'e')] },
  ],
});
const beats = Array.from({ length: 16 }, (_, i) => i);
const timeline = (gap = 0.45) => ({ shots: [{ id: 's1', start: 0, end: 8, gap }, { id: 's2', start: 8, end: 12, gap }], beats, duration: 12 });
const sprites = (p: FixPlan) => p.shots.flatMap((s) => s.cuts.map((c) => c.sprite));

test('cutSpans: a cut runs from its beat to the next cut that lands, or the shot end', () => {
  const spans = cutSpans(plan(), timeline());
  assert.deepEqual(spans.map((x) => [x.start, x.end]), [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12]]);
});

test('a range removes the pictures of the cuts it overlaps, nothing else', () => {
  const p = plan();
  const r = applyPictureFix(p, [{ at: 2.5, end: 3 }], timeline());
  assert.equal(r.removed, 1);
  assert.deepEqual(sprites(r.plan), ['a', '', '', 'c', 'd', 'e']);
  assert.deepEqual(sprites(p), ['a', 'b', '', 'c', 'd', 'e'], 'the given plan is not changed');
});

test('a range without an end covers two seconds; touching edges do not overlap', () => {
  const r = applyPictureFix(plan(), [{ at: 2 }], timeline());
  assert.deepEqual(sprites(r.plan), ['a', '', '', 'c', 'd', 'e']);
  assert.equal(r.removed, 1);
});

test('ranges across shots and several ranges', () => {
  const r = applyPictureFix(plan(), [{ at: 7, end: 9 }, { at: 11, end: 11.5 }], timeline());
  assert.deepEqual(sprites(r.plan), ['a', 'b', '', '', '', '']);
  assert.equal(r.removed, 3);
});

test('a skipped next cut makes the one before it run on (held gap)', () => {
  // gap 2.5: the cut at 2 s is too soon after 0 s, so the first cut runs to 4 s
  const r = applyPictureFix(plan(), [{ at: 3, end: 3.5 }], timeline(2.5));
  assert.deepEqual(sprites(r.plan).slice(0, 2), ['', '']);
});

test('a range outside every cut removes nothing', () => {
  const r = applyPictureFix(plan(), [{ at: 20, end: 22 }], timeline());
  assert.equal(r.removed, 0);
  assert.deepEqual(sprites(r.plan), ['a', 'b', '', 'c', 'd', 'e']);
});

test('the shared cut helpers: first cut at the shot start, later ones on the shot beats; held cuts hold four beats', () => {
  assert.deepEqual(cutTimes([0, 1, 2, 3, 4, 5], { start: 1.5, end: 4.5 }, [{ beat: 0 }, { beat: 1 }, { beat: 9 }]), [1.5, 3, 4.5]);
  assert.equal(holdGap('quick', false, 0.5), 0.45);
  assert.equal(holdGap('held', true, 0.5), 2);
  assert.equal(holdGap('held', true, 0.2), 1.2);
  assert.equal(holdGap('mixed', true, 0.5), 0.45);
  assert.equal(holdGap('mixed', false, 0.5), 2);
});

test('kept items of a part overlapping a range lose their picture; other parts keep theirs', () => {
  const p: FixPlan = { ...plan(), parts: [
    { from: 's1', keep: { style: 'stage', items: [{ sprite: 'k1', word: 'w' }, { sprite: '', word: 'x' }] } },
    { from: 's2', keep: { style: 'stage', items: [{ sprite: 'k2', word: 'y' }] } },
  ] };
  const r = applyPictureFix(p, [{ at: 9, end: 9.5 }], timeline());
  assert.deepEqual(r.plan.parts!.map((x) => x.keep!.items.map((i) => i.sprite)), [['k1', ''], ['']]);
  assert.equal(r.removed, 2, 'the kept k2 and the cut d (8–10 s)');
});

test('the thread loses its picture only when a range falls in a shot where it shows', () => {
  const withThread = (levels: number[]): FixPlan => ({ ...plan(), thread: { sprite: 't' }, shots: plan().shots.map((x, i) => ({ ...x, level: levels[i] })) });
  assert.equal(applyPictureFix(withThread([0, 1]), [{ at: 20, end: 21 }], timeline()).plan.thread!.sprite, 't');
  assert.equal(applyPictureFix(withThread([0, 1]), [{ at: 9, end: 9.2 }], timeline()).plan.thread!.sprite, '');
  // up in s1, so s2 still eases out of it
  assert.equal(applyPictureFix(withThread([1, 0]), [{ at: 9, end: 9.2 }], timeline()).plan.thread!.sprite, '');
  assert.equal(applyPictureFix(withThread([0, 0]), [{ at: 9, end: 9.2 }], timeline()).plan.thread!.sprite, 't');
});

test('keptInterludes: a base without interludes gets every unsung window as pictures; one with interludes is left alone', () => {
  const song = { duration: 40, cues: [{ id: 'c1', start: 5, end: 10, text: 'a' }, { id: 'c2', start: 20, end: 25, text: 'b' }] };
  assert.deepEqual(keptInterludes({ shots: [] }, song), [
    { start: 0, end: 5, mode: 'pictures', reason: KEEP_REASON },
    { start: 10, end: 20, mode: 'pictures', reason: KEEP_REASON },
    { start: 25, end: 40, mode: 'pictures', reason: KEEP_REASON },
  ]);
  assert.equal(keptInterludes({ shots: [], interludes: [] }, song), undefined, "an empty list is the director's decision");
  assert.equal(keptInterludes({ shots: [], interludes: [{ start: 0, end: 5, mode: 'backdrop', reason: '' }] }, song), undefined);
  assert.equal(KEEP_REASON, '保留原版（修正不改間奏）');
});

// ---- fix.sh on a stub tree: a fake npx runs the real fix-apply and only echoes typeplan; make.sh is a stub ----

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
function fixTree() {
  const t = mkdtempSync(join(tmpdir(), 'fixsh-'));
  mkdirSync(join(t, 'repo/scripts/lyric-vj/beta'), { recursive: true });
  cpSync(join(here, 'fix.sh'), join(t, 'repo/scripts/lyric-vj/beta/fix.sh'));
  writeFileSync(join(t, 'repo/scripts/lyric-vj/beta/make.sh'), 'echo "##PHASE make $3"; touch "$3/made"\n');
  mkdirSync(join(t, 'bin'));
  writeFileSync(join(t, 'bin/npx'), `#!/bin/bash\nif [[ "$2" == *fix-apply.mts ]]; then shift 2; exec ${JSON.stringify(join(repo, 'node_modules/.bin/tsx'))} ${JSON.stringify(join(here, 'fix-apply.mts'))} "$@"; fi\necho "npx $*"\n`, { mode: 0o755 });
  const song = join(t, 'song'), src = join(song, 'runs/m1');
  mkdirSync(join(src, 'img/video'), { recursive: true });
  mkdirSync(join(src, 'base'), { recursive: true });
  const songJson = { duration: 12, tempo: 60, beats, downbeats: [], cues: [{ id: 'c1', start: 1, end: 2, text: 'a' }] };
  writeFileSync(join(src, 'song.json'), JSON.stringify(songJson));
  writeFileSync(join(song, 'song.json'), JSON.stringify(songJson));
  writeFileSync(join(src, 'base/treatment.json'), JSON.stringify({ shots: [{ id: 's1', start: 0, end: 8 }, { id: 's2', start: 8, end: 12 }] }));
  writeFileSync(join(src, 'img/typeplan.json'), JSON.stringify(plan()));
  writeFileSync(join(src, 'img/video/x.mp4'), 'v');
  writeFileSync(join(src, 'video.mp4'), 'v');
  const run = (from: string, to: string, ranges: string) => spawnSync('bash', [join(t, 'repo/scripts/lyric-vj/beta/fix.sh'), song, 'img', join(song, 'runs', to), join(song, 'runs', from), 'picture', ranges], { encoding: 'utf8', env: { ...process.env, PATH: `${join(t, 'bin')}:${process.env.PATH}` } });
  return { song, src, run };
}
const treatmentOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'base/treatment.json'), 'utf8'));

test('fix.sh: a legacy base (no interludes) keeps its interlude pictures in the new run only; a base with interludes is untouched', () => {
  const t = fixTree();
  const before = readFileSync(join(t.src, 'base/treatment.json'), 'utf8');
  assert.equal(t.run('m1', 'f1', '[{"at":2.5,"end":3}]').status, 0);
  // the stub song: one line 1–2 s of 12 s, so the outro 2–12 s is the only unsung window
  assert.deepEqual(treatmentOf(join(t.song, 'runs/f1')).interludes, [{ start: 2, end: 12, mode: 'pictures', reason: KEEP_REASON }]);
  assert.equal(readFileSync(join(t.src, 'base/treatment.json'), 'utf8'), before, 'the source run is never written');
  const own = { shots: [{ id: 's1', start: 0, end: 8 }, { id: 's2', start: 8, end: 12 }], interludes: [{ start: 2, end: 12, mode: 'backdrop', reason: '' }] };
  writeFileSync(join(t.src, 'base/treatment.json'), JSON.stringify(own));
  assert.equal(t.run('m1', 'f2', '[{"at":2.5,"end":3}]').status, 0);
  assert.deepEqual(treatmentOf(join(t.song, 'runs/f2')), own);
});

const spritesIn = (file: string) => sprites(JSON.parse(readFileSync(file, 'utf8')));

test('fix.sh: a fix of a fix applies its own edit (the source marker and record are not copied)', () => {
  const t = fixTree();
  writeFileSync(join(t.src, '.fix-applied'), '');
  writeFileSync(join(t.src, 'fix.json'), '{"kind":"picture","old":true}');
  const r = t.run('m1', 'f1', '[{"at":2.5,"end":3}]');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const f1 = join(t.song, 'runs/f1');
  assert.deepEqual(spritesIn(join(f1, 'img/typeplan.json')), ['a', '', '', 'c', 'd', 'e']);
  assert.equal(JSON.parse(readFileSync(join(f1, 'fix.json'), 'utf8')).removed, 1);
  assert.ok(existsSync(join(f1, '.fix-applied')) && existsSync(join(f1, 'made')));
  assert.ok(!existsSync(join(f1, 'video.mp4')) && !existsSync(join(f1, 'img/video')));
});

test('fix.sh: nothing to remove stops before the render with a no-retry line', () => {
  const t = fixTree();
  const r = t.run('m1', 'f1', '[{"at":4.5,"end":5}]');
  assert.equal(r.status, 3);
  assert.match(r.stdout, new RegExp(`^##NORETRY ${NOTHING_TO_REMOVE}$`, 'm'));
  assert.match(r.stderr, new RegExp(NOTHING_TO_REMOVE));
  assert.ok(!existsSync(join(t.song, 'runs/f1/made')) && !existsSync(join(t.song, 'runs/f1/.fix-applied')));
});

test('fix.sh: a symlink out of the song folder is refused; one inside it is copied as a link', () => {
  const t = fixTree();
  symlinkSync(join(t.song, 'song.json'), join(t.src, 'inside'));
  assert.equal(t.run('m1', 'f1', '[{"at":2.5,"end":3}]').status, 0);
  symlinkSync('/etc/hosts', join(t.src, 'img/outside'));
  const r = t.run('m1', 'f2', '[{"at":2.5,"end":3}]');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /symlink/);
  assert.ok(!existsSync(join(t.song, 'runs/f2')));
});
