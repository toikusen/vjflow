// Ink overlap across styles from world-measure-live.mts's masks, 2 fps, the same pairs on the same seconds, and a table of
// the density numbers. npx tsx scripts/lyric-vj/world-overlap.mts --dir out/research/styles/measure/live --out report.json a b c
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values: a, positionals: ids } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string' }, out: { type: 'string' } } });
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
const median = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
const size = 240 * 135;
const report: Record<string, unknown> = {};
for (const song of ['nun', 'snow']) {
  const inks = new Map(ids.map((id) => [id, readFileSync(join(a.dir!, `${id}-${song}.ink`))]));
  const pairs: Record<string, number> = {};
  ids.forEach((x, i) => ids.slice(i + 1).forEach((y) => {
    const [p, q] = [inks.get(x)!, inks.get(y)!];
    const frames = Math.floor(Math.min(p.length, q.length) / size);
    let s = 0;
    for (let f = 0; f < frames; f++) { let [u, v] = [0, 0]; for (let k = f * size; k < (f + 1) * size; k++) { u += p[k] & q[k]; v += p[k] | q[k]; } s += v ? u / v : 0; }
    pairs[`${x}/${y}`] = +(s / frames).toFixed(3);
  }));
  const v = Object.values(pairs);
  const rows = ids.map((id) => ({ id, ...JSON.parse(readFileSync(join(a.dir!, `${id}-${song}.json`), 'utf8')) }));
  const stat = (k: string) => ({ min: Math.min(...rows.map((r) => r[k])), median: median(rows.map((r) => r[k])), max: Math.max(...rows.map((r) => r[k])) });
  report[song] = { overlap: { mean: +mean(v).toFixed(3), min: Math.min(...v), max: Math.max(...v) }, cuts015: stat('cuts015_per10'), cuts03: stat('cuts03_per10'), changed: stat('changed_px_mean'), layouts: stat('layouts_per30'), rows, top: Object.entries(pairs).sort((x, y) => y[1] - x[1]).slice(0, 4) };
}
writeFileSync(a.out!, JSON.stringify(report, null, 1));
for (const s of ['nun', 'snow']) { const { rows, ...r } = report[s] as never as { rows: unknown[] }; console.log(s, JSON.stringify(r)); for (const x of rows) console.log(JSON.stringify(x)); }
