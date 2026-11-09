// Plan-level hold events over whole songs, every world, seed 0 (the Q2 tally of gaps-1109/planall-r4.json): share of world
// lines with an event by length bucket, skip reasons and kinds. VJ_WORLD_EVENTS=1 to tally the scheduled five too.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-plan-all.mts > out.json
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const CODE = process.cwd();
const { freeJob } = await import(`${CODE}/src/app/lyric-vj/free-plan.ts`);
const { FREE_STYLES } = await import(`${CODE}/src/app/lyric-vj/free-styles.ts`);
const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const B = (l: number) => (l < 0.6 ? '<0.6' : l < 1.5 ? '0.6-1.5' : l < 3 ? '1.5-3' : '>3');
const tally: Record<string, Record<string, number>> = {};
const pool: Record<string, Record<string, number>> = {};
const skips: Record<string, number> = {};
const kinds: Record<string, number> = {};
const { SET_SPECS } = await import(`${CODE}/src/app/lyric-vj/render/world-sets.ts`);
const { CARRIERS } = await import(`${CODE}/src/app/lyric-vj/render/hold-room.ts`).catch(() => import(`${CODE}/src/app/lyric-vj/render/world-objects.ts`));
let onNonCarrier = 0;
for (const st of FREE_STYLES) for (const name of Object.keys(IDS)) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  let meaning; try { meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8')); } catch {}
  const { treatment: t } = freeJob(song, { style: st, seed: 0, meaning });
  for (const c of t.cues as any[]) {
    const s = song.cues.find((x: any) => x.id === c.cueId); if (!s) continue;
    const b = B(s.end - s.start); tally[b] ??= { lines: 0, ev: 0, world: 0, safe: 0, safeEv: 0, safeInk: 0, safeInkEv: 0 }; tally[b].lines++;
    const w = c.world; if (w) { const ev = w.beat ? 1 : 0; if (w.beatSafe) { tally[b].safe++; tally[b].safeEv += ev; if (w.beatInk) { tally[b].safeInk++; tally[b].safeInkEv += ev; } } for (const r of w.beatWhy ?? []) { pool[b] ??= {}; pool[b][r] = (pool[b][r] ?? 0) + 1; } }
    if (c.world) tally[b].world++;
    if (c.world?.beat) { const at = c.world.beat.at; const k = (c.world.repose ?? []).filter((r: any) => at >= r.at).length; const set = k ? c.world.repose[k - 1].set : c.world.set; if (['carrier-settle', 'panel-open'].includes(c.world.beat.kind) && !CARRIERS.has(SET_SPECS[set]?.object)) onNonCarrier++; tally[b].ev++; kinds[c.world.beat.kind] = (kinds[c.world.beat.kind] ?? 0) + 1; }
    else { const r = c.world ? c.world.beatSkip ?? 'none' : 'not a world line'; skips[`${b} ${r}`] = (skips[`${b} ${r}`] ?? 0) + 1; }
  }
}
console.log(JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), scheduled: process.env['VJ_WORLD_EVENTS'] === '1', worlds: FREE_STYLES.length, onNonCarrier, tally, pool, skips, kinds }, null, 1));
