// The owner's before/after clips of Q1 phase 2 (docs/research/2026-11-09-q1-phase2.md): for each clip, the treatment
// before the scheduler (freeJob worldEvents:false) and after it (worldEvents:true, the opt-in), and the numbers the
// clips' 說明.md quotes, each under its side. $0: stored meanings only, no render here (render.mts takes the treatments).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q1-clips.mts --out out/research/q1-1109/clips.json [--treatments dir]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts } from '../../src/app/lyric-vj/world-events';
import { currentEvents } from '../../src/app/lyric-vj/world-events-adapter';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo' };
const CLIPS = [['chalkboard', 'snow', 60, 120], ['blueprint', 'snow', 60, 120], ['notebook', 'nun', 70, 130]] as const;
const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q1-1109/clips.json' }, treatments: { type: 'string' } } });
type Cue = { cueId: string; world?: { set?: string; repose?: unknown[] } };
const out: Record<string, unknown> = { commit: execSync('git rev-parse --short HEAD').toString().trim(), note: 'before = freeJob worldEvents:false; after = worldEvents:true (opt-in); counts are plan level, after.drawn = the after job read back' };
for (const [id, name, from, to] of CLIPS) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  const style = OFFERED_STYLES.find((s) => s.id === id)!;
  const before = freeJob(song, { style, seed: 0, meaning, worldEvents: false });
  const after = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
  const win: [number, number] = [from, to];
  const b = countCuts(currentEvents(before, song, style.world), win);
  const p = countCuts(after.treatment.worldEvents!.events, win);
  const d = countCuts(currentEvents(after, song, style.world), win);
  const inClip = (c: Cue) => { const s = song.cues.find((x: { id: string }) => x.id === c.cueId); return s.start >= from && s.start < to; };
  const lines = (after.treatment.cues as Cue[]).filter(inClip);
  const old = (cue: string) => (before.treatment.cues as Cue[]).find((x) => x.cueId === cue);
  const ev = after.treatment.worldEvents!.events.filter((e) => e.at > from && e.at < to);
  out[id] = {
    song: name, window: win, lines: lines.length,
    before: { cuts: b.cuts, per10: b.planCutsPer10, byKind: b.byKind },
    after: { plan: { cuts: p.cuts, per10: p.planCutsPer10, byKind: p.byKind }, drawn: { cuts: d.cuts, per10: d.planCutsPer10 }, keeps: ev.filter((e) => e.kind === 'keep').length, inLine: ev.filter((e) => e.scope === 'in-line' && e.kind !== 'keep').map((e) => ({ at: e.at, line: e.lineIds[0], to: e.seatAfter, reason: e.reason })) },
    changed: { set: lines.filter((c) => old(c.cueId)?.world?.set !== c.world?.set).map((c) => c.cueId), repose: lines.filter((c) => JSON.stringify(old(c.cueId)?.world?.repose ?? []) !== JSON.stringify(c.world?.repose ?? [])).map((c) => c.cueId) },
  };
  if (a.treatments) for (const [side, f] of [['before', before], ['after', after]] as const) {
    mkdirSync(join(a.treatments, `${id}-${name}-${side}`), { recursive: true });
    writeFileSync(join(a.treatments, `${id}-${name}-${side}`, 'treatment.json'), JSON.stringify(f.treatment));
  }
}
writeFileSync(a.out!, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (k === 'inLine' ? v.length : v)));
