// The owner's before/after clips of Q1 (phase 2: docs/research/2026-11-09-q1-phase2.md; phase 3a: -q1-phase3a.md): for
// each clip, the treatment before the scheduler (freeJob worldEvents:false, today's product) and after it
// (worldEvents:true, the opt-in), and the numbers the clips' 說明.md quotes, each under its side. The video puts before
// on the left and after on the right (`sides`). $0: stored meanings only, no render here (render.mts takes the treatments).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q1-clips.mts --out out/research/q1-1109/clips.json [--treatments dir] [--phase 2|3a]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts } from '../../src/app/lyric-vj/world-events';
import { currentEvents } from '../../src/app/lyric-vj/world-events-adapter';
import { isPageSeat } from '../../src/app/lyric-vj/world-shared';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', taimei: 'yt_ZQ8mn5fS5_M' };
const SETS: Record<string, (readonly [string, string, number, number, 'joint'?])[]> = {
  '2': [['chalkboard', 'snow', 60, 120], ['blueprint', 'snow', 60, 120], ['notebook', 'nun', 70, 130]],
  // (the three worlds that gained same-page seats; notebook and blueprint on phase 2's windows, art-deco where its secondary block is used)
  '3a': [['notebook', 'nun', 70, 130], ['art-deco', 'snow', 90, 150], ['blueprint', 'snow', 60, 120]],
  // (phase 3b: where each world's own move falls. chalkboard's erase needs a breath after a line (nun's one before 114.3);
  // the receipt's feeds and tears on nun; art-deco's poster-panel needs a spaced line on a marquee: 我愛台妹, no stored
  // meaning, the free path's own fallback reading, the same on both sides)
  '3b': [['chalkboard', 'nun', 70, 130], ['document', 'nun', 50, 110], ['art-deco', 'taimei', 10, 70]],
  // (phase 4b: the two of the five new worlds whose numbers moved most, each over its measured window: riso's fast count
  // up, silk's calm count down)
  '4b': [['riso', 'nun', 70, 130], ['silk', 'snow', 60, 120]],
  // (phase 4c: the joint contract against the scheduler as it was, where the lines' outcomes changed most: case files on
  // the fast song (20 of 21 lines drawn otherwise), the pictogram cards on the calm one (16 of 17), both set in Huninn)
  '4c': [['file', 'nun', 70, 130], ['card', 'snow', 60, 120]],
  // (phase 4d: the two worlds declared in this step on the calm song's measured window, set in Huninn. midcentury against the
  // scheduler on (the phase-4b contract); popart's scheduler-on treatment is the product's own byte for byte (holds-first
  // pins every popart line), so its right side is the joint experiment, the one path where its seats act)
  '4d': [['popart', 'snow', 60, 120, 'joint'], ['midcentury', 'snow', 60, 120]],
};
const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q1-1109/clips.json' }, treatments: { type: 'string' }, phase: { type: 'string', default: '3a' } } });
const CLIPS = SETS[a.phase!];
// (4c compares the scheduler on, joint off, with the joint contract, both on the clip's own font)
const joint = a.phase === '4c';
const font = joint || a.phase === '4d' ? 'Huninn' : undefined;
type Cue = { cueId: string; world?: { set?: string; repose?: unknown[] } };
const hb0 = (x?: Cue) => !!(x?.world as { beat?: unknown } | undefined)?.beat;
const out: Record<string, unknown> = { commit: execSync('git rev-parse --short HEAD').toString().trim(), phase: a.phase, sides: joint ? { left: 'before: freeJob worldEvents:true (scheduler on, phase 4b contract: a hold pins its line)', right: 'after: freeJob worldEvents:true jointHolds:true (Q1/Q2 arbitrated together, one primary action a line)', font } : { left: 'before: freeJob worldEvents:false (scheduler off, today\'s product)', right: a.phase === '4d' ? 'after: freeJob worldEvents:true, jointHolds where the clip says (its `right`)' : 'after: freeJob worldEvents:true (scheduler on)', ...(font ? { font } : {}) }, note: 'counts are plan level, after.drawn = the after job read back; inLine lists the after side\'s switches inside a line (pageSeat: to a same-page seat)' };
for (const [id, name, from, to, mode] of CLIPS) {
  const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
  const meaning = existsSync(`out/research/instant/plans/${name}/meaning.json`) ? JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8')) : undefined;
  const style = OFFERED_STYLES.find((s) => s.id === id)!;
  const before = freeJob(song, { style, seed: 0, meaning, worldEvents: joint, ...(font ? { font } : {}) });
  const after = freeJob(song, { style, seed: 0, meaning, worldEvents: true, ...(joint || mode === 'joint' ? { jointHolds: true } : {}), ...(font ? { font } : {}) });
  // (the scheduler on, joint off, the same font: whether it draws anything other than the product, by treatment)
  // (the plan's list of a line's legal seats, `world.seats`, is no drawing: left out)
  const drawnCues = (f: typeof before) => JSON.stringify(f.job.treatment.cues, (k, v) => (k === 'seats' ? undefined : v));
  const wiredSame = drawnCues(freeJob(song, { style, seed: 0, meaning, worldEvents: true, ...(font ? { font } : {}) })) === drawnCues(before);
  const win: [number, number] = [from, to];
  const b = countCuts(currentEvents(before, song, style.world), win);
  const p = countCuts(after.treatment.worldEvents!.events, win);
  const d = countCuts(currentEvents(after, song, style.world), win);
  const inClip = (c: Cue) => { const s = song.cues.find((x: { id: string }) => x.id === c.cueId); return s.start >= from && s.start < to; };
  const lines = (after.treatment.cues as Cue[]).filter(inClip);
  const old = (cue: string) => (before.treatment.cues as Cue[]).find((x) => x.cueId === cue);
  const ev = after.treatment.worldEvents!.events.filter((e) => e.at > from && e.at < to);
  out[id] = {
    song: name, window: win, lines: lines.length, right: mode === 'joint' || joint ? 'scheduler on, joint' : 'scheduler on', wiredCuesSameAsOff: wiredSame,
    before: { cuts: b.cuts, per10: b.planCutsPer10, byKind: b.byKind },
    after: { plan: { cuts: p.cuts, per10: p.planCutsPer10, byKind: p.byKind }, drawn: { cuts: d.cuts, per10: d.planCutsPer10 }, keeps: ev.filter((e) => e.kind === 'keep').length, materials: ev.filter((e) => e.material).map((e) => ({ material: e.material, at: e.at, from: e.from, to: e.to, lines: e.lineIds, seat: e.seatAfter })), camDrops: (after.treatment.worldEvents!.camDrops ?? []).filter((c) => c.at > from && c.at < to), inLine: ev.filter((e) => e.scope === 'in-line' && e.kind !== 'keep').map((e) => ({ at: e.at, line: e.lineIds[0], from: e.seatBefore, to: e.seatAfter, pageSeat: isPageSeat(e.seatAfter) || isPageSeat(e.seatBefore), reason: e.reason })), contract: after.treatment.worldEvents!.warnings.filter((w) => w.reason.startsWith('final check')).length },
    changed: { set: lines.filter((c) => old(c.cueId)?.world?.set !== c.world?.set).map((c) => c.cueId), repose: lines.filter((c) => JSON.stringify(old(c.cueId)?.world?.repose ?? []) !== JSON.stringify(c.world?.repose ?? [])).map((c) => c.cueId) },
    // (4c: each line in the clip, both sides: its text and times (clip time = song time − from), what it draws, and on the
    // right the outcome the joint plan committed and why)
    ...(joint || a.phase === '4d' ? { lines: lines.map((c) => {
      const s = song.cues.find((x: { id: string }) => x.id === c.cueId);
      const o = after.treatment.worldEvents!.outcomes?.find((x) => x.lineId === c.cueId);
      const sw = (f: typeof after) => (f.treatment.worldEvents?.events ?? currentEvents(f, song, style.world)).filter((e) => e.kind !== 'keep' && e.lineIds.at(-1) === c.cueId).map((e) => ({ kind: e.kind, scope: e.scope, at: e.at, clip: +(e.at - from).toFixed(2), to: e.seatAfter }));
      const hb = (x?: Cue) => ((x?.world as { beat?: { kind: string; at: number } } | undefined)?.beat);
      return { cue: c.cueId, text: s.text, start: s.start, clip: +(s.start - from).toFixed(2), before: { set: old(c.cueId)?.world?.set, hold: hb(old(c.cueId))?.kind, switches: sw(before) }, after: { set: c.world?.set, hold: hb(c)?.kind, switches: sw(after), outcome: o?.outcome, reason: o?.reason } };
    }), outcomes: lines.reduce<Record<string, number>>((m, c) => { const o = after.treatment.worldEvents!.outcomes?.find((x) => x.lineId === c.cueId); const k = o ? `${o.outcome}${o.reason ? `/${o.reason}` : ''}` : 'none'; return { ...m, [k]: (m[k] ?? 0) + 1 }; }, {}),
      holds: { before: lines.filter((c) => hb0(old(c.cueId))).length, after: lines.filter((c) => hb0(c)).length } } : {}),
  };
  if (a.treatments) for (const [side, f] of [['before', before], ['after', after]] as const) {
    mkdirSync(join(a.treatments, `${id}-${name}-${side}`), { recursive: true });
    writeFileSync(join(a.treatments, `${id}-${name}-${side}`, 'treatment.json'), JSON.stringify(f.treatment));
  }
}
writeFileSync(a.out!, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (k === 'inLine' ? v.length : v)));
