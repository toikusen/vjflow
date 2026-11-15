// The single-variable art-deco line-grow pair (Codex 2026-11-10 pairs A): 三年後的大雪 90–150 s, seed 0, Huninn, the
// default product's contract (scheduler off: art-deco's compositions are not enabled, so the composer commits its holds
// first and no event table is scheduled), one side as is, the other with freeJob `noLineGrow`. Writes both treatments,
// a plan diff (every per-cue difference, outside the window too) and the blind key (random 甲/乙, never copied to the
// owner folder). $0: stored meaning only, no render here.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/deco-grow-pair.mts --out out/research/deco-grow
import { randomInt } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';

const DB = 'yt_5i50aTB7JFo';
const WINDOW: [number, number] = [90, 150];
const FONT = 'Huninn';
const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/deco-grow' } } });
const song = JSON.parse(readFileSync(`out/db/${DB}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync('out/research/instant/plans/snow/meaning.json', 'utf8'));
const style = OFFERED_STYLES.find((s) => s.id === 'art-deco')!;
const sides = { grow: freeJob(song, { style, seed: 0, meaning, font: FONT }), noGrow: freeJob(song, { style, seed: 0, meaning, font: FONT, noLineGrow: true }) };

type Row = { cueId: string; world?: Record<string, unknown> } & Record<string, unknown>;
const cuesOf = (s: keyof typeof sides) => sides[s].job.treatment.cues as unknown as Row[];
const start = (id: string) => (song.cues as { id: string; start: number }[]).find((c) => c.id === id)?.start ?? NaN;
// every key of every cue entry that differs, with the beat itself spelled out
const diffs: unknown[] = [];
const [g, n] = [cuesOf('grow'), cuesOf('noGrow')];
if (g.length !== n.length) throw new Error(`cue count differs ${g.length} vs ${n.length}`);
g.forEach((x, i) => {
  const y = n[i];
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
  const wkeys = [...new Set([...Object.keys(x.world ?? {}), ...Object.keys(y.world ?? {})])].filter((k) => JSON.stringify(x.world?.[k]) !== JSON.stringify(y.world?.[k]));
  const beat = (r: Row) => (r.world?.['beat'] as { kind?: string; at?: number; sec?: number } | undefined);
  diffs.push({ cueId: x.cueId, start: start(x.cueId), inWindow: start(x.cueId) >= WINDOW[0] && start(x.cueId) < WINDOW[1], keys, worldKeys: wkeys, grow: beat(x) ? { kind: beat(x)!.kind, at: beat(x)!.at, sec: beat(x)!.sec } : (x.world?.['beatSkip'] ?? null), noGrow: beat(y) ? { kind: beat(y)!.kind, at: beat(y)!.at, sec: beat(y)!.sec } : (y.world?.['beatSkip'] ?? null) });
});
// every leaf of the job and of the treatment that differs, by path (cue and hold indices folded): what the knob touched
type J = Record<string, unknown>;
const walk = (x: unknown, y: unknown, p: string, out: string[]) => {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === 'object' && typeof y === 'object') for (const k of new Set([...Object.keys(x as J), ...Object.keys(y as J)])) walk((x as J)[k], (y as J)[k], `${p}.${k}`, out);
  else out.push(p);
};
const leaves: string[] = [];
walk(sides.grow.job, sides.noGrow.job, 'job', leaves);
walk(sides.grow.treatment, sides.noGrow.treatment, 'treatment', leaves);
const paths: Record<string, number> = {};
for (const l of leaves) { const k = l.replace(/\.\d+(?=\.|$)/g, '.N'); paths[k] = (paths[k] ?? 0) + 1; }
const holdsOf = (s: keyof typeof sides) => (sides[s].treatment.worldEvents?.holds ?? []).length;
const warnsGone = (sides.grow.treatment.worldEvents?.warnings ?? []).filter((w) => !(sides.noGrow.treatment.worldEvents?.warnings ?? []).some((v) => JSON.stringify(v) === JSON.stringify(w)));
mkdirSync(a.out!, { recursive: true });
const first = randomInt(2) === 0 ? 'grow' : 'noGrow';
const labels = { 甲: first, 乙: first === 'grow' ? 'noGrow' : 'grow' } as const;
for (const [label, side] of Object.entries(labels)) {
  const dir = join(a.out!, label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'treatment.json'), JSON.stringify(sides[side].treatment));
}
const kinds = (s: keyof typeof sides) => { const m: Record<string, number> = {}; for (const r of cuesOf(s)) { const k = (r.world?.['beat'] as { kind?: string } | undefined)?.kind; const t = start(r.cueId); if (k && t >= WINDOW[0] && t < WINDOW[1]) m[k] = (m[k] ?? 0) + 1; } return m; };
const commit = execSync('git rev-parse --short HEAD').toString().trim();
writeFileSync(join(a.out!, 'key.json'), JSON.stringify({ commit, db: DB, window: WINDOW, seed: 0, font: FONT, contract: 'default product: scheduler off (art-deco compositions.enabled false), composer commits holds', note: 'grow = freeJob as is; noGrow = freeJob noLineGrow:true. Never copied to the owner folder.', labels }, null, 1));
writeFileSync(join(a.out!, 'diff.json'), JSON.stringify({ commit, holds: { grow: holdsOf('grow'), noGrow: holdsOf('noGrow') }, paths, warningsOnlyInGrow: warnsGone, kindsInWindow: { grow: kinds('grow'), noGrow: kinds('noGrow') }, diffs }, null, 1));
console.log('diffs', diffs.length, 'inWindow', diffs.filter((d) => (d as { inWindow: boolean }).inWindow).length, 'holds', holdsOf('grow'), holdsOf('noGrow'), 'paths', JSON.stringify(paths));
