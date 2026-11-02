// The browser beat detector against stored beats: tempo, offset, and how many beats agree within 70 ms (the usual
// beat-tracking tolerance). The stored beats came from analyzeAudio (scripts/lyric-vj/song.mts), another detector and
// not ground truth, so this measures agreement. Spends nothing, writes nothing.
// A second reference, one JSON of {tempo, beats} per song id, goes in --ref <dir> (made with librosa.beat.beat_track).
// npx tsx scripts/lyric-vj/beat-check.mts [--ref dir] [id ...]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BEAT_RATE, detectBeats, onsetEnvelope } from '../../src/app/lyric-vj/beat-detect';

const DB = 'out/db';
const pcm = (file: string) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(BEAT_RATE), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 - 1 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
};
const fMeasure = (est: number[], ref: number[], win = 0.07) => {
  let hit = 0;
  let j = 0;
  for (const r of ref) {
    while (j < est.length && est[j] < r - win) j++;
    if (j < est.length && est[j] <= r + win) { hit++; j++; }
  }
  return est.length && ref.length ? (2 * hit) / (est.length + ref.length) : 0;
};
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const nearestOffsets = (est: number[], ref: number[]) => {
  let j = 0;
  return ref.flatMap((r) => {
    while (j + 1 < est.length && Math.abs(est[j + 1] - r) <= Math.abs(est[j] - r)) j++;
    const d = est[j] - r;
    return Math.abs(d) < 0.1 ? [d] : [];
  });
};
const halved = (xs: number[], k: number) => xs.filter((_, i) => i % 2 === k);

const { values: a, positionals } = parseArgs({ options: { ref: { type: 'string' } }, allowPositionals: true });
/** How much onset the beats land on (higher is better): an even-handed measure, since it needs no reference. */
const landing = (env: Float32Array, fps: number, beats: number[]) => beats.reduce((s, b) => {
  const f = Math.round(b * fps);
  return s + Math.max(...[-3, -2, -1, 0, 1, 2, 3].map((k) => env[f + k] ?? 0));
}, 0) / Math.max(1, beats.length);
const compare = (got: number[], gotTempo: number, ref: number[], refTempo: number) => {
  const shift = median(nearestOffsets(got, ref));
  const moved = got.map((b) => b - shift);
  const f = fMeasure(moved, ref);
  // the same pulse at another level: one tracker counts every beat, the other every second one
  const level = Math.max(f, fMeasure(halved(moved, 0), ref), fMeasure(halved(moved, 1), ref), fMeasure(moved, halved(ref, 0)), fMeasure(moved, halved(ref, 1)));
  return { shift, f, level, ratio: gotTempo / refTempo };
};
const row = (c: ReturnType<typeof compare>) => `x${c.ratio.toFixed(2)} offset ${(c.shift * 1000).toFixed(0).padStart(4)} ms F ${c.f.toFixed(2)} any-level ${c.level.toFixed(2)}`;

const ids = positionals.length ? positionals : readdirSync(DB).filter((id) => existsSync(`${DB}/${id}/song.json`));
const rows: { stored: ReturnType<typeof compare>; ref?: ReturnType<typeof compare>; ours: number; theirs: number }[] = [];
for (const id of ids) {
  const song = JSON.parse(readFileSync(`${DB}/${id}/song.json`, 'utf8'));
  if (!song.beats?.length || !existsSync(song.audio?.mix ?? '')) continue;
  const samples = pcm(song.audio.mix);
  const t0 = performance.now();
  const got = detectBeats(samples, BEAT_RATE);
  const ms = performance.now() - t0;
  if (!got) { console.log(id, 'no rhythm'); continue; }
  const { env, fps } = onsetEnvelope(samples, BEAT_RATE);
  const refFile = a.ref ? `${a.ref}/${id}.json` : '';
  const ref = refFile && existsSync(refFile) ? JSON.parse(readFileSync(refFile, 'utf8')) as { tempo: number; beats: number[] } : undefined;
  const r = { stored: compare(got.beats, got.tempo, song.beats, song.tempo), ref: ref && compare(got.beats, got.tempo, ref.beats, ref.tempo), ours: landing(env, fps, got.beats), theirs: landing(env, fps, song.beats) };
  rows.push(r);
  console.log(`${id.padEnd(20)} ${String(song.title).slice(0, 20).padEnd(22)} got ${got.tempo.toFixed(1).padStart(5)} conf ${got.confidence.toFixed(2)} | stored ${song.tempo.toFixed(1).padStart(5)} ${row(r.stored)} | ${ref ? `librosa ${ref.tempo.toFixed(1).padStart(5)} ${row(r.ref!)}` : 'no ref'} | landing ours ${r.ours.toFixed(2)} stored ${r.theirs.toFixed(2)} ${ref ? `librosa ${landing(env, fps, ref.beats).toFixed(2)}` : ''} | ${ms.toFixed(0)} ms`);
}
const summary = (name: string, cs: ReturnType<typeof compare>[]) => console.log(`${name}: songs ${cs.length}, tempo within 4%: ${cs.filter((c) => Math.abs(c.ratio - 1) < 0.04).length}, any level ${cs.filter((c) => c.level > 0.8).length} above 0.8, median F ${median(cs.map((c) => c.f)).toFixed(2)}, median any-level ${median(cs.map((c) => c.level)).toFixed(2)}`);
summary('vs stored', rows.map((r) => r.stored));
summary('vs librosa', rows.flatMap((r) => (r.ref ? [r.ref] : [])));
console.log(`landing: ours beats stored on ${rows.filter((r) => r.ours > r.theirs).length}/${rows.length}`);
