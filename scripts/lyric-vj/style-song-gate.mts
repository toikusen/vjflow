// Do two songs in one style look too alike? For each world: the same seed across the five songs, against the same song with
// another seed. Layout share, set-piece order, ground sequence, palette. No renderer, no model call.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-song-gate.mts --out out/research/styles/gate/songs.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/styles/gate/songs.json' } } });
const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
/** Calibrated on batch 1: see the progress file. */
export const SONG_GATE = { maxLayoutShare: 0.75, maxSameOpening: 0.34, maxGroundSim: 0.6, minPalettes: 3 };
const names = Object.keys(SONGS);
const load = (n: string) => [JSON.parse(readFileSync(`out/db/${SONGS[n]}/song.json`, 'utf8')), JSON.parse(readFileSync(`out/research/instant/plans/${n}/meaning.json`, 'utf8'))];
const data = new Map(names.map((n) => [n, load(n)]));
const count = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1 / xs.length); return m; };
const sharedShare = (x: string[], y: string[]) => { const [p, q] = [count(x), count(y)]; return [...p.keys()].reduce((s, k) => s + Math.min(p.get(k)!, q.get(k) ?? 0), 0); };
const pairs2 = (x: string[]) => new Set(x.slice(1).map((v, i) => `${x[i]}>${v}`));
const jac = (x: Set<string>, y: Set<string>) => [...x].filter((v) => y.has(v)).length / Math.max(1, new Set([...x, ...y]).size);
const mean = (v: number[]) => +(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)).toFixed(3);
function view(style: (typeof FREE_STYLES)[number], n: string, seed: number) {
  const [song, meaning] = data.get(n)!;
  const { plan, palette, treatment } = freeJob(song, { style, seed, meaning });
  const layouts = plan.shots.flatMap((s) => (s.lines as Record<string, any>[]).map((l) => l['world']?.set ?? s.lyric.template));
  const grounds = plan.shots.flatMap((s) => s.cuts.map((c) => c.fx as string));
  const pieces = plan.shots.flatMap((s) => s.cuts.flatMap((c) => (c['piece'] ? [c['piece'] as string] : [])));
  const inks = new Set((treatment.graphics!.sections as { layers: { paper?: string }[] }[]).map((x) => x.layers[0]?.paper ?? ''));
  return { layouts, grounds, pieces, palette, inks: [...inks].join() };
}
const rows: Record<string, unknown>[] = [];
const fails: string[] = [];
for (const s of FREE_STYLES.filter((x) => x.world.family !== 'print')) {
  const v = names.map((n) => view(s, n, 0));
  const r = names.map((n) => view(s, n, 1));
  const across: { l: number; g: number; o: number }[] = [];
  v.forEach((x, i) => v.slice(i + 1).forEach((y) => across.push({ l: sharedShare(x.layouts, y.layouts), g: jac(pairs2(x.grounds), pairs2(y.grounds)), o: x.pieces.slice(0, 3).join() === y.pieces.slice(0, 3).join() ? 1 : 0 })));
  const reroll = v.map((x, i) => ({ l: sharedShare(x.layouts, r[i].layouts), g: jac(pairs2(x.grounds), pairs2(r[i].grounds)), o: x.pieces.slice(0, 3).join() === r[i].pieces.slice(0, 3).join() ? 1 : 0 }));
  const row = { id: s.id, songsLayoutShare: mean(across.map((x) => x.l)), songsGroundSim: mean(across.map((x) => x.g)), songsSameOpening: mean(across.map((x) => x.o)), palettes: new Set(v.map((x) => x.palette)).size, rerollLayoutShare: mean(reroll.map((x) => x.l)), rerollGroundSim: mean(reroll.map((x) => x.g)), rerollSameOpening: mean(reroll.map((x) => x.o)), piecesFirst: v.map((x) => x.pieces.slice(0, 3).join('>')) };
  rows.push(row);
  if (row.songsLayoutShare > SONG_GATE.maxLayoutShare) fails.push(`${s.id}: songs share layouts ${row.songsLayoutShare}`);
  if (row.songsSameOpening > SONG_GATE.maxSameOpening) fails.push(`${s.id}: songs open on the same set pieces ${row.songsSameOpening}`);
  if (row.songsGroundSim > SONG_GATE.maxGroundSim) fails.push(`${s.id}: ground sequence ${row.songsGroundSim}`);
  if (row.palettes < SONG_GATE.minPalettes) fails.push(`${s.id}: only ${row.palettes} palettes across five songs`);
}
mkdirSync(dirname(a.out!), { recursive: true });
writeFileSync(a.out!, JSON.stringify({ gate: SONG_GATE, rows, fails }, null, 1));
for (const r of rows) console.log(JSON.stringify({ ...r, piecesFirst: undefined }));
console.log('song gate fails', fails.length, fails.slice(0, 10));
process.exitCode = fails.length ? 1 : 0;
