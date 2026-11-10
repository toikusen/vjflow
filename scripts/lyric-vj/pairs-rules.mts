// The two pairs rulings of 2026-11-10 (Codex out/research/q1-1109/codex-pairs.md B, C), measured on the four blind-pair
// windows (pairs-4c-key.json): rule B (no in-line layout-seat, at most one visible composition a line) and rule C (a
// motivated ink-swap: its reason, no two sung lines in a row with the same hold kind, at most two ink-swaps a section),
// for holds-first (scheduler on, joint off) and joint, seed 0, Huninn. Plan level and the drawn job read back. $0.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/pairs-rules.mts --out out/research/q1-1109/pairs-rules-<label>.json
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { currentEvents } from '../../src/app/lyric-vj/world-events-adapter';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo' };
const PAIRS: [string, string, number, number][] = [['art-deco', 'snow', 90, 150], ['file', 'nun', 70, 130], ['card', 'snow', 60, 120], ['spy', 'snow', 135, 190]];
const FONT = 'Huninn';
type Ev = { id: string; kind: string; scope: string; lineIds: string[]; at: number };
type Beat = { kind: string; at: number; why?: { kind: string; source: string } };
type Line = { cueId: string; world?: { beat?: Beat; beatRejects?: { kind: string; reason: string }[] } };
const { values: a } = parseArgs({ options: { out: { type: 'string' } } });
const VISIBLE = new Set(['layout-seat', 'carrier-swap', 'page-handoff', 'ground-role']);
const out: Record<string, unknown> = { commit: execSync('git rev-parse --short HEAD').toString().trim(), font: FONT, seed: 0 };
for (const [world, name, from, to] of PAIRS) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const style = OFFERED_STYLES.find((s) => s.id === world)!;
  const sections: { start: number; end: number }[] = song.sections ?? [];
  const sectionOf = (t: number) => sections.findIndex((s) => t >= s.start - 1e-6 && t < s.end);
  const cue = (id: string) => song.cues.find((c: { id: string }) => c.id === id) as { start: number; end: number; text: string };
  const sides: Record<string, unknown> = {};
  for (const side of ['holdsFirst', 'joint'] as const) {
    const r = freeJob(song, { style, seed: 0, meaning, worldEvents: true, font: FONT, ...(side === 'joint' ? { jointHolds: true } : {}) });
    const table = r.treatment.worldEvents!;
    const evs = table.events as Ev[];
    const drawn = currentEvents(r, song, style.world) as Ev[];
    const inWin = (id: string) => { const c = cue(id); return !!c && c.start >= from && c.start < to; };
    const stats = (scope: (id: string) => boolean) => {
      const inLineSeat = (xs: Ev[]) => xs.filter((e) => e.kind === 'layout-seat' && e.scope === 'in-line' && scope(e.lineIds.at(-1)!)).length;
      const perLine = new Map<string, number>();
      for (const e of evs) if (VISIBLE.has(e.kind) && scope(e.lineIds.at(-1)!)) perLine.set(e.lineIds.at(-1)!, (perLine.get(e.lineIds.at(-1)!) ?? 0) + 1);
      const lines = (r.job.treatment.cues as Line[]).filter((c) => cue(c.cueId) && scope(c.cueId)).sort((x, y) => cue(x.cueId).start - cue(y.cueId).start);
      const kinds: Record<string, number> = {};
      for (const l of lines) if (l.world?.beat) kinds[l.world.beat.kind] = (kinds[l.world.beat.kind] ?? 0) + 1;
      // (consecutive sung lines, a line with no hold in between lifting the rule)
      const repeats = lines.slice(1).filter((l, i) => l.world?.beat && lines[i].world?.beat && l.world.beat.kind === lines[i].world!.beat!.kind).map((l) => `${lines[lines.indexOf(l) - 1].cueId}>${l.cueId}:${l.world!.beat!.kind}`);
      const swaps = lines.filter((l) => l.world?.beat?.kind === 'ink-swap');
      const perSection: Record<string, number> = {};
      // (one colour budget a section: a phrase's ink and the whole line's together, pairs C as extended)
      for (const l of lines.filter((x) => ['ink-swap', 'line-ink-settle'].includes(x.world?.beat?.kind ?? ''))) { const k = `${sectionOf(cue(l.cueId).start)}`; perSection[k] = (perSection[k] ?? 0) + 1; }
      const rejects: Record<string, number> = {};
      for (const l of lines) for (const x of l.world?.beatRejects ?? []) { const k = `${x.kind}:${x.reason}`; rejects[k] = (rejects[k] ?? 0) + 1; }
      return {
        lines: lines.length,
        holds: lines.filter((l) => l.world?.beat).length,
        kinds,
        inkSwaps: swaps.length,
        lineInkSettles: lines.filter((l) => l.world?.beat?.kind === 'line-ink-settle').length,
        keeps: lines.filter((l) => !l.world?.beat).length,
        colourWithWhy: lines.filter((l) => ['ink-swap', 'line-ink-settle'].includes(l.world?.beat?.kind ?? '') && l.world!.beat!.why?.source).length,
        inkSwapsWithWhy: swaps.filter((l) => l.world?.beat?.why?.source).length,
        inkSwapWhy: swaps.map((l) => ({ line: l.cueId, text: cue(l.cueId).text, at: l.world!.beat!.at, why: l.world!.beat!.why })),
        maxColourPerSection: Math.max(0, ...Object.values(perSection)),
        colourPerSection: perSection,
        consecutiveSameKind: repeats.length,
        repeats,
        rejects,
        inLineLayoutSeat: { plan: inLineSeat(evs), drawn: inLineSeat(drawn) },
        linesWithTwoCompositions: [...perLine.values()].filter((n) => n > 1).length,
      };
    };
    sides[side] = { window: stats(inWin), song: stats(() => true), contract: table.warnings.filter((w) => w.reason.startsWith('final check')).length };
  }
  out[`${world}/${name}`] = { window: [from, to], ...sides };
}
writeFileSync(a.out!, JSON.stringify(out, null, 1));
console.log(Object.entries(out).filter(([k]) => k.includes('/')).map(([k, v]) => { const s = v as Record<string, { window: Record<string, unknown>; song: Record<string, unknown>; contract: number }>; return `${k} holdsFirst win inkSwaps ${s.holdsFirst.window.inkSwaps} settles ${s.holdsFirst.window.lineInkSettles} keeps ${s.holdsFirst.window.keeps} colourMax ${s.holdsFirst.song.maxColourPerSection} repeats ${s.holdsFirst.window.consecutiveSameKind} inLineSeat ${JSON.stringify(s.holdsFirst.song.inLineLayoutSeat)} two ${s.holdsFirst.song.linesWithTwoCompositions} | joint inLineSeat ${JSON.stringify(s.joint.song.inLineLayoutSeat)} two ${s.joint.song.linesWithTwoCompositions} | contract ${s.holdsFirst.contract}/${s.joint.contract}`; }).join('\n'));
