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
//            verifiedCompositionCutsPer10 = (plan cuts − unrealized) per 10 s.
// A world the scheduler takes over whose final draw does not match its plan (verifyWorldEvents, lightGapWarnings: the
// table's "final check" warnings) fails the run: listed under `contract` and a non-zero exit.
// Plan counts (planCutsPer10) are the plan's own: they are not "verified" until --frames looked at them.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts [--world chalkboard] [--frames] [--out out/research/q1-1109/wired.json]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts, planWorldEvents, type WorldEvent } from '../../src/app/lyric-vj/world-events';
import { capsOf, currentEvents, fromJob, ONE_PAGE_WORLDS } from '../../src/app/lyric-vj/world-events-adapter';
import { frameChange, GRID, stableTimes, type FrameChange } from './frame-change.mts';
import { framePage } from './frame-page.mts';

const WINDOWS = [
  { name: 'fast', song: 'nun', db: 'yt_w_fCuUR3lEs', window: [76, 101] as [number, number] },
  { name: 'calm', song: 'snow', db: 'yt_5i50aTB7JFo', window: [67, 92] as [number, number] },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, out: { type: 'string' }, frames: { type: 'boolean', default: false } } });
const seed = Number(a.seed);
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
    const out: { at: number; kind: string; scope: string; lineIds: string[]; realized: boolean; why: string; t?: [number, number]; m?: Omit<FrameChange, 'seen' | 'why'> }[] = [];
    for (const e of events) {
      const t = stableTimes(e, cues);
      if (!t) { out.push({ at: e.at, kind: e.kind, scope: e.scope, lineIds: e.lineIds, realized: false, why: 'no reading time either side' }); continue; }
      const [x, y] = [await p.layers(t.before, GRID.w, GRID.h), await p.layers(t.after, GRID.w, GRID.h)];
      const { seen, why, ...m } = frameChange(x, y, e.scope === 'in-line');
      out.push({ at: e.at, kind: e.kind, scope: e.scope, lineIds: e.lineIds, realized: seen, why, t: [t.before, t.after], m });
    }
    await p.close();
    return out;
  };
  return { check, close: page.close };
}

const frames = a.frames ? await framesOf() : undefined;
const rows = [];
for (const w of WINDOWS) {
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
    const cutEvents = [...new Map(table.events.filter((e) => inWin(e, w.window)).map((e) => [e.id, e])).values()].sort((x, y) => x.at - y.at).filter((e, i, xs) => i === 0 || e.at - xs[i - 1].at >= 0.05);
    const warnings = table.warnings.filter((x) => x.inputs.some((i) => { const m = /@([\d.]+)/.exec(i); return !m || (Number(m[1]) > w.window[0] - 1 && Number(m[1]) < w.window[1] + 1); }));
    const row: Record<string, unknown> = {
      world: style.id, window: w.name, song: w.song, range: w.window, seed, onePage: ONE_PAGE_WORLDS.includes(style.id), caps: { kinds: capsOf(style.world).kinds, source: table.source },
      before: { cuts: before.cuts, planCutsPer10: before.planCutsPer10, byKind: before.byKind },
      dryRun: { cuts: dryRun.cuts, planCutsPer10: dryRun.planCutsPer10 },
      wired: { cuts: plan.cuts, planCutsPer10: plan.planCutsPer10, planSeatChangesPer10: plan.planSeatChangesPer10, byKind: plan.byKind, drawnCutsPer10: drawn.planCutsPer10, unlaid, warnings: warnings.length, warningKinds: [...new Set(warnings.map((x) => x.reason.split(':')[0]))] },
      // (the whole song's final checks, a world the scheduler took over: any is a broken landing contract)
      contract: table.source === 'declared' ? table.warnings.filter((x) => x.reason.startsWith('final check')).map((x) => `${x.inputs.join(' / ')}: ${x.reason}`) : [],
    };
    if (frames) {
      const seen = await frames.check(`${style.id}-${w.song}`, wired.job, cutEvents);
      const un = seen.filter((x) => !x.realized);
      Object.assign(row['wired'] as object, { unrealized: un.length, verifiedCompositionCutsPer10: per10(plan.cuts - un.length, w.window), frames: seen });
      console.error(style.id, w.name, 'plan', plan.cuts, 'unrealized', un.length);
    }
    rows.push(row);
  }
}
await frames?.close();

type Row = Record<string, any>;
const of = (name: string, f: (r: Row) => number, only?: boolean) => median((rows as Row[]).filter((r) => r['window'] === name && (!only || r['onePage'])).map(f));
const summary = Object.fromEntries(WINDOWS.map((w) => [w.name, {
  worlds: (rows as Row[]).filter((r) => r['window'] === w.name).length,
  medianBefore: of(w.name, (r) => r['before'].planCutsPer10),
  medianDryRun: of(w.name, (r) => r['dryRun'].planCutsPer10),
  medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10),
  medianWiredDrawn: of(w.name, (r) => r['wired'].drawnCutsPer10),
  ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10), unrealized: (rows as Row[]).filter((r) => r['window'] === w.name).reduce((s, r) => s + r['wired'].unrealized, 0) } : {}),
  onePage: { medianBefore: of(w.name, (r) => r['before'].planCutsPer10, true), medianWiredPlan: of(w.name, (r) => r['wired'].planCutsPer10, true), ...(frames ? { medianVerified: of(w.name, (r) => r['wired'].verifiedCompositionCutsPer10, true) } : {}) },
}]));
const contract = (rows as Row[]).flatMap((r) => [...r['contract'].map((x: string) => `${r['world']} ${r['window']}: ${x}`), ...r['wired'].unlaid.map((t: number) => `${r['world']} ${r['window']}: planned cut at ${t} not laid`)]);
const report = { commit: execSync('git rev-parse --short HEAD').toString().trim(), scheduled: true, contract, note: 'plan-level counts (planCutsPer10) unless --frames: verifiedCompositionCutsPer10 = plan cuts less those the frame check found unrealized', date: '2026-11-09', frames: !!frames, summary, rows };
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(summary));
if (contract.length) { console.error('CONTRACT', contract.length, contract.slice(0, 10)); process.exitCode = 1; }
for (const r of rows as Row[]) console.log([r['window'], r['world'].padEnd(14), r['onePage'] ? '1p' : '  ', 'before', r['before'].planCutsPer10, 'dry', r['dryRun'].planCutsPer10, 'wired', r['wired'].planCutsPer10, 'drawn', r['wired'].drawnCutsPer10, 'unlaid', r['wired'].unlaid.length, ...(frames ? ['unreal', r['wired'].unrealized, 'verified', r['wired'].verifiedCompositionCutsPer10] : []), 'warn', r['wired'].warnings].join('\t'));
