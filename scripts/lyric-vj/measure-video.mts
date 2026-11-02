// The comparison method of docs/research/2026-11-01-jizura-comparison.md, as one script: decode to 960×540 grey at 30 fps,
// first 25 s; hard cuts with ffmpeg's scene score; changing pixels; distinct layouts by an 8×5 ink grid; ink overlap between
// versions at 2 fps. npx tsx scripts/lyric-vj/measure-video.mts --out report.json name=clip.mp4 ...
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, secs: { type: 'string', default: '25' }, overlap: { type: 'string' } } });
const [FW, FH, FPS] = [960, 540, 30];
const SECS = Number(a.secs);

/** The times ffmpeg's scene score passes a threshold. */
function cutTimes(file: string, thr: number) {
  const r = spawn('ffmpeg', ['-hide_banner', '-t', String(SECS), '-i', file, '-vf', `scale=640:360,select='gt(scene,${thr})',showinfo`, '-an', '-f', 'null', '-']);
  let log = '';
  return new Promise<number[]>((res) => {
    r.stderr.on('data', (d) => (log += String(d)));
    r.on('close', () => res([...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]))));
  });
}

/** The pixels that stand off the frame's own commonest tone: what "ink" means on any ground, light or dark. */
function inkMask(f: Uint8Array) {
  const hist = new Uint32Array(32);
  for (let i = 0; i < f.length; i += 7) hist[f[i] >> 3]++;
  const base = (hist.indexOf(Math.max(...hist)) << 3) + 4;
  const m = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) m[i] = Math.abs(f[i] - base) > 40 ? 1 : 0;
  return m;
}
function gridOf(m: Uint8Array) {
  const g = new Uint8Array(40);
  const c = new Uint32Array(40);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (m[y * FW + x]) c[Math.floor((y * 5) / FH) * 8 + Math.floor((x * 8) / FW)]++;
  const cell = (FW / 8) * (FH / 5);
  for (let i = 0; i < 40; i++) g[i] = c[i] / cell > 0.04 ? 1 : 0;
  return g;
}
const hamming = (a: Uint8Array, b: Uint8Array) => a.reduce((s, v, i) => s + (v !== b[i] ? 1 : 0), 0);

async function measure(file: string) {
  const [t03, t015] = await Promise.all([cutTimes(file, 0.3), cutTimes(file, 0.15)]);
  const [c03, c015] = [(t03.length * 10) / SECS, (t015.length * 10) / SECS];
  // each 0.15 segment is shown by its stillest frame
  const marks = t015.map((x) => Math.round(x * FPS));
  let nextMark = 0;
  const p = spawn('ffmpeg', ['-v', 'error', '-t', String(SECS), '-i', file, '-vf', `fps=${FPS},scale=${FW}:${FH},format=gray`, '-f', 'rawvideo', '-']);
  const size = FW * FH;
  let buf = Buffer.alloc(0);
  let prev: Uint8Array | undefined;
  const changed: number[] = [];
  const masks: Uint8Array[] = [];
  let frame = 0;
  const stills: Uint8Array[] = [];
  let best = Infinity;
  let keep: Uint8Array | undefined;
  const take = (f: Uint8Array) => {
    let n = 0;
    if (prev) { for (let i = 0; i < size; i++) if (Math.abs(f[i] - prev[i]) > 12) n++; }
    const share = n / size;
    if (prev) changed.push(share);
    if (frame >= (marks[nextMark] ?? Infinity)) { nextMark++; if (keep) stills.push(gridOf(inkMask(keep))); best = Infinity; keep = undefined; }
    if (share < best) { best = share; keep = f.slice(); }
    if (frame % 15 === 0) masks.push(inkMask(f));
    prev = f.slice();
    frame++;
  };
  await new Promise<void>((res) => {
    p.stdout.on('data', (d: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      let at = 0;
      while (buf.length - at >= size) { take(new Uint8Array(buf.subarray(at, at + size))); at += size; }
      buf = buf.subarray(at);
    });
    p.on('close', () => res());
  });
  if (keep) stills.push(gridOf(inkMask(keep)));
  const groups: Uint8Array[] = [];
  for (const g of stills) if (!groups.some((x) => hamming(x, g) <= 6)) groups.push(g);
  const sorted = [...changed].sort((x, y) => x - y);
  const secs = frame / FPS;
  return { report: { frames: frame, cuts03_per10: +c03.toFixed(1), cuts015_per10: +c015.toFixed(1), changed_px_mean: +(changed.reduce((s, v) => s + v, 0) / Math.max(1, changed.length)).toFixed(4), changed_px_median: +sorted[Math.floor(sorted.length / 2)].toFixed(4), layouts_per30: +((groups.length * 30) / secs).toFixed(1), segments: stills.length }, masks };
}

const iou = (a: Uint8Array, b: Uint8Array) => { let x = 0, y = 0; for (let i = 0; i < a.length; i++) { x += a[i] & b[i]; y += a[i] | b[i]; } return y ? x / y : 0; };

const out: Record<string, unknown> = {};
const masks = new Map<string, Uint8Array[]>();
for (const item of positionals) {
  const [name, file] = item.split('=');
  const m = await measure(file);
  out[name] = m.report;
  masks.set(name, m.masks);
  console.log(name, JSON.stringify(m.report));
}
// groups of clips to compare: "fast:a,b,c;calm:d,e"
for (const group of (a.overlap ?? '').split(';').filter(Boolean)) {
  const [tag, list] = group.split(':');
  const ids = list.split(',');
  const pairs: Record<string, number> = {};
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const [x, y] = [masks.get(ids[i])!, masks.get(ids[j])!];
    const n = Math.min(x.length, y.length);
    let s = 0;
    for (let k = 0; k < n; k++) s += iou(x[k], y[k]);
    pairs[`${ids[i]}/${ids[j]}`] = +(s / n).toFixed(3);
  }
  const v = Object.values(pairs);
  out[`overlap-${tag}`] = { mean: +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(3), min: Math.min(...v), max: Math.max(...v), pairs };
  console.log(tag, JSON.stringify(out[`overlap-${tag}`]).slice(0, 200));
}
if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, JSON.stringify(out, null, 1)); }
