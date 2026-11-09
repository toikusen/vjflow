// Hold events per line-length bucket (docs/research/2026-11-09-rhythm-gaps-codex.md Q2): what the free plan schedules,
// and, with --render, what the frames show. $0: no reading calls (stored meaning only).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-events.mts --styles silk,terminal --out out/research/gaps-1109/hold [--render]
// --render draws each world/song window twice (events on / off, same seed) as the composite, the lyric layer and the
// lyric layer without its carriers, then hands the frames to hold_measure.py; frame dirs are removed afterwards.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo' };
const WINDOWS: Record<string, [number, number]> = { nun: [76, 101], snow: [67, 92] };
const { values: a } = parseArgs({ options: { styles: { type: 'string' }, songs: { type: 'string', default: 'nun,snow' }, out: { type: 'string' }, seed: { type: 'string', default: '0' }, render: { type: 'boolean', default: false }, layers: { type: 'string', default: 'full,text,words' } } });

/** The line-length buckets of the acceptance, s. */
export const BUCKETS = [[0, 0.6], [0.6, 1.5], [1.5, 3], [3, Infinity]] as const;
const bucketOf = (len: number) => BUCKETS.findIndex(([lo, hi]) => len >= lo && len < hi);
const label = (k: number) => (BUCKETS[k][1] === Infinity ? `>${BUCKETS[k][0]}` : `${BUCKETS[k][0]}-${BUCKETS[k][1]}`);

type Row = { cue: string; len: number; bucket: string; kind?: string; at?: number; sec?: number; stays?: boolean; skip?: string; why?: string[]; safe?: boolean; ink?: boolean };

/** Every line of the window with its planned hold event or the reason it has none. */
function planRows(style: string, name: string, seed: number) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const { treatment, job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === style)!, seed, meaning });
  const [lo, hi] = WINDOWS[name];
  const rows: Row[] = [];
  for (const c of treatment.cues as { cueId: string; world?: { beat?: { kind: string; at: number; sec?: number; stays?: boolean }; beatSkip?: string; beatWhy?: string[]; beatSafe?: boolean; beatInk?: boolean } }[]) {
    const s = song.cues.find((x: { id: string }) => x.id === c.cueId);
    if (!s || s.start < lo || s.start >= hi) continue;
    const len = s.end - s.start;
    const b = c.world?.beat;
    rows.push({ cue: c.cueId, len: +len.toFixed(2), bucket: label(bucketOf(len)), ...(b ? { kind: b.kind, at: b.at, sec: b.sec, stays: !!b.stays } : { skip: c.world ? c.world.beatSkip ?? 'none' : 'not a world line', ...(c.world?.beatWhy ? { why: c.world.beatWhy } : {}) }), ...(c.world ? { safe: !!c.world.beatSafe, ink: !!c.world.beatInk } : {}) });
  }
  return { song, treatment, job, rows };
}

const summary = (rows: Row[]) => Object.fromEntries(BUCKETS.map((_, k) => {
  const of = rows.filter((r) => r.bucket === label(k));
  return [label(k), { lines: of.length, events: of.filter((r) => r.kind).length, share: of.length ? +(of.filter((r) => r.kind).length / of.length).toFixed(2) : null }];
}));
const skips = (rows: Row[]) => rows.filter((r) => r.skip).reduce<Record<string, number>>((m, r) => ({ ...m, [r.skip!]: (m[r.skip!] ?? 0) + 1 }), {});

const out = a.out!;
mkdirSync(out, { recursive: true });
const report: Record<string, unknown> = {};
for (const style of a.styles!.split(',')) for (const name of a.songs!.split(',')) {
  const { treatment, job, rows } = planRows(style, name, Number(a.seed));
  report[`${style}-${name}`] = { buckets: summary(rows), skips: skips(rows), rows };
  console.log(style, name, JSON.stringify(summary(rows)), JSON.stringify(skips(rows)));
  if (!a.render) continue;
  const dir = join(out, `${style}-${name}`);
  mkdirSync(dir, { recursive: true });
  const off = structuredClone(treatment) as { cues: { world?: { beat?: unknown } }[] };
  for (const c of off.cues) if (c.world) delete c.world.beat;
  writeFileSync(join(dir, 'on.json'), JSON.stringify(treatment));
  writeFileSync(join(dir, 'off.json'), JSON.stringify(off));
  writeFileSync(join(dir, 'rows.json'), JSON.stringify(rows));
  const [lo, hi] = WINDOWS[name];
  for (const v of ['on', 'off']) for (const layer of a.layers!.split(',')) {
    const to = join(dir, `${v}-${layer}`);
    const ext = layer === 'full' ? 'mp4' : 'mov';
    const file = join(to, `lyric-vj_${layer === 'full' ? '' : `${layer}_`}vocal_${lo}-${hi}s.${ext}`);
    if (existsSync(file)) continue;
    mkdirSync(to, { recursive: true });
    // one render at a time on this machine: wait for any other render to finish first
    while (spawnSync('pgrep', ['-f', 'render[.]mts']).status === 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
    const r = spawnSync('nice', ['-n', '10', 'npx', 'tsx', '--tsconfig', 'tsconfig.json', 'scripts/lyric-vj/render.mts', '--song', `out/db/${IDS[name]}/song.json`, '--treatment', join(dir, `${v}.json`), '--out', to, '--clip', `${lo},${hi}`, '--fps', '30', '--workers', '1', '--font', job.fonts.family, '--unconfirmed', ...(layer === 'full' ? [] : ['--layer', layer])], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (r.status) throw new Error(`render ${style} ${name} ${v} ${layer} failed (${r.status})`);
    rmSync(join(to, 'render'), { recursive: true, force: true });
    rmSync(join(to, 'segments'), { recursive: true, force: true });
  }
  const m = spawnSync('uv', ['run', '--no-project', '--with', 'numpy', 'python', '-I', 'scripts/lyric-vj/hold_measure.py', dir, `out/db/${IDS[name]}/song.json`, String(lo), String(hi)], { encoding: 'utf8' });
  if (m.status) throw new Error(`measure ${style} ${name}: ${m.stderr}`);
  (report[`${style}-${name}`] as Record<string, unknown>)['frames'] = JSON.parse(readFileSync(join(dir, 'measure.json'), 'utf8'));
  console.log(m.stdout.trim());
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
