// The owner-labelling clips (docs/research/2026-11-10-frame-labelling.md): for every sample of label-samples.mts, a short
// clip with the song's audio from ~1.5 s before its event to ~1.5 s after (and past both stable reading frames), the two
// stable frames as PNG, no overlay, no event name, no version: files named by the anonymous id only (s001.mp4,
// s001_1.png = the earlier stable frame, s001_2.png = the later). A hidden repeat is a copy of its original's files.
// The scheduler state is the measurement's: worldEvents on, plus the source's env (VJ_SCALE for the scale run). The job
// is rebuilt at HEAD and must still carry the sampled event (same kind, line and time within 0.05 s): if it does not,
// the sample is `stale` and is not rendered (the key's verdict would not describe the clip).
// Renders go one at a time (`nice -n 10`, `--workers 1`), each only once `pgrep -f "scripts/lyric-vj/render[.]mts"`
// prints nothing (other agents render too). A clip inside an owner clip already rendered from the same version is cut
// from it (REUSE) instead.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/label-clips.mts [--dir out/research/labelling-1110] [--owner ~/Desktop/vj/output/構圖標記_2026-11-10]
//     [--queue-only] [--limit n] [--ids s001,s002] [--first calibration]
//   --queue-only: write queue.json (every sample not yet done, the estimate, the command to continue) and the sheet; no render
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { SONGS } from './label-samples.mts';
import { answerSheet } from './label-sheet.mts';

/** Owner clips already rendered from a sampled version (scheduler on), and the window they cover. */
const REUSE = [
  { dir: 'out/research/q1-1109/render-4b/riso-nun-after', world: 'riso', song: 'nun', version: '4b-r2', range: [70, 130] },
  { dir: 'out/research/q1-1109/render-4b/silk-snow-after', world: 'silk', song: 'snow', version: '4b-r2', range: [60, 120] },
];
/**
 * Seconds a clip takes (the queue's estimate), from the five validation renders of 2026-11-10: 9–33 s of render.mts for a
 * 3 s clip at --workers 1 (mean 15 s), plus the job rebuilt at HEAD.
 */
const SEC_PER_RENDER = { setup: 14, perClipSecond: 2 };

const { values: a } = parseArgs({ options: { dir: { type: 'string', default: 'out/research/labelling-1110' }, owner: { type: 'string', default: join(homedir(), 'Desktop/vj/output/構圖標記_2026-11-10') }, 'queue-only': { type: 'boolean', default: false }, limit: { type: 'string' }, ids: { type: 'string' }, first: { type: 'string' } } });
type Sample = { pool: string; repeatOf?: string; world: string; song: string; version: string; env?: Record<string, string>; at: number; kind: string; scope: string; lineIds: string[]; clip: { from: number; to: number; stills: [number, number] } };
const key = JSON.parse(readFileSync(join(a.dir!, 'key.json'), 'utf8')) as { samples: Record<string, Sample> };
const manifest = JSON.parse(readFileSync(join(a.dir!, 'manifest.json'), 'utf8')) as { samples: { id: string }[] };
const owner = a.owner!;
const clips = join(owner, 'clips');
mkdirSync(clips, { recursive: true });
const done = (id: string) => ['.mp4', '_1.png', '_2.png'].every((x) => existsSync(join(clips, `${id}${x}`)));
const statusFile = join(a.dir!, 'clips-status.json');
const status: Record<string, { how: string; sec?: number; stale?: string; headCommit?: string }> = existsSync(statusFile) ? JSON.parse(readFileSync(statusFile, 'utf8')) : {};
const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

const originals = Object.entries(key.samples).filter(([, s]) => !s.repeatOf).map(([id]) => id);
// (the order: the calibration set first when asked, so the 40 can be labelled and the thresholds frozen before the rest)
const order = a.first ? [...originals.filter((id) => key.samples[id].pool === a.first), ...originals.filter((id) => key.samples[id].pool !== a.first)] : originals;
const todo = order.filter((id) => !done(id) && !status[id]?.stale);
const estimate = (ids: string[]) => Math.round(ids.reduce((s, id) => { const c = key.samples[id].clip; return s + (reuseOf(key.samples[id]) ? 3 : SEC_PER_RENDER.setup + (c.to - c.from) * SEC_PER_RENDER.perClipSecond); }, 0));
function reuseOf(s: Sample) {
  const r = REUSE.find((x) => x.world === s.world && x.song === s.song && x.version === s.version && !s.env && s.clip.from >= x.range[0] && s.clip.to <= x.range[1]);
  const mp4 = r && existsSync(r.dir) ? readdirSync(r.dir).find((f) => f.endsWith('.mp4') && f.startsWith('lyric-vj_vocal_')) : undefined;
  return r && mp4 ? { ...r, mp4: join(r.dir, mp4) } : undefined;
}
const ff = (args: string[]) => { const p = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]); if (p.status) throw new Error(`ffmpeg ${args.join(' ')}: ${p.stderr}`); };
/** The clip cut out of a longer render (offset: the render's own start), and its two stills from the clip. */
function cut(src: string, offset: number, id: string, s: Sample) {
  ff(['-ss', String(s.clip.from - offset), '-i', src, '-t', String(s.clip.to - s.clip.from), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', join(clips, `${id}.mp4`)]);
  s.clip.stills.forEach((t, k) => ff(['-ss', String(t - offset), '-i', src, '-frames:v', '1', join(clips, `${id}_${k + 1}.png`)]));
}
const waitForRenders = () => { while (spawnSync('pgrep', ['-f', 'scripts/lyric-vj/render[.]mts']).stdout.toString().trim()) spawnSync('sleep', ['20']); };

async function renderOne(id: string, s: Sample) {
  const r = reuseOf(s);
  if (r) { cut(r.mp4, r.range[0], id, s); return { how: `cut from ${r.dir}` }; }
  for (const [k, v] of Object.entries(s.env ?? {})) process.env[k] = v;
  const { freeJob } = await import('../../src/app/lyric-vj/free-plan');
  const { OFFERED_STYLES } = await import('../../src/app/lyric-vj/free-styles');
  const db = SONGS[s.song].db;
  const songFile = `out/db/${db}/song.json`;
  const song = JSON.parse(readFileSync(songFile, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${s.song}/meaning.json`, 'utf8'));
  const f = freeJob(song, { style: OFFERED_STYLES.find((x) => x.id === s.world)!, seed: 0, meaning, worldEvents: true });
  for (const k of Object.keys(s.env ?? {})) delete process.env[k];
  const e = f.treatment.worldEvents?.events.find((x) => x.kind === s.kind && Math.abs(x.at - s.at) < 0.05 && x.lineIds.at(-1) === s.lineIds.at(-1));
  if (!e) return { how: 'not rendered', stale: `the job at ${head} no longer has the sampled ${s.kind} at ${s.at} on ${s.lineIds.at(-1)}` };
  const work = resolve(a.dir!, 'work', id);
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, 'treatment.json'), JSON.stringify(f.treatment));
  // (--unconfirmed: two of the songs have lines whose timing is not confirmed yet; the measurement read them as they are)
  waitForRenders();
  const t0 = Date.now();
  const p = spawnSync('nice', ['-n', '10', 'npx', 'tsx', '--tsconfig', 'tsconfig.json', 'scripts/lyric-vj/render.mts', '--song', songFile, '--treatment', join(work, 'treatment.json'), '--start', '0', '--end', String(song.duration), '--clip', `${s.clip.from},${s.clip.to}`, '--workers', '1', '--job', `label-${id}`, '--out', work, '--unconfirmed'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  writeFileSync(join(work, 'render.log'), `${p.stdout}\n${p.stderr}`);
  const mp4 = readdirSync(work).find((x) => x.startsWith('lyric-vj_vocal_') && x.endsWith('.mp4'));
  if (p.status || !mp4) throw new Error(`render ${id} failed (exit ${p.status}): ${work}/render.log`);
  cut(join(work, mp4), s.clip.from, id, s);
  return { how: 'rendered', sec: Math.round((Date.now() - t0) / 1000) };
}

const pick = a.ids ? a.ids.split(',') : a.limit ? todo.slice(0, Number(a.limit)) : todo;
if (!a['queue-only']) for (const id of pick) {
  if (done(id)) continue;
  console.error(id, 'rendering');
  status[id] = { ...(await renderOne(id, key.samples[id])), headCommit: head };
  writeFileSync(statusFile, JSON.stringify(status, null, 1));
  console.error(id, JSON.stringify(status[id]));
}
// hidden repeats: their original's files under their own id
for (const [id, s] of Object.entries(key.samples)) if (s.repeatOf && done(s.repeatOf) && !done(id)) for (const x of ['.mp4', '_1.png', '_2.png']) copyFileSync(join(clips, `${s.repeatOf}${x}`), join(clips, `${id}${x}`));

const left = order.filter((id) => !done(id) && !status[id]?.stale);
const queue = {
  head, date: new Date().toISOString().slice(0, 10),
  done: manifest.samples.filter((x) => done(x.id)).length, total: manifest.samples.length,
  stale: Object.entries(status).filter(([, v]) => v.stale).map(([id, v]) => ({ id, why: v.stale })),
  left: left.map((id) => ({ id, pool: key.samples[id].pool })), estimateSec: estimate(left),
  command: `npx tsx --tsconfig tsconfig.json scripts/lyric-vj/label-clips.mts --dir ${a.dir} --first calibration`,
  note: 'resumable: every run renders what is left, one at a time, and copies the hidden repeats; re-draw the samples (label-samples.mts on new measurements) first if the scheduler contract changed',
};
writeFileSync(join(a.dir!, 'queue.json'), JSON.stringify(queue, null, 1));
writeFileSync(join(owner, '答題.md'), answerSheet(manifest.samples.map((x) => x.id), { final: false, done: queue.done, total: queue.total }));
writeFileSync(join(owner, '答題表.csv'), '﻿' + ['樣本,Q1 是否明確變成另一個穩定閱讀構圖（是/否/不確定）,Q2 變的是（座位/尺度關係/載體/取景，可複選以 / 分隔）,Q3 硬傷（無，或 秒數+描述）,備註', ...manifest.samples.map((x) => `${x.id},,,,`)].join('\n') + '\n');
console.log(JSON.stringify({ done: queue.done, total: queue.total, left: left.length, stale: queue.stale.length, estimateMin: Math.round(queue.estimateSec / 60) }));
