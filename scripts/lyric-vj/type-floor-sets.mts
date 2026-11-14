// Which world lines changed set between two checkouts' plans (the type floor's composer step, docs/research/2026-11-12-type-floor.md):
// for every offered world × the five songs × seeds, the line's first set before and after, and whether the before set
// could hold the line at the type floor (render/world-sets blockOf on the composer's wide measure, as lineplan-core seatMissed reads it).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/type-floor-sets.mts --before /path/to/checkout [--seeds 0,1,2] [--on] [--out f.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { before: { type: 'string' }, seeds: { type: 'string', default: '0,1,2' }, on: { type: 'boolean', default: false }, out: { type: 'string', default: '' } } });
const load = async (root: string) => ({
  freeJob: (await import(`${root}/src/app/lyric-vj/free-plan.ts`)).freeJob,
  styles: (await import(`${root}/src/app/lyric-vj/free-styles.ts`)).OFFERED_STYLES,
});
// (a relative path is the caller's: resolved against the working directory, not against this script)
const B = await load(resolve(a.before!));
const A = await load(process.cwd());
const { blockOf, SET_SPECS } = await import(`${process.cwd()}/src/app/lyric-vj/render/world-sets.ts`);
const { setWordSafe } = await import(`${process.cwd()}/src/app/lyric-vj/phrases.ts`);
const wide = (x: string) => [...x].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? 60 : 100), 0);
const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
type Line = { cueId: string; world?: { set?: string } };
const byWorld: Record<string, { lines: number; changed: number; missedBefore: number; moves: Record<string, number> }> = {};
for (const [name, id] of Object.entries(IDS)) {
  const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  for (const style of A.styles) for (const seed of a.seeds!.split(',').map(Number)) {
    const o = { seed, meaning, ...(a.on ? { worldEvents: true } : {}) };
    const before = (B.freeJob(song, { ...o, style: B.styles.find((s: { id: string }) => s.id === style.id) }).treatment.cues as Line[]);
    const after = new Map((A.freeJob(song, { ...o, style }).treatment.cues as Line[]).map((c) => [c.cueId, c.world?.set ?? '']));
    const w = (byWorld[style.id] ??= { lines: 0, changed: 0, missedBefore: 0, moves: {} });
    setWordSafe(true);
    for (const c of before) {
      w.lines++;
      const [x, y] = [c.world?.set ?? '', after.get(c.cueId) ?? ''];
      if (x === y) continue;
      w.changed++;
      const text = (song.cues.find((s: { id: string }) => s.id === c.cueId)?.text ?? '').replace(/[\s　]+/g, ' ').trim();
      const b = x && SET_SPECS[x] ? blockOf(text, SET_SPECS[x], wide) : undefined;
      if (b && (b.floorMiss || b.bandMiss)) w.missedBefore++;
      const k = `${x || '(template)'} → ${y || '(template)'}`;
      w.moves[k] = (w.moves[k] ?? 0) + 1;
    }
    setWordSafe(false);
  }
}
const total = Object.values(byWorld).reduce((s, w) => ({ lines: s.lines + w.lines, changed: s.changed + w.changed, missedBefore: s.missedBefore + w.missedBefore }), { lines: 0, changed: 0, missedBefore: 0 });
const out = { on: a.on, seeds: a.seeds, total, byWorld: Object.fromEntries(Object.entries(byWorld).filter(([, w]) => w.changed).map(([k, w]) => [k, { ...w, moves: Object.fromEntries(Object.entries(w.moves).sort((p, q) => q[1] - p[1]).slice(0, 6)) }])) };
if (a.out) writeFileSync(a.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(total));
