// Composition cuts per 10 s, PLAN-LEVEL ONLY (Q1 phase 1, docs/research/2026-11-09-q1-phase1.md): counted from the plan's
// events, no video is rendered or checked, so a planned switch the frame never shows still counts here. Codex D's video
// check (stable frames either side, `unrealized`) is phase 2. Two numbers per world and window:
//   current — the composition events today's free plan makes (world-events-adapter.ts currentEvents): the baseline;
//   dryRun  — planWorldEvents() on the same plan's input, not wired into any render.
// verifiedCompositionCutsPer10: seat / carrier / framing transitions, the window's first frame excluded, deduped;
// readingSeatChangesPer10: those that move where the words are read.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-world-events.mts [--world chalkboard] [--out out/research/q1-1109/baseline.json]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts, planWorldEvents } from '../../src/app/lyric-vj/world-events';
import { capsOf, currentEvents, fromFreeJob, ONE_PAGE_WORLDS } from '../../src/app/lyric-vj/world-events-adapter';

const WINDOWS = [
  { name: 'fast', song: 'nun', db: 'yt_w_fCuUR3lEs', window: [76, 101] as [number, number] },
  { name: 'calm', song: 'snow', db: 'yt_5i50aTB7JFo', window: [67, 92] as [number, number] },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, out: { type: 'string' } } });
const seed = Number(a.seed);
const styles = OFFERED_STYLES.filter((s) => !a.world || s.id === a.world);
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

const rows = WINDOWS.flatMap((w) => {
  const song = JSON.parse(readFileSync(`out/db/${w.db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${w.song}/meaning.json`, 'utf8'));
  return styles.map((style) => {
    const free = freeJob(song, { style, seed, meaning });
    const current = countCuts(currentEvents(free, song, style.world), w.window);
    const plan = planWorldEvents(fromFreeJob(free, song, style.world, { seed }));
    const dryRun = countCuts(plan.events, w.window);
    const rejected = plan.rejected.filter((r) => r.candidate.at > w.window[0] && r.candidate.at < w.window[1]).length;
    // (Q2/Q4 inputs that break the spacing rules themselves: kept as given, listed so the inputs can be fixed)
    const warnings = plan.warnings.filter((x) => x.inputs.some((i) => { const t = Number(i.split('@').at(-1)?.split('–')[0]); return t > w.window[0] - 1 && t < w.window[1] + 1; }));
    const caps = capsOf(style.world);
    return { world: style.id, window: w.name, song: w.song, range: w.window, seed, onePage: ONE_PAGE_WORLDS.includes(style.id), caps: { kinds: caps.kinds, source: caps.source }, current, dryRun: { ...dryRun, rejected, warnings } };
  });
});

const summary = Object.fromEntries(WINDOWS.map((w) => {
  const of = rows.filter((r) => r.window === w.name);
  return [w.name, { worlds: of.length, medianCurrent: median(of.map((r) => r.current.verifiedCompositionCutsPer10)), medianCurrentSeats: median(of.map((r) => r.current.readingSeatChangesPer10)), medianDryRun: median(of.map((r) => r.dryRun.verifiedCompositionCutsPer10)), medianDryRunSeats: median(of.map((r) => r.dryRun.readingSeatChangesPer10)) }];
}));
const report = { note: 'plan-level only; no video check (phase 1)', date: '2026-11-09', summary, rows };
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(summary));
for (const r of rows) console.log([r.window, r.world.padEnd(14), r.onePage ? '1p' : '  ', 'cur', r.current.verifiedCompositionCutsPer10, r.current.readingSeatChangesPer10, 'dry', r.dryRun.verifiedCompositionCutsPer10, r.dryRun.readingSeatChangesPer10, 'rej', r.dryRun.rejected, 'warn', r.dryRun.warnings.length, r.caps.kinds.join(',')].join('\t'));
