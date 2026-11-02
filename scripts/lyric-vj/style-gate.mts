// The similarity gate, levels 1 and 2 of docs/research/2026-11-01-style-standard.md §3: declared axes, then what real plans
// do. No renderer, no model call. npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate.mts --out out/research/styles/gate
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { partsOf, StyleWorld, worldHoles } from '../../src/app/lyric-vj/style-world';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/styles/gate' }, seeds: { type: 'string', default: '1,2,3' } } });
export const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };

/** Calibrated on batch 1 (2026-11-01): see 說明 and the progress file. */
export const LEVEL1 = { acrossFamily: 6, sameFamily: 4 };
export const LEVEL2 = { sameLayout: 0.2, sameEnter: 0.2, sameExit: 0.3, sameHold: 0.35, tvdLayout: 0.6, tvdEnter: 0.6, groundJaccard: 0.25, ratio: 2 };

const frameLead = (w: StyleWorld) => { const f = w.frameStack; const score: [string, number][] = [['grain', f.grain * 0.5], ['scan', f.scan * 2], ['paper', f.paper], ['flicker', f.flicker * 10], ['vignette', f.vignette * 0.6]]; return score.sort((x, y) => y[1] - x[1])[0][0]; };
const AXES: [string, (w: StyleWorld) => string][] = [['lyricRole', (w) => w.lyricRole], ['family', (w) => w.family], ['groundBand', (w) => w.groundBand.band], ['type', (w) => w.type.category], ['timeBase', (w) => `${w.timeBase.fps}/${w.timeBase.unit}`], ['curve', (w) => w.timeBase.curve], ['transition', (w) => w.transitions.family], ['frameStack', frameLead], ['peak', (w) => w.peak.loud]];

function level1() {
  const fails: string[] = [...STYLE_WORLDS.flatMap(worldHoles)];
  const rows: { a: string; b: string; axes: number; same: boolean }[] = [];
  STYLE_WORLDS.forEach((x, i) => STYLE_WORLDS.slice(i + 1).forEach((y) => {
    const diff = AXES.filter(([, f]) => f(x) !== f(y)).length;
    const same = x.family === y.family;
    rows.push({ a: x.id, b: y.id, axes: diff, same });
    if (diff < (same ? LEVEL1.sameFamily : LEVEL1.acrossFamily)) fails.push(`${x.id} / ${y.id}: ${diff} axes differ, ${same ? 'same' : 'across'} family`);
  }));
  // a part belongs to one world (print worlds still share the common paper grounds until batch 6)
  const owner = new Map<string, string>();
  for (const w of STYLE_WORLDS.filter((x) => x.family !== 'print')) for (const p of partsOf(w)) { if (owner.has(p)) fails.push(`${p}: in ${owner.get(p)} and ${w.id}`); owner.set(p, w.id); }
  // parts take slots: no colour literal in a part's source
  for (const f of readdirSync('src/app/lyric-vj/render').filter((n) => /^world-.*\.ts$/.test(n) && !n.includes('spec'))) {
    const hex = readFileSync(join('src/app/lyric-vj/render', f), 'utf8').match(/['"`]#[0-9a-fA-F]{3,8}['"`]/g) ?? [];
    if (hex.length) fails.push(`${f}: colour literals ${hex.join(' ')}`);
  }
  return { fails, rows };
}

const tvd = (x: Map<string, number>, y: Map<string, number>) => { const [nx, ny] = [[...x.values()].reduce((a, b) => a + b, 0), [...y.values()].reduce((a, b) => a + b, 0)]; return 0.5 * [...new Set([...x.keys(), ...y.keys()])].reduce((s, k) => s + Math.abs((x.get(k) ?? 0) / Math.max(1, nx) - (y.get(k) ?? 0) / Math.max(1, ny)), 0); };
const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return m; };
const jaccard = (x: Set<string>, y: Set<string>) => [...x].filter((v) => y.has(v)).length / Math.max(1, new Set([...x, ...y]).size);
interface L { id: string; layout: string; enter: string; exit: string; hold: string }
function planOf(style: (typeof FREE_STYLES)[number], song: unknown, meaning: never, seed: number) {
  const { plan } = freeJob(song as never, { style, seed, meaning });
  const lines: L[] = plan.shots.flatMap((s) => (s.lines as Record<string, any>[]).map((l) => ({ id: l['cue'], layout: l['world']?.set ?? s.lyric.template, enter: l['world']?.enter ?? l['enter'], exit: l['world']?.exit ?? l['exit'], hold: l['world']?.hold ?? l['idle'] })));
  return { lines, grounds: new Set(plan.shots.flatMap((s) => s.cuts.map((c) => c.fx as string))) };
}
type P = ReturnType<typeof planOf>;
const sameShare = (x: P, y: P, k: keyof L) => { const m = new Map(y.lines.map((l) => [l.id, l[k]])); return x.lines.filter((l) => m.get(l.id) === l[k]).length / Math.max(1, x.lines.length); };
const fourTvd = (x: P, y: P) => (['layout', 'enter', 'exit', 'hold'] as const).reduce((s, k) => s + tvd(count(x.lines.map((l) => l[k])), count(y.lines.map((l) => l[k]))), 0) / 4;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function level2() {
  const seeds = a.seeds!.split(',').map(Number);
  const plans = new Map<string, P>();
  for (const [name, id] of Object.entries(SONGS)) {
    const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    for (const s of FREE_STYLES) for (const seed of seeds) plans.set(`${s.id}|${name}|${seed}`, planOf(s, song, meaning as never, seed));
  }
  const pairs: Record<string, Record<string, number>> = {};
  FREE_STYLES.forEach((x, i) => FREE_STYLES.slice(i + 1).forEach((y) => {
    const rows = Object.keys(SONGS).flatMap((n) => seeds.map((sd) => [plans.get(`${x.id}|${n}|${sd}`)!, plans.get(`${y.id}|${n}|${sd}`)!]));
    const m = (f: (p: P, q: P) => number) => +mean(rows.map(([p, q]) => f(p, q))).toFixed(3);
    pairs[`${x.id}/${y.id}`] = { sameLayout: m((p, q) => sameShare(p, q, 'layout')), sameEnter: m((p, q) => sameShare(p, q, 'enter')), sameExit: m((p, q) => sameShare(p, q, 'exit')), sameHold: m((p, q) => sameShare(p, q, 'hold')), tvdLayout: m((p, q) => tvd(count(p.lines.map((l) => l.layout)), count(q.lines.map((l) => l.layout)))), tvdEnter: m((p, q) => tvd(count(p.lines.map((l) => l.enter)), count(q.lines.map((l) => l.enter)))), groundJaccard: m((p, q) => jaccard(p.grounds, q.grounds)), acrossTvd: m(fourTvd) };
  }));
  // what a reroll changes inside a style, the same four distributions
  // two shots in a row must not look alike: the share of neighbouring lines on one set
  const repeats: Record<string, number> = {};
  for (const s of FREE_STYLES) { const v: number[] = []; for (const [key, p] of plans) if (key.startsWith(`${s.id}|`)) v.push(p.lines.slice(1).filter((l, i) => l.layout === p.lines[i].layout).length / Math.max(1, p.lines.length - 1)); repeats[s.id] = +mean(v).toFixed(3); }
  const within: Record<string, number> = {};
  for (const s of FREE_STYLES) {
    const v: number[] = [];
    for (const n of Object.keys(SONGS)) for (let i = 0; i < seeds.length; i++) for (let j = i + 1; j < seeds.length; j++) v.push(fourTvd(plans.get(`${s.id}|${n}|${seeds[i]}`)!, plans.get(`${s.id}|${n}|${seeds[j]}`)!));
    within[s.id] = +mean(v).toFixed(3);
  }
  const fails: string[] = [];
  const rows = Object.entries(pairs);
  const check = (id: string, p: Record<string, number>) => {
    const [x, y] = id.split('/');
    const r = p['acrossTvd'] / Math.max(0.001, (within[x] + within[y]) / 2);
    p['ratio'] = +r.toFixed(2);
    const bad = [p['sameLayout'] > LEVEL2.sameLayout && 'sameLayout', p['sameEnter'] > LEVEL2.sameEnter && 'sameEnter', p['sameExit'] > LEVEL2.sameExit && 'sameExit', p['sameHold'] > LEVEL2.sameHold && 'sameHold', p['tvdLayout'] < LEVEL2.tvdLayout && 'tvdLayout', p['tvdEnter'] < LEVEL2.tvdEnter && 'tvdEnter', p['groundJaccard'] > LEVEL2.groundJaccard && 'groundJaccard', r < LEVEL2.ratio && 'ratio'].filter(Boolean);
    if (bad.length) fails.push(`${id}: ${bad.join(' ')}`);
  };
  rows.forEach(([id, p]) => check(id, p));
  const stat = (k: string) => { const v = rows.map(([, p]) => p[k]); return { mean: +mean(v).toFixed(3), min: Math.min(...v), max: Math.max(...v) }; };
  const summary = Object.fromEntries(['sameLayout', 'sameEnter', 'sameExit', 'sameHold', 'tvdLayout', 'tvdEnter', 'groundJaccard', 'ratio'].map((k) => [k, stat(k)]));
  return { summary, within, repeats, fails, pairs };
}

mkdirSync(a.out!, { recursive: true });
const l1 = level1();
const l2 = level2();
writeFileSync(join(a.out!, 'level1.json'), JSON.stringify(l1, null, 1));
writeFileSync(join(a.out!, 'level2.json'), JSON.stringify(l2, null, 1));
console.log('level 1 fails', l1.fails.length, l1.fails.slice(0, 12));
console.log('level 2', JSON.stringify(l2.summary));
console.log('neighbouring lines on one set', JSON.stringify(l2.repeats));
console.log('level 2 fails', l2.fails.length, 'of', Object.keys(l2.pairs).length, l2.fails.slice(0, 14));
process.exitCode = l1.fails.length || l2.fails.length ? 1 : 0;
