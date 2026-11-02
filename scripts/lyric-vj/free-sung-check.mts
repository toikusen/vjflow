// Estimated line starts (free-sung.ts) against the times stored for a song: out/db/<id>/song.json cues, aligned or from
// LRC, as near to truth as this project has. Reports the error, and even spacing over the whole song as the baseline it
// has to beat. Spends nothing, writes nothing.
// npx tsx scripts/lyric-vj/free-sung-check.mts id [id ...]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BEAT_RATE, detectBeats } from '../../src/app/lyric-vj/beat-detect';
import { estimateStarts, sungStretches } from '../../src/app/lyric-vj/free-sung';

const pcm = (file: string) => {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(BEAT_RATE), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 - 1 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
};
const at = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
const row = (errs: number[]) => `median ${at(errs, 0.5).toFixed(2)} s, p90 ${at(errs, 0.9).toFixed(2)} s, <0.5 s ${errs.filter((e) => e < 0.5).length}/${errs.length}, <1 s ${errs.filter((e) => e < 1).length}/${errs.length}`;

const all: number[] = [];
const base: number[] = [];
const oracle: number[] = [];
for (const id of process.argv.slice(2)) {
  const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
  const samples = pcm(song.audio.mix);
  const seconds = samples.length / BEAT_RATE;
  const t0 = performance.now();
  const stretches = sungStretches(samples, BEAT_RATE);
  const ms = performance.now() - t0;
  const rhythm = detectBeats(samples, BEAT_RATE);
  const texts: string[] = song.cues.map((c: { text: string }) => c.text);
  const truth: number[] = song.cues.map((c: { start: number }) => c.start);
  const errs = estimateStarts(texts, stretches, rhythm).map((t, i) => Math.abs(t - truth[i]));
  const even = estimateStarts(texts, [{ start: 0, end: seconds }]).map((t, i) => Math.abs(t - truth[i]));
  // the best this method could do: the true sung stretches, gaps of 4 s or more, only line lengths left to estimate
  const known: { start: number; end: number }[] = [];
  for (const c of song.cues) { const l = known.at(-1); if (l && c.start - l.end < 4) l.end = c.end; else known.push({ start: c.start, end: c.end }); }
  oracle.push(...estimateStarts(texts, known, rhythm).map((t, i) => Math.abs(t - truth[i])));
  all.push(...errs);
  base.push(...even);
  console.log(`${id} ${song.title}\n  est  ${row(errs)}\n  even ${row(even)}\n  sung ${stretches.map((r) => `${r.start.toFixed(0)}-${r.end.toFixed(0)}`).join(' ')}  truth ${truth[0].toFixed(0)}-${song.cues.at(-1).end.toFixed(0)}  (${ms.toFixed(0)} ms)`);
}
console.log(`ALL\n  est    ${row(all)}\n  even   ${row(base)}\n  oracle ${row(oracle)}`);
