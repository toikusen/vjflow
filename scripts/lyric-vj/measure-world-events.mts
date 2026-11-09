// Composition cuts per 10 s on the two fixed clips (雙截棍 76–101, 三年後的大雪 67–92), seed 0, every offered world
// (Q1, docs/research/2026-11-09-q1-phase2.md). Per world and clip:
//   before — the cuts the job drew before the scheduler was wired (freeJob worldEvents:false), counted on the job as the
//            renderer sets it (world-events-adapter.ts currentEvents: real show times, line-shows.ts);
//   dryRun — the phase-1 dry run (derived caps, planWorldEvents on the before job): reference only;
//   wired  — the event table the wired job carries (treatment.worldEvents), plan level, and the same job read back as
//            drawn (`drawn`, the plan's cuts the job really lays: a cut planned but not laid is `unlaid`);
//   frames — with --frames: every wired cut looked at in the render page (the reading gate's page, frame-page.mts): two
//            stable frames in reading time (frame-change.mts stableTimes), read for the words' move, their type scale
//            and scale relation, their direction, the edges of what they stand on and their place on their carrier
//            (frame-change.mts, calibrated on out/research/q1-1109/calib); a switch with none of these is `unrealized`.
//            verifiedCompositionCutsPer10 = (plan cuts − unrealized + hold-level beats seen) per 10 s; also without
//            detections only the carrier ring (outline) made, and without proportional-time boundaries (unreliableBoundary).
// A world the scheduler takes over whose final draw does not match its plan (verifyWorldEvents, lightGapWarnings: the
// table's "final check" warnings) fails the run: listed under `contract` and a non-zero exit.
// Plan counts (planCutsPer10) are the plan's own: they are not "verified" until --frames looked at them.
// Groups (phase 4, frozen 2026-11-10, docs/research/2026-11-10-phase4-codex.md §1): the original five single-page worlds,
// the eight phase-4 worlds (riso, silk, file, pictogram = card, spy, popart, midcentury, screentone), the thirteen together
// (the phase-4 target: fast 4.0, calm 4.8 a 10 s, plan median without the given switches at proportional-time
// boundaries, `medianWiredPlanExclUnreliable`) and all 45; reported apart, never one for another. The frame-verified
// columns stay provisional (the frame check is not calibrated on owner labels). --seeds 0,1,2: seed 0 is the headline,
// the other seeds stability columns (plan counts only; --frames looks at seed 0).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts [--world chalkboard] [--seeds 0,1,2] [--frames] [--out out/research/q1-1109/wired.json]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts, planWorldEvents, type WorldEvent } from '../../src/app/lyric-vj/world-events';
import { capsOf, currentEvents, fromJob, ONE_PAGE_WORLDS } from '../../src/app/lyric-vj/world-events-adapter';
import { frameChange, GRID, judge, SEEN, stableTimes, type FrameChange } from './frame-change.mts';
import { framePage } from './frame-page.mts';
import { GROUPS, HEADLINE, THIRTEEN, TARGET_13 } from './phase4-groups.mts';

const WINDOWS = [
  { name: 'fast', song: 'nun', db: 'yt_w_fCuUR3lEs', window: [76, 101] as [number, number] },
  { name: 'calm', song: 'snow', db: 'yt_5i50aTB7JFo', window: [67, 92] as [number, number] },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, seeds: { type: 'string' }, out: { type: 'string' }, frames: { type: 'boolean', default: false } } });
const seeds = (a.seeds ?? a.seed!).split(',').map(Number);
const seed = seeds[0];
const styles = OFFERED_STYLES.filter((s) => !a.world || a.world.split(',').includes(s.id));
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const per10 = (n: number, w: [number, number]) => +((n * 10) / (w[1] - w[0])).toFixed(2);
const inWin = (e: WorldEvent, w: [number, number]) => e.kind !== 'keep' && e.at > w[0] + 1 / 30 && e.at < w[1];

/** The frame check (frame-change.mts): every planned cut's two stable frames, read for move, scale, direction and ground. */
async function framesOf() {
  const page = await framePage('.q1-frames-work');
  const check = async (key: string, job: unknown, events: WorldEvent[]) => {
    const p = await page.job(key, job);
    const cues = await p.cues();
    const out: { at: number; kind: string; scope: string; lineIds: string[]; material?: string; holdLevel?: boolean; unreliableBoundary?: boolean; outlineOnly?: boolean; realized: boolean; why: string; t?: [number, number]; m?: Omit<FrameChange, 'seen' | 'why'> }[] = [];
    for (const e of events) {
      const t = stableTimes(e, cues);
      if (!t) { out.push({ at: e.at, kind: e.kind, scope: e.scope, lineIds: e.lineIds, realized: false, why: 'no reading time either side' }); continue; }
      const [x, y] = [await p.layers(t.before, GRID.w, GRID.h), await p.layers(t.after, GRID.w, GRID.h)];
      const { seen, why, ...m } = frameChange(x, y, e.scope === 'in-line');
      // (seen only by the carrier ring, not yet validated on a hold-out or owner-labelled set: reported apart)
      const outlineOnly = seen && !judge(m, { ...SEEN, outline: Infinity }).seen;
      out.push({ at: e.at, kind: e.kind, scope: e.scope, lineIds: e.lineIds, ...(e.material ? { material: e.material } : {}), ...(e.holdLevel ? { holdLevel: true } : {}), ...(e.unreliableBoundary ? { unreliableBoundary: true } : {}), realized: seen, outlineOnly, why, t: [t.before, t.after], m });
    }
    await p.close();
    return out;
  };
  return { check, close: page.close };
}

const frames = a.frames ? await framesOf() : undefined;
const rows = [];
for (const seed of seeds) for (const w of WINDOWS) {
  const song = JSON.parse(readFileSync(`out/db/${w.db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${w.song}/meaning.json`, 'utf8'));
  for (const style of styles) {
    const legacy = freeJob(song, { style, seed, meaning, worldEvents: false });
    // (the scheduler is opt-in: the measurement takes the declared worlds over)
    const wired = freeJob(song, { style, seed, meaning, worldEvents: true });
    const before = countCuts(currentEvents(legacy, song, style.world), w.window);
    const dry = planWorldEvents(fromJob(legacy.job, song, style.world, { seed, derived: true }));
    const dryRun = countCuts(dry.events, w.window);
    const table = wired.treatment.worldEvents!;
    const plan = countCuts(table.events, w.window);
    const drawnEvents = currentEvents(wired, song, style.world);
    const drawn = countCuts(drawnEvents, w.window);
    // (a switch the job lays on the same line within 0.3 s is the same switch: a camera's start and its line's show)
    const unlaid = plan.at.filter((t) => { const e = table.events.find((x) => x.kind !== 'keep' && Math.abs(x.at - t) < 0.05)!; return !drawnEvents.some((x) => Math.abs(x.at - t) < 0.3 && x.lineIds.at(-1) === e.lineIds.at(-1)); });
    // (the plan's cuts as countCuts counts them; hold-level beats, the receipt's feed, apart: a cut only where seen)
    const dedupe = (es: WorldEvent[]) => [...new Map(es.map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at).filter((e, i, xs) => i === 0 || e.at - xs[i - 1].at >= 0.05);
    const cutEvents = dedupe(table.events.filter((e) => inWin(e, w.window) && !e.holdLevel));
    const holdEvents = dedupe(table.events.filter((e) => inWin(e, w.window) && e.holdLevel));
    const reliable = cutEvents.filter((e) => !e.unreliableBoundary).length;
    const warnings = table.warnings.filter((x) => x.inputs.some((i) => { const m = /@([\d.]+)/.exec(i); return !m || (Number(m[1]) > w.window[0] - 1 && Number(m[1]) < w.window[1] + 1); }));
    const row: Record<string, unknown> = {
      world: style.id, window: w.name, song: w.song, range: w.window, seed, onePage: ONE_PAGE_WORLDS.includes(style.id), caps: { kinds: capsOf(style.world).kinds, source: table.source },
      before: { cuts: before.cuts, planCutsPer10: before.planCutsPer10, byKind: before.byKind },
      dryRun: { cuts: dryRun.cuts, planCutsPer10: dryRun.planCutsPer10 },
      wired: { cuts: plan.cuts, planCutsPer10: plan.planCutsPer10, planSeatChangesPer10: plan.planSeatChangesPer10, byKind: plan.byKind, drawnCutsPer10: drawn.planCutsPer10, unlaid, warnings: warnings.length, warningKinds: [...new Set(warnings.map((x) => x.reason.split(':')[0]))],
        // (phase 3b: the world's own material moves among the cuts, the camera moves a scheduled world dropped, and the
        // given switches whose time is the composer's proportional guess, not a sung word)
        materials: cutEvents.reduce<Record<string, number>>((m, e) => (e.material ? { ...m, [e.material]: (m[e.material] ?? 0) + 1 } : m), {}),
        camDrops: (table.camDrops ?? []).filter((c) => c.at > w.window[0] - 1 && c.at < w.window[1] + 1).length,
        unreliableBoundary: cutEvents.filter((e) => e.unreliableBoundary).length, planExclUnreliablePer10: per10(reliable, w.window), holdLevel: holdEvents.length,
        // (phase 4a: composite events, an ink-only hold merged with a material move, in the window and over the song)
        absorbed: cutEvents.filter((e) => e.absorbed).length, absorbedSong: table.events.filter((e) => e.absorbed).length },
      // (the whole song's final checks, a world the scheduler took over: any is a broken landing contract)
      contract: table.source === 'declared' ? table.warnings.filter((x) => x.reason.startsWith('final check')).map((x) => `${x.inputs.join(' / ')}: ${x.reason}`) : [],
    };
    if (frames && seed === seeds[0]) {
      const seen = await frames.check(`${style.id}-${w.song}`, wired.job, [...cutEvents, ...holdEvents]);
      const cutsSeen = seen.filter((x) => !x.holdLevel);
      const un = cutsSeen.filter((x) => !x.realized);
      const holdsSeen = seen.filter((x) => x.holdLevel && x.realized);
      const outlineOnly = cutsSeen.filter((x) => x.outlineOnly).length;
      const verified = plan.cuts - un.length + holdsSeen.length;
      Object.assign(row['wired'] as object, {
        unrealized: un.length, holdLevelSeen: holdsSeen.length, outlineOnly,
        verifiedCompositionCutsPer10: per10(verified, w.window),
        verifiedExclOutlinePer10: per10(verified - outlineOnly - holdsSeen.filter((x) => x.outlineOnly).length, w.window),
        verifiedExclUnreliablePer10: per10(verified - cutsSeen.filter((x) => x.realized && x.unreliableBoundary).length, w.window),
        frames: seen,
      });
      console.error(style.id, w.name, 'plan', plan.cuts, 'unrealized', un.length);
    }
    rows.push(row);
  }
}
await frames?.close();

type Row = Record<string, any>;
const all = rows as Row[];
const head = all.filter((r) => r['seed'] === seed);
const of = (name: string, f: (r: Row) => number, only?: boolean) => median(head.filter((r) => r['window'] === name && (!only || r['onePage'])).map(f));
/** One group's medians for one seed and window (plan, drawn, without proportional-time boundaries; verified provisional). */
const groupOf = (ids: readonly string[] | undefined, s: number, name: string) => {
  const rs = all.filter((r) => r['seed'] === s && r['window'] === name && (!ids || ids.includes(r['world'])));
  const m = (f: (r: Row) => number) => median(rs.map(f));
  return { worlds: rs.length, medianWiredPlanExclUnreliable: m((r) => r['wired'].planExclUnreliablePer10), medianWiredPlan: m((r) => r['wired'].planCutsPer10), medianWiredDrawn: m((r) => r['wired'].drawnCutsPer10), medianBefore: m((r) => r['before'].planCutsPer10),
    ...(rs.some((r) => r['wired'].verifiedCompositionCutsPer10 !== undefined) ? { provisional: { medianVerified: m((r) => r['wired'].verifiedCompositionCutsPer10), medianVerifiedExclOutline: m((r) => r['wired'].verifiedExclOutlinePer10), medianVerifiedExclUnreliable: m((r) => r['wired'].verifiedExclUnreliablePer10), note: 'frame check not calibrated on owner labels' } } : {}) };
};
const groups = Object.fromEntries((['five', 'eight', 'thirteen', 'all45'] as const).map((g) => {
  const ids = g === 'five' ? GROUPS.five : g === 'eight' ? GROUPS.eight : g === 'thirteen' ? THIRTEEN : undefined;
  const bySeed = Object.fromEntries(seeds.map((s) => [s, Object.fromEntries(WINDOWS.map((w) => [w.name, groupOf(ids, s, w.name)]))]));
  const headline = Object.fromEntries(WINDOWS.map((w) => [w.name, bySeed[seed][w.name].medianWiredPlanExclUnreliable]));
  return [g, { worlds: ids ?? 'all offered', headline: { metric: HEADLINE, seed, ...headline }, ...(g === 'thirteen' ? { target: TARGET_13, meets: Object.fromEntries(WINDOWS.map((w) => [w.name, headline[w.name] >= TARGET_13[w.name as 'fast' | 'calm']])) } : {}), stability: Object.fromEntries(WINDOWS.map((w) => [w.name, seeds.map((s) => bySeed[s][w.name].medianWiredPlanExclUnreliable)])), bySeed }];
}));
const summary = Object.fromEntries(WINDOWS.map((w) => [w.name, {
  worlds: head.filter((r) => r['window'] === w.name).length,
  medianBefore: of(w.name, (r) => r['before'].planCutsPer10),
  medianDryRun: of(w.name, (r) => r['dryRun'].planCutsPer10),
  medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10),
  medianWiredDrawn: of(w.name, (r) => r['wired'].drawnCutsPer10),
  medianWiredPlanExclUnreliable: of(w.name, (r) => r['wired'].planExclUnreliablePer10),
  ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10), medianVerifiedExclOutline: of(w.name, (r) => r['wired'].verifiedExclOutlinePer10), medianVerifiedExclUnreliable: of(w.name, (r) => r['wired'].verifiedExclUnreliablePer10), unrealized: head.filter((r) => r['window'] === w.name).reduce((s, r) => s + r['wired'].unrealized, 0), outlineOnly: head.filter((r) => r['window'] === w.name).reduce((s, r) => s + r['wired'].outlineOnly, 0) } : {}),
  unreliableBoundary: head.filter((r) => r['window'] === w.name).reduce((s, r) => s + r['wired'].unreliableBoundary, 0),
  unreliableWorlds: head.filter((r) => r['window'] === w.name && r['wired'].unreliableBoundary > 0).length,
  onePage: { medianBefore: of(w.name, (r) => r['before'].planCutsPer10, true), medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10, true), medianWiredPlanExclUnreliable: of(w.name, (r) => r['wired'].planExclUnreliablePer10, true), ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10, true), medianVerifiedExclOutline: of(w.name, (r) => r['wired'].verifiedExclOutlinePer10, true) } : {}) },
}]));
const contract = all.flatMap((r) => [...r['contract'].map((x: string) => `${r['world']} ${r['window']} seed ${r['seed']}: ${x}`), ...r['wired'].unlaid.map((t: number) => `${r['world']} ${r['window']} seed ${r['seed']}: planned cut at ${t} not laid`)]);
// (the material moves the plans approved, and the composites among them: phase 4a absorption)
const materials = all.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r['wired'].materials as Record<string, number>)) m[`${k} seed ${r['seed']}`] = (m[`${k} seed ${r['seed']}`] ?? 0) + v; return m; }, {});
const absorbed = Object.fromEntries(seeds.map((x) => [x, all.filter((r) => r['seed'] === x).reduce((n, r) => n + r['wired'].absorbedSong, 0)]));
const report = { commit: execSync('git rev-parse --short HEAD').toString().trim(), scheduled: true, seeds, groups, materials, absorbed, contract, note: 'plan-level counts (planCutsPer10, hold-level beats never counted) unless --frames: verifiedCompositionCutsPer10 = plan cuts less those the frame check found unrealized, plus hold-level beats it saw; ExclOutline drops detections only the carrier ring saw (not yet validated); ExclUnreliable drops given switches at proportional-time boundaries', date: new Date().toISOString().slice(0, 10), frames: !!frames, summary, rows };
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(summary));
for (const [g, x] of Object.entries(groups)) console.log(g, JSON.stringify(x.headline), JSON.stringify(x.stability), 'meets' in x ? JSON.stringify(x.meets) : '');
if (contract.length) { console.error('CONTRACT', contract.length, contract.slice(0, 10)); process.exitCode = 1; }
for (const r of head) console.log([r['window'], r['world'].padEnd(14), r['onePage'] ? '1p' : '  ', 'before', r['before'].planCutsPer10, 'dry', r['dryRun'].planCutsPer10, 'wired', r['wired'].planCutsPer10, 'drawn', r['wired'].drawnCutsPer10, 'unlaid', r['wired'].unlaid.length, ...(frames ? ['unreal', r['wired'].unrealized, 'verified', r['wired'].verifiedCompositionCutsPer10] : []), 'warn', r['wired'].warnings].join('\t'));
