// Hold moments whose ink does not read on some part of the line (review 2026-11-10: card/pair's second row is on the red
// card; a roll's purple key ran over it at ≈1.2:1). For every world line that takes a key pulse (roll, ink-run,
// light-sweep, beat-punch), a phrase swap or a whole line's settle, the ink that hold draws (the plan root's own
// inkChecks: its key, its settle) is read against every ground each part of the line stands on, by this checkout's
// model (render/hold-room partGrounds: the set's carrier, each row's own carrier `rowOn`, a split small part's ground).
// A hold with any part under 4.5:1 is counted. `--plans <root>` makes the plans with another checkout (the before side).
// 45 worlds x 5 songs, seed 0, scheduler off (today's product) unless --on.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-part-scan.mts [--plans /path/to/checkout] [--on] [--out f.json]
import { readFileSync, writeFileSync } from 'node:fs';
const CODE = process.cwd();
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PLANS = arg('--plans', CODE);
const ON = process.argv.includes('--on');
const OUT = arg('--out', '');
const { freeJob } = await import(`${PLANS}/src/app/lyric-vj/free-plan.ts`);
const { FREE_STYLES } = await import(`${PLANS}/src/app/lyric-vj/free-styles.ts`);
const planInks = await import(`${PLANS}/src/app/lyric-vj/render/hold-room.ts`);
const planSets = (await import(`${PLANS}/src/app/lyric-vj/render/world-sets.ts`)).SET_SPECS;
const { objectInk } = await import(`${PLANS}/src/app/lyric-vj/render/world-objects.ts`);
const { partGrounds, READ_MIN } = await import(`${CODE}/src/app/lyric-vj/render/hold-room.ts`);
const { SET_SPECS } = await import(`${CODE}/src/app/lyric-vj/render/world-sets.ts`);
const { contrast } = await import(`${CODE}/src/app/lyric-vj/contrast.ts`);

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const KEYED = new Set(['roll', 'ink-run', 'light-sweep', 'beat-punch', 'ink-swap']);
const rows: { world: string; song: string; cue: string; set: string; kind: string; ink: string; worst: number; on: string }[] = [];
let holds = 0;
for (const st of FREE_STYLES) for (const name of Object.keys(IDS)) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const { job } = freeJob(song, { style: st, seed: 0, meaning, ...(ON ? { worldEvents: true } : {}) });
  for (const l of job.treatment.cues as any[]) {
    const w = l.world;
    const kind = w?.beat?.kind as string | undefined;
    if (!kind || !w.slots || !(KEYED.has(kind) || kind === 'line-ink-settle')) continue;
    const spec = planSets[w.set];
    if (!spec) continue;
    holds += 1;
    const body = spec.ink ? w.slots[spec.ink] : spec.object ? objectInk(spec.object, w.slots) : w.slots.ink;
    const c = planInks.inkChecks(spec, w.slots, body);
    const ink = kind === 'line-ink-settle' ? c.settle : c.key;
    if (!ink) continue;
    const grounds: string[] = partGrounds(SET_SPECS[w.set] ?? spec, w.slots);
    const worst = Math.min(...grounds.map((g) => contrast(ink, g)));
    if (worst < READ_MIN) rows.push({ world: st.id, song: name, cue: l.cueId, set: w.set, kind, ink, worst: +worst.toFixed(2), on: grounds[grounds.map((g) => contrast(ink, g)).indexOf(worst)] });
  }
}
const byWorld: Record<string, number> = {};
for (const r of rows) byWorld[`${r.world} ${r.set} ${r.kind}`] = (byWorld[`${r.world} ${r.set} ${r.kind}`] ?? 0) + 1;
console.log(JSON.stringify({ plans: PLANS, on: ON, holds, under: rows.length, byWorld }, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify({ plans: PLANS, on: ON, holds, under: rows.length, byWorld, rows }, null, 1));
