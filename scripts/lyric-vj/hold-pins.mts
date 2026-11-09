// Which Q2 holds pin their lines, of what kind, and at which layer the phase-4a absorption (Codex 2026-11-10 §3 (b): an
// ink-only hold merged with a declared same-line material move into one composite event) refuses them. Two sets:
//   artDecoPanels — every art-deco line the composer offers the poster-panel seat (+panels), every song on disk (deduped
//                   as poster-panel-pins.mts), seeds 0-2, the style's face: what pins it (Q2 hold, blown-up word, shared
//                   shot, no word timing), and for a hold its kind and layer (the 193 of 3c's poster-panel-3c-pins.json);
//   worlds        — every held world line of all 45 offered worlds on the same songs and seeds, scheduler opt-in: kind and
//                   layer (a world with no declared capability: `capability off`).
// Layers, in the order the scheduler meets them: capability off; kind keeps pinning (not ink-swap / line-ink-settle);
// no material absorbs it (the world declares none for the kind); no seat keeps the words, their type and the hold's ink on
// every ground; the line too short for a switch inside it at its part's pace (MOOD_PACE inLine); the hold moved off a
// handoff; no reliable word boundary; reading spacing (READ_STABLE either side); not one main action with the hold;
// a global clock (ACTION_GAP, SEAM_GAP, LIGHT_GAP); absorbed (a composite event approved).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/hold-pins.mts [--seeds 0,1,2] [--out out/research/q1-1109/hold-pins-4a.json]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { ABSORBABLE_HOLDS, holdIdOf, type WorldEventInput, type WorldEventPlan } from '../../src/app/lyric-vj/world-events';
import { sungWords } from '../../src/app/lyric-vj/world-events-adapter';
import { compositionsOf } from '../../src/app/lyric-vj/world-shared';

const { values: a } = parseArgs({ options: { seeds: { type: 'string', default: '0,1,2' }, out: { type: 'string', default: 'out/research/q1-1109/hold-pins-4a.json' } } });
const seeds = a.seeds!.split(',').map(Number);
const files = execSync('find -L out/db out/beta/songs out/indigo out/research/song-flow -maxdepth 4 -name song.json 2>/dev/null || true', { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
const seen = new Set<string>();
const songs: { title: string; song: unknown }[] = [];
for (const f of files) {
  const song = JSON.parse(readFileSync(f, 'utf8'));
  if (!song.cues?.length) continue;
  const k = `${song.title}|${song.cues.length}|${song.cues[0].start}`;
  if (seen.has(k)) continue;
  seen.add(k);
  songs.push({ title: song.title, song });
}

/** The layer at which the absorption refuses (or takes) a held line, read off the scheduler's own input, plan and refusals. */
function layerOf(worldId: string, lineId: string, kind: string, input: WorldEventInput | undefined, plan: WorldEventPlan | undefined): string {
  if (!input || !plan || input.caps.source !== 'declared') return 'capability off';
  const id = holdIdOf({ kind, lineId });
  if (plan.events.some((e) => e.absorbed?.holdId === id)) return 'absorbed';
  if (!ABSORBABLE_HOLDS.has(kind)) return 'kind keeps pinning';
  const absorbing = Object.values(compositionsOf(worldId)?.materials ?? {}).some((m) => (m.absorbs ?? []).includes(kind));
  const line = input.lines.find((l) => l.id === lineId);
  if (!absorbing) return 'no material absorbs it';
  if (!line?.inLine?.absorb) return 'no seat keeps words, type and ink';
  const why = plan.rejected.filter((r) => r.candidate.lineId === lineId).map((r) => r.reason);
  if (why.some((r) => /moved off a handoff/.test(r))) return 'hold moved off a handoff';
  const mine = why.filter((r) => r.startsWith(`absorb ${id}`));
  if (!mine.length) return 'line too short for an in-line switch (pace)';
  const r = mine.at(-1)!;
  return /reliable word boundary|no sung word break/.test(r) ? 'no reliable word boundary'
    : /still reading/.test(r) ? 'reading spacing'
    : /not one main action/.test(r) ? 'not one main action with the hold'
    : /overlaps|seam within|light change/.test(r) ? 'global clock'
    : /no declared seat/.test(r) ? 'no seat keeps words, type and ink'
    : /not among the plan/.test(r) ? 'hold folded into a handoff'
    : `other: ${r.slice(0, 80)}`;
}

const bump = (m: Record<string, number>, k: string) => void (m[k] = (m[k] ?? 0) + 1);
const deco = { offered: 0, pins: {} as Record<string, number>, holdPinned: 0, byKind: {} as Record<string, number>, byLayer: {} as Record<string, number>, byKindLayer: {} as Record<string, number> };
const worlds = { held: 0, byKind: {} as Record<string, number>, byLayer: {} as Record<string, number>, byKindLayer: {} as Record<string, number>, perWorld: {} as Record<string, { held: number; byKind: Record<string, number>; byLayer: Record<string, number> }> };
for (const style of OFFERED_STYLES) {
  for (const { song } of songs)
    for (const seed of seeds) {
      let input: WorldEventInput | undefined;
      let plan: WorldEventPlan | undefined;
      let f: ReturnType<typeof freeJob>;
      try { f = freeJob(song as never, { style, seed, worldEvents: true, trace: (i, p) => { input = i; plan = p; } }); } catch { continue; }
      const cues = f.treatment.cues as { cueId: string; shot?: string; world?: { seats?: string[]; beat?: { kind: string }; blow?: unknown } }[];
      for (const c of cues) {
        const w = c.world;
        if (!w?.beat) continue;
        const layer = layerOf(style.id, c.cueId, w.beat.kind, input, plan);
        const row = (worlds.perWorld[style.id] ??= { held: 0, byKind: {}, byLayer: {} });
        worlds.held++;
        row.held++;
        bump(worlds.byKind, w.beat.kind);
        bump(row.byKind, w.beat.kind);
        bump(worlds.byLayer, layer);
        bump(row.byLayer, layer);
        bump(worlds.byKindLayer, `${w.beat.kind} | ${layer}`);
      }
      if (style.id !== 'art-deco') continue;
      for (const c of cues) {
        const w = c.world;
        if (!w?.seats?.some((s) => s.endsWith('+panels'))) continue;
        deco.offered++;
        const cue = f.job.cues.find((x) => x.id === c.cueId)!;
        const pin = w.beat ? 'Q2 hold' : w.blow ? 'blown-up word' : cues.filter((x) => x.shot === c.shot).length > 1 ? 'shared shot' : !sungWords(cue as never) ? 'no word timing' : 'free';
        bump(deco.pins, pin);
        if (!w.beat) continue;
        deco.holdPinned++;
        const layer = layerOf(style.id, c.cueId, w.beat.kind, input, plan);
        bump(deco.byKind, w.beat.kind);
        bump(deco.byLayer, layer);
        bump(deco.byKindLayer, `${w.beat.kind} | ${layer}`);
      }
    }
  console.error(style.id, worlds.perWorld[style.id]?.held ?? 0);
}
const sort = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).sort((x, y) => y[1] - x[1]));
const report = {
  commit: execSync('git rev-parse --short HEAD').toString().trim(), date: new Date().toISOString().slice(0, 10), songs: songs.length, seeds, face: 'style', absorbable: [...ABSORBABLE_HOLDS],
  artDecoPanels: { ...deco, pins: sort(deco.pins), byKind: sort(deco.byKind), byLayer: sort(deco.byLayer), byKindLayer: sort(deco.byKindLayer) },
  worlds: { ...worlds, byKind: sort(worlds.byKind), byLayer: sort(worlds.byLayer), byKindLayer: sort(worlds.byKindLayer), perWorld: Object.fromEntries(Object.entries(worlds.perWorld).map(([k, v]) => [k, { held: v.held, byKind: sort(v.byKind), byLayer: sort(v.byLayer) }])) },
};
mkdirSync(dirname(a.out!), { recursive: true });
writeFileSync(a.out!, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ artDecoPanels: report.artDecoPanels, worlds: { held: worlds.held, byKind: report.worlds.byKind, byLayer: report.worlds.byLayer } }, null, 1));
