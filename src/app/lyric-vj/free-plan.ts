// The free tier's whole plan in the browser: composer plan, treatment and render job from a song, no server and no
// model call. It is the path `lineplan.mts` + `typeplan.mts --plan` + `render.mts` take offline, kept to what a composer
// plan can hold (no sprites, backdrops, boards or documents); scripts/lyric-vj/free-plan.check.mts proves it gives the
// same treatment as those scripts on the five test songs.
import { TITLE_OPENING_SEC } from './render/world-title';
import { FreeStyle, STYLE_PALETTES, styleFont } from './free-styles';
import { composePlan, composerBase, Cue, fallbackParts, Meaning, PALETTES, RECIPES, rerollPalette } from './lineplan-core';
import { poolOf, schemeFor, type StyleWorld } from './style-world';
import { isWorldGround, WORLD_INS, type WorldItem } from './render/world-grounds';
import { WORLD_CAM_SEC } from './render/world-cam';
import type { WorldLine } from './render/world-layout';
import { overCreator, useCap } from './origin-rules';
import { songKeyOf } from './render/knobs';
import { DIAGRAM_FX } from './render/kinetic-more';
import { KINETIC_FX, KineticLayer } from './render/kinetic';
import type { RenderJob } from './render/engine';
import type { UiLayer } from './render/graphics';
import { isLineGround } from './render/line-grounds';
import { splitSongTitle } from './structure';
import { TEMPLATES } from './templates';
import { feltTempo, SongTimeline } from './timeline';
import { cuesIn, TreatmentV3, validateTreatment } from './treatment';
import { checkMoments, ownCues, type SignatureMoment } from './signature-moments';
import { closingLine, lineParts, type LinePart } from './song-parts';
import { labelLangOf, partLabelOf } from './labels';
import { compositionsOf, momentsCapOf, scaleOf } from './world-shared';
import { planWorldEvents, type CompositionFamily, type InputWarning, type WorldEventInput, type WorldEventPlan, type WorldEventTable } from './world-events';
import { colourChangeSeen, failedComposites, fromJob, jobFaces, jointChecks, jointName, lightGapWarnings, verifyWorldEvents } from './world-events-adapter';
import { validAccent } from './design';
import { applyWorldEvents } from './world-events-apply';
import { lineScaleOf, momentCandidates, scaleCandidates } from './policy-candidates';
import { approvedMoments, shownBoxes, type LineMoment, type MiniMoment } from './mini-moments';
import { splitCalls } from './calls';
import type { LineScale } from './render/scale-pose';
import { liftRoom } from './render/line-moment';
import type { ScalePlan } from './scale-policy';
import { ensureAdvances } from './render/layout-measure';
import type { MomentPlan } from './moment-policy';

/** Layouts typeplan.mts gives a side setting (typehelp.mts SIDED). */
export const SIDED = new Set(['vertical', 'stair', 'quiet', 'typewriter', 'handwrite']);
/** Moves that point at a line: over a cut no one sings they point at nothing (typeplan.mts EMPHATIC). */
const EMPHATIC = new Set(['rays', 'bubble', 'stamp']);
/** Moves whose parts are the cut's words: a composer cut has none (typeplan.mts WORDED). */
const WORDED: Record<string, number> = { hang: 1, bubble: 1, tiles: 1, flap: 1, chat: 1, strike: 1, morse: 1, beforeafter: 1, measure: 1, loop: 3, layers: 3 };

interface PlanCut { piece?: string; at?: number; scheme?: number; level?: number; beat: number; fx: string; heart?: boolean; dark: boolean; yields?: boolean; mark?: string; tune?: Record<string, number>; cam?: string; rig?: unknown; flash?: string; transition?: string; transitionSec?: number; transitionDir?: number; size?: number; /** A drawn prop standing in the cut (the paid picture tier binds them; a free plan has none). */ sprite?: string }
interface PlanLine { cue: string; enter: string; exit: string; idle: string; trail?: boolean; emphasis: string; method: string; emphasis2?: string; method2?: string; [k: string]: unknown }
interface PlanShot { shot: string; lyric: { template: string; side: string; params?: object }; lines: PlanLine[]; cuts: PlanCut[] }
interface Plan { vision?: { kinds?: string[] }; parts?: { from: string }[]; format?: { pace?: string }; finish?: string; shots: PlanShot[] }
type Hold = { part: unknown };

const cutTimes = (beats: number[], s: { start: number; end: number }, sorted: { beat: number }[]) => {
  const bs = beats.filter((b) => b >= s.start && b < s.end);
  return sorted.map((x, k) => (k === 0 ? s.start : (bs[x.beat] ?? s.end)));
};
const landedEnd = (times: number[], i: number, gap: number, shotEnd: number) => times.slice(i + 1).find((x) => x >= times[i] + gap && x < shotEnd - 0.05) ?? shotEnd;
/** The least time between a line's cut and its own change of set, s. */
const REPOSE_GAP = 0.9;
const holdGap = (pace: string | undefined, chorus: boolean, beatSec: number) => (pace === 'held' || (pace === 'mixed' && !chorus) ? Math.max(1.2, 4 * beatSec) : 0.45);
const lyricSide = (template: string, side: string) => (template === 'stair' && side === 'center' ? 'right' : ['quiet', 'typewriter', 'handwrite'].includes(template) && side === 'right' ? 'left' : side);

/** Characters a second over the song's sung time: under 3 a song is felt rather than shouted. */
export const isCalm = (cues: Cue[]) => {
  const sung = cues.reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  return cues.reduce((s, c) => s + [...c.text.replace(/\s/g, '')].length, 0) / Math.max(1, sung) < 3;
};

/** typeplan.mts settle(): a layout's side, and rare line motions past their uses swapped for the song's commonest. */
function settle(p: Plan) {
  for (const ps of p.shots) ps.lyric.side = lyricSide(ps.lyric.template, ps.lyric.side);
  const lines = p.shots.flatMap((s) => s.lines ?? []);
  for (const key of ['enter', 'exit'] as const) {
    const count = new Map<string, number>();
    for (const l of lines) count.set(l[key], (count.get(l[key]) ?? 0) + 1);
    const common = [...count].filter(([k]) => useCap(`${key}:${k}`) === Infinity).sort((a, b) => b[1] - a[1])[0]?.[0];
    const used = new Map<string, number>();
    for (const l of lines) {
      used.set(l[key], (used.get(l[key]) ?? 0) + 1);
      if (common && used.get(l[key])! > useCap(`${key}:${l[key]}`)) l[key] = common;
    }
  }
  // a composer plan has one own form at most (kinetic-format), never past the creator's limit
  if (overCreator(['device:kinetic-format']).length) throw new Error('kinetic-format over its creator limit');
}

/**
 * A world's ground for a cut that would repeat the cut before (a world's pool is small: riso has four, and a director's
 * choice laid over the composer's put 三年後的大雪 on the same grain block twice running, 2026-11-03): another of the
 * grounds at the same level as `fx` (the quiet ones on a calm song), never the one before nor the peak's. `fx` itself
 * when it differs already or the world has no other.
 */
export function unrepeatGround(world: StyleWorld, fx: string, before: string, calm: boolean, salt: number): string {
  if (fx !== before) return fx;
  // (a page a set is laid into comes back with that set: the words stand on it as designed)
  if (world.layouts.lines.some((l) => l.ground === fx)) return fx;
  const levels = Object.values(world.grounds.levels);
  const pool = calm ? world.grounds.quiet : (levels.find((l) => l.includes(fx)) ?? [...world.grounds.quiet, ...levels.flat()]);
  const other = [...new Set(pool)].filter((g) => g !== before && g !== world.peak.loud && g !== world.peak.calm);
  return other.length ? other[salt % other.length] : fx;
}

/**
 * A prop's least size on a world (share of the frame's height): a world prints it in two of its inks on a busy ground,
 * and the binder's 0.4–0.5 for centred lines left 三年後的大雪's props specks (2026-11-03).
 */
export const WORLD_PROP_MIN = 0.55;

/** typeplan.mts --plan on a composer plan: the treatment the renderer reads. */
export function composerTreatment(song0: SongTimeline, plan0: Plan, base: TreatmentV3, palette: { ink: string; paper: string; accent: string; heart: string }, world?: StyleWorld): TreatmentV3 {
  const felt = feltTempo(song0);
  const song = { ...song0, tempo: felt.tempo };
  const beats = felt.beats;
  const plan = structuredClone(plan0);
  const { ink, paper, accent, heart } = palette;
  const reroll = base.design?.reroll;
  const sectionAt = (x: number) => song.sections.find((s) => x >= s.start && x < s.end);
  const shots = base.shots.map((s) => ({ ...s, part: sectionAt(s.start) }));
  const cueText = (id: string) => song.cues.find((c) => c.id === id)?.text ?? '';
  const songKey = songKeyOf(String(song.title ?? ''), reroll);
  const meanEnergy = song.sections.reduce((a, x) => a + x.energy, 0) / Math.max(1, song.sections.length);
  const mood = +Math.max(0, Math.min(1, ((meanEnergy - 0.35) / 0.35) * 0.6 + ((song.tempo - 70) / 80) * 0.4)).toFixed(2);
  const calm = isCalm(song.cues);
  const quietType = calm && !!plan.vision?.kinds?.includes('mood');
  settle(plan);
  const at = (id: string) => shots.findIndex((x) => x.id === id);
  const partOf = (shot: string) => [...(plan.parts ?? [])].filter((x) => at(x.from) >= 0 && at(x.from) <= at(shot)).sort((x, y) => at(y.from) - at(x.from))[0];
  const beatSec = 60 / song.tempo;
  const titleOf = String(song.title ?? '').slice(0, 40);
  // each line as an item of the song (its number, its part, the lines before it), for a world that prints it (one whose
  // sets are bound to a part: the song's parts are read only then, a long song's structure is not free)
  const prints = !!world?.printsParts || !!world?.layouts.lines.some((l) => l.closing !== undefined);
  const parts = prints ? lineParts(song0) : new Map<string, LinePart>();
  // the world's small labels speak the lyric's language (labels.ts), the parts' names included
  const lang = labelLangOf(song.cues.map((x) => x.text));
  const partName = (id: string) => { const p = parts.get(id); return p ? partLabelOf(p.kind, lang) : ''; };
  const closing = prints ? closingLine(song0) : undefined;
  const runOf = (k: number) => parts.get(song.cues[k].id)?.run ?? 0;
  const subOf = (k: number) => { const p = parts.get(song.cues[k].id); return { n: song.cues.filter((x) => parts.get(x.id)?.run === runOf(k)).length, sec: +((p?.to ?? 0) - (p?.from ?? 0)).toFixed(1) }; };
  const receipt = { id: (songKeyOf(String(song0.title ?? '')) >>> 0).toString(16).toUpperCase().padStart(8, '0'), lines: song.cues.length, len: +(song0.duration ?? song.cues.at(-1)!.end).toFixed(1), bpm: Math.round(song0.tempo) };
  // (a receipt's segments within a run, Q1 phase 3b: a line an approved page move opens starts one; a run starts its own)
  const pageMoves = new Map((plan.shots as { lines: { cue: string; world?: { page?: { draws: string; at: number; sec: number } } }[] }[]).flatMap((s) => s.lines.flatMap((l) => (l.world?.page ? [[l.cue, l.world.page] as const] : []))));
  const segmentOf = (i: number): { no: number; draws: string } | undefined => {
    for (let k = i; k > 0 && runOf(k - 1) === runOf(k); k--) { const m = pageMoves.get(song.cues[k].id); if (m) return { no: k + 1, draws: m.draws }; }
    return undefined;
  };
  const itemOf = (id: string | undefined): WorldItem | undefined => {
    const i = prints ? song.cues.findIndex((x) => x.id === id) : -1;
    if (i < 0) return undefined;
    const c = song.cues[i];
    const at = (k: number) => ({ no: k + 1, text: song.cues[k].text, part: partName(song.cues[k].id), at: song.cues[k].start, run: runOf(k) });
    const first = i === 0 || runOf(i - 1) !== runOf(i);
    const closed = i > 0 && first ? song.cues.findIndex((x) => parts.get(x.id)?.run === runOf(i - 1)) : -1;
    return {
      no: i + 1, part: partName(c.id), text: c.text, prev: Array.from({ length: Math.min(5, i) }, (_, k) => at(i - Math.min(5, i) + k)),
      at: c.start, dur: c.end - c.start, run: runOf(i), first, closing: c.id === closing, sub: subOf(i), song: receipt,
      ...(closed >= 0 ? { before: { part: partName(song.cues[i - 1].id), ...subOf(i - 1), closing: song.cues.slice(closed, i).some((x) => x.id === closing) } } : {}),
      ...(() => {
        const since = segmentOf(i);
        const move = pageMoves.get(c.id);
        if (!since) return {};
        const runStart = song.cues.findIndex((x) => parts.get(x.id)?.run === runOf(i)) + 1;
        return { since, ...(move ? { opens: { draws: move.draws, at: move.at, sec: move.sec }, ...(!first ? { segmentFrom: (i > 0 ? segmentOf(i - 1)?.no : undefined) ?? runStart } : {}) } : {}) };
      })(),
    };
  };
  const linesAt = (a: number, b: number) => song.cues.filter((x) => x.start < b + 1 && x.end > a).map((x) => x.text).join(' ') || titleOf;
  /** The computer the terminal world is set on (graphics.ts ui): every word in its windows is the song's own. */
  const desktopOf = (pal: StyleWorld['palette'][number], k: number, a: number, b: number): UiLayer[] => {
    const skin: UiLayer['skin'] = pal.id === 'mac-desk' ? 'mac' : 'term';
    const said = song.cues.filter((x) => x.end <= b).slice(-6).map((x) => x.text.split(/\s+/)[0]);
    const now = linesAt(a, b).split(/\s+/).filter(Boolean);
    // (the song's name only on a desktop set up in its opening: world-title.ts; after that the windows are named by their job)
    const named = a < TITLE_OPENING_SEC ? titleOf : '';
    const line = (i: number) => said[i % Math.max(1, said.length)] ?? (named || '…');
    const base = { kind: 'ui' as const, color: pal.ink, alert: pal.accent, skin, plain: true, leaves: true };
    const sets: Omit<UiLayer, 'kind' | 'color' | 'alert' | 'skin' | 'plain'>[][] = [
      [{ type: 'terminal', x: -0.62, y: 0.6, w: 0.34, h: 0.26, title: named || '~ $ tty', lines: said.slice(-3) }, { type: 'log', x: 0.62, y: -0.6, w: 0.34, h: 0.28, title: 'log', lines: said, delay: 0.3 }],
      [{ type: 'progress', x: 0.58, y: 0.66, w: 0.36, h: 0.14, title: named || 'sync', lines: [`${now[0] ?? (named || '…')}`] }, { type: 'files', x: -0.62, y: -0.56, w: 0.32, h: 0.32, title: `~/${(named || 'lyrics').slice(0, 12)}`, lines: said.map((x) => `${x.slice(0, 10)}.txt`), delay: 0.25 }],
      [{ type: 'loading', x: 0.66, y: -0.66, w: 0.3, h: 0.16, title: line(0) }, { type: 'code', x: -0.6, y: 0.56, w: 0.36, h: 0.3, title: `${(named || 'lyrics').slice(0, 12)}.txt`, lines: said, delay: 0.2 }],
      [{ type: 'cursor', x: -0.5, y: -0.72, lines: [line(1)] }],
      [{ type: 'error', x: 0.6, y: 0.62, w: 0.34, h: 0.2, title: (named || 'error').slice(0, 18), lines: [line(2)] }, { type: 'terminal', x: -0.6, y: -0.6, w: 0.36, h: 0.26, title: named || '~ $ tty', lines: [line(3), line(4)], delay: 0.3 }],
    ];
    return sets[k % sets.length].map((l) => ({ ...base, ...l }) as UiLayer);
  };
  const sections: { start: number; layers: (KineticLayer | UiLayer)[]; transition?: { kind: string; dur?: number; dir?: number } }[] = [];
  const transitions = new Map<string, number>();
  /** Whether each section is a shot's first cut (the one its line's ground and inks are set for). */
  const opened: boolean[] = [];
  let hold: Hold | undefined;
  // the prop of the cut before and where it stood: the same one across the frame on the next cut reads as a jump
  let shown = { sprite: '', side: '' };
  // the way a world's camera swings into a part, by shot: the ground's (kinetic.ts) and the first line's words agree
  const camDir = new Map<string, number>();
  for (const s of shots) {
    const ps = plan.shots.find((x) => x.shot === s.id);
    if (!ps?.cuts.length) continue;
    const partKey: unknown = partOf(s.id) ?? s.part;
    const away = ps.lyric.side === 'left' ? 'right' : ps.lyric.side === 'right' ? 'left' : 'center';
    const sorted = [...ps.cuts].sort((x, y) => x.beat - y.beat);
    const times = cutTimes(beats, s, sorted).map((x, k) => sorted[k].at ?? x);
    // a world's cuts change the light of the whole frame: never closer than this (no more than three flashes a second)
    const gap = Math.max(world ? 0.55 : 0, holdGap(plan.format?.pace, s.part?.type === 'chorus', beatSec));
    for (const [i, c] of sorted.entries()) {
      const when = times[i];
      if (when >= s.end - 0.05) continue;
      // a line's change of set (lineplan-core reposeOf) is the line's own cut at a word break: it keeps the light's own floor
      if (i > 0 && sections.length && when - sections[sections.length - 1].start < ((c as { repose?: boolean }).repose ? Math.min(gap, Math.max(world ? 0.55 : 0, REPOSE_GAP)) : gap)) continue;
      // (the floor holds across lines too, 2026-11-09: 1710 of 20 859 world cuts on five songs came under 0.55 s of the
      // next shot's first cut. The cut stays, only its change of light gives way: the cut of the shot before keeps the light
      // it came from, so the frame's light changes once, with the new line's own ground)
      if (i === 0 && sections.length > 1 && !opened[sections.length - 1] && when - sections[sections.length - 1].start < gap) {
        const [prev, last] = [sections[sections.length - 2].layers[0] as KineticLayer, sections[sections.length - 1].layers[0] as KineticLayer];
        if (lightOf(last) !== lightOf(prev)) keepLight(last, prev);
      }
      let fx = (KINETIC_FX as readonly string[]).includes(c.fx) || isLineGround(c.fx) || (!!world && isWorldGround(c.fx)) ? c.fx : 'wall';
      if (!c.yields) throw new Error(`a composer cut always yields (${c.fx})`);
      const runsTo = landedEnd(times, i, gap, s.end);
      if (0 < (WORDED[fx] ?? 0)) fx = 'motes';
      // the same ground twice running reads as a cut that did not happen
      if (world && sections.length) fx = unrepeatGround(world, fx, (sections[sections.length - 1].layers[0] as KineticLayer).fx, calm, sections.length);
      // a page laid out with its line stays up through a stretch with no line of its own (an interlude): the line before
      // still lingers on it, and a new ground under it would take away the balloon or card it is read on
      const before = sections[sections.length - 1]?.layers[0] as KineticLayer | undefined;
      const keepPage = !!world && !!before?.world?.bound && !(ps.lines ?? []).length;
      if (keepPage) fx = before!.fx;
      const held2 = calm && hold?.part === partKey ? hold : undefined;
      // a diagram, or a prop, under a centred lyric would sit on it: it takes a side, alternating, a figure smaller
      const figure = !!c.sprite && !DIAGRAM_FX.has(fx);
      const side = (DIAGRAM_FX.has(fx) || figure) && away === 'center' ? (sections.length % 2 ? 'left' : 'right') : away;
      const pal = world ? world.palette[c.scheme ?? 0] : undefined;
      const layer: KineticLayer = { kind: 'kinetic', fx: fx as KineticLayer['fx'], words: [], ink: pal?.ink ?? ink, paper: pal?.ground ?? paper, accent: pal?.accent ?? (c.heart ? heart : accent), seed: sections.length + 1, side: side as KineticLayer['side'], size: Math.min(figure && away === 'center' ? 0.75 : 1.7, Math.max(world ? WORLD_PROP_MIN : 0.4, c.size || 0.85)), flip: side === 'left' };
      if (figure && (shown.sprite !== c.sprite || shown.side === side)) layer.sprite = c.sprite;
      shown = { sprite: layer.sprite ?? '', side };
      if (c.dark) layer.dark = true;
      layer.yields = true;
      if (pal && isWorldGround(fx)) layer.world = { slots: pal, level: c.level ?? 0.5, enter: WORLD_INS[c.transition ?? ''] ? c.transition : undefined, sheet: world!.family === 'print', title: titleOf, lang, ...(world!.layouts.lines.some((l) => l.ground === fx) ? { bound: true } : {}), ...(prints && ps.lines?.length ? { item: itemOf(ps.lines[0].cue) } : {}), ...(c.piece ? { piece: c.piece, words: linesAt(when, runsTo), lines: song.cues.filter((x) => x.start < runsTo + 3 && x.end > when).map((x) => ({ a: x.start, b: x.end, t: x.text })) } : {}) };
      if (keepPage && before?.world) Object.assign(layer, { paper: before.paper, ink: before.ink, accent: before.accent, world: { ...layer.world!, slots: before.world.slots, ...(before.world.item ? { item: before.world.item } : {}) } });
      if (pal && !isWorldGround(fx)) layer.sheetInks = pal;
      if (c.mark) layer.mark = c.mark as KineticLayer['mark'];
      if (c.tune) layer.tune = c.tune;
      layer.bpm = song.tempo;
      layer.song = songKey;
      layer.mood = mood;
      Object.assign(layer, { at: +when.toFixed(3), len: +(song.duration ?? song.cues.at(-1)!.end).toFixed(1) });
      if (calm && !held2) hold = { part: partKey };
      if (!song.cues.some((x) => x.start < runsTo && x.end > when)) {
        layer.hush = true;
        if (EMPHATIC.has(fx)) layer.fx = 'motes' as KineticLayer['fx'];
      }
      if (c.cam) layer.cam = c.cam as KineticLayer['cam'];
      if (i === 0 && WORLD_CAM_SEC[c.cam ?? '']) camDir.set(s.id, (layer.seed ?? 1) % 2 ? 1 : -1);
      if (c.rig) layer.rig = c.rig as KineticLayer['rig'];
      if (c.flash) layer.flash = c.flash as KineticLayer['flash'];
      const tk = c.transition && !WORLD_INS[c.transition] && sections.length && (!held2 || c.transitionSec) ? c.transition : '';
      if (tk) transitions.set(tk, (transitions.get(tk) ?? 0) + 1);
      opened.push(i === 0);
      sections.push({ start: +when.toFixed(3), layers: [layer, ...(world?.id === 'terminal' && pal && fx !== 'terminal/reverse-block' && !c.piece ? desktopOf(pal, sections.length, when, runsTo) : [])], ...(tk && transitions.get(tk)! <= useCap(`tr:${tk}`) ? { transition: { kind: tk, ...(c.transitionSec ? { dur: c.transitionSec, dir: c.transitionDir } : {}) } } : {}) });
    }
  }
  if (sections.length) sections[0].start = 0;
  const tr = structuredClone(base) as TreatmentV3 & { graphics: NonNullable<TreatmentV3['graphics']> };
  tr.graphics.sections = sections as never;
  tr.graphics.story = [];
  tr.design = { ...tr.design!, ...(world ? { world: { id: world.id, language: world.language, frame: world.frameStack }, accentFont: world.type.latin } : {}), medium: 'clean', grain: world?.frameStack.grain ?? 0.1, paper: world?.frameStack.paper ?? 0.2, colorScript: (tr.design!.colorScript ?? []).map((c) => ({ ...c, duotone: 0, image: 1 })), ...(plan.finish && !quietType ? { finish: plan.finish as never } : {}), ...(quietType ? { quiet: true } : {}) };
  for (const ps of plan.shots)
    for (const l of ps.lines ?? []) {
      const cue = tr.cues.find((c) => c.cueId === l.cue);
      if (!cue) continue;
      if (world && l['world']) l['world'] = worldLineOf(world, l['world'] as WorldLine, ps, /[ぁ-ゖァ-ヺ]/.test(song.cues.map((c) => c.text).join('')));
      const wcam = (l['world'] as WorldLine | undefined)?.cam;
      if (wcam) wcam.dir = camDir.get(ps.shot) ?? 1;
      const { cue: _c, enter, exit, idle, trail, emphasis, method, emphasis2: _e2, method2: _m2, symbol: _s, zh: _z, ...rest } = l;
      Object.assign(cue, { enter, exit, idle, trail: trail || undefined, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v)) });
      const where = emphasis ? cueText(l.cue).indexOf(emphasis) : -1;
      cue.emphasis = where >= 0 ? [{ from: where, to: where + [...emphasis].length, method: method as never }] : [];
    }
  for (const p of plan.shots) {
    const shot = tr.shots.find((x) => x.id === p.shot);
    if (!shot) continue;
    const { template, side } = p.lyric;
    shot.template = template;
    shot.params = template.startsWith('world-') ? {} : template === 'vertical' ? { position: side, dim: 0, step: 0.6, lift: 60 } : template === 'stair' ? { side: side === 'center' ? 'right' : side, dim: 0 } : template === 'quiet' ? { position: side === 'right' ? 'auto' : side, dim: 0 } : SIDED.has(template) ? { position: side, dim: 0 } : { dim: 0 };
    if (!template.startsWith('world-')) Object.assign(shot.params, p.lyric.params);
    const pos = (TEMPLATES[template]?.params as Record<string, { values?: string[] }> | undefined)?.['position'];
    if (pos?.values && shot.params['position'] && !pos.values.includes(shot.params['position'] as string)) shot.params['position'] = 'auto';
  }
  return tr;
}

/** A plan's world line with what the renderer needs of its world: the scheme of the part it is in, its surface and face. */
function worldLineOf(w: StyleWorld, line: WorldLine, ps: PlanShot, kanaSong: boolean): WorldLine {
  const scheme = ps.cuts[0]?.scheme ?? 0;
  const slots = w.palette[scheme];
  const kana = kanaSong ? w.type.ja : w.type.tc;
  return { ...line, slots, surface: w.material.surface, core: slots[w.material.core], sheet: w.sheet, fixedInk: w.family === 'wet' || !!w.ownInk, pair: undefined, weight: kana.weight, callOn: w.standsOnPlate ? slots.plate : undefined, ...(w.callSlot ? { callInk: slots[w.callSlot] } : {}) };
}

/** What a cut's frame is lit by: its paper, its ink and whether it is turned dark. Two cuts alike in it change no light. */
export const lightOf = (l: Pick<KineticLayer, 'paper' | 'ink' | 'dark'>) => `${l.paper}|${l.ink}|${l.dark ? 1 : 0}`;
/** A cut that keeps the light of the one before it: the same paper, inks and scheme, its own ground and picture. */
export function keepLight(l: KineticLayer, from: KineticLayer) {
  Object.assign(l, { paper: from.paper, ink: from.ink, accent: from.accent });
  if (from.dark) l.dark = true;
  else delete l.dark;
  if (l.world && from.world) l.world = { ...l.world, slots: from.world.slots };
  if (from.sheetInks) l.sheetInks = from.sheetInks;
}

/** The treatment a composer plan is laid on when no director has seen the song: type settings only. */
export const FREE_BASE = () => ({
  styleAnchor: { prompt: '', palette: { background: '#E8EDF1', text: '#1E2A3C', accent: '#B5402E', line: '#d8a63c', glow: '#ffb64a' } },
  assets: [], cues: [], moments: [], arc: [], concept: '',
  shots: [{ id: 'proto', start: 0, end: 1, template: 'stair', params: {}, camera: 'push', transitionIn: 'cut' }],
  design: { font: 'Chiron Sung HK', accentFont: 'Montserrat', kanaScale: 0.7, grain: 0.25, paper: 0.4, colorScript: [], peak: 'rays', medium: 'clean' },
  graphics: { sections: [], story: [], storyProps: [] },
});

/** Only what the song really has survives of a stored reading (lineplan.mts valid). */
export function validMeaning(m: Meaning | undefined, cues: Cue[]): Meaning | undefined {
  if (!m || !PALETTES[m.palette]) return undefined;
  const at = (id: string) => cues.findIndex((c) => c.id === id);
  const parts = m.parts.filter((p) => at(p.from) >= 0).sort((x, y) => at(x.from) - at(y.from)).map((p) => ({ ...p, tension: Math.min(1, Math.max(0, p.tension)) }));
  if (!parts.length) return undefined;
  parts[0].from = cues[0].id;
  return { ...m, parts, keys: m.keys.filter((k) => cues.find((c) => c.id === k.cue)?.text.includes(k.phrase)), moments: (m.moments ?? []).filter((x) => x && Array.isArray(x.cues) && x.cues.every((id) => at(id) >= 0)) };
}

/** A free video's signature moments at most (the paid director's are three). */
export const FREE_MOMENTS_MAX = 2;
/**
 * The free tier's signature moments: only the ones the song's reading judged a line to mean (meaning.moments; no word
 * list triggers one), through the same guards as the paid director's, and only where the word lands on a chorus
 * downbeat. At most two; none is the usual case.
 */
export function freeMoments(song: SongTimeline, meaning: Meaning | undefined): SignatureMoment[] {
  const asks = meaning?.moments ?? [];
  if (!asks.length) return [];
  const sungOf = (id: string) => { const c = song.cues.find((x) => x.id === id); return c?.charStarts?.length ? { times: c.charStarts, source: 'line' } : undefined; };
  const { kept } = checkMoments(asks, song.cues, sungOf);
  const chorusAt = (t: number) => song.sections.some((x) => x.type === 'chorus' && t >= x.start && t < x.end);
  // (on the downbeat: the word sung within half a beat of the bar's first beat)
  const near = 30 / Math.max(40, song.tempo || 120);
  const onDownbeat = (t: number) => (song.downbeats ?? []).some((d) => Math.abs(d - t) <= near);
  // (a line with a call beside it is dropped by checkMoments itself, on every tier)
  return kept.filter((m) => chorusAt(m.at) && onDownbeat(m.at)).slice(0, FREE_MOMENTS_MAX);
}

export interface FreeOptions {
  /** One-click reroll: unset is the song's own plan. */
  seed?: number;
  /** A stored reading of the lyrics, if the song has one; the free flow works without it. */
  meaning?: Meaning;
  /** The face for the whole video. */
  font?: string;
  fps?: number;
  /** Treatment to take the type settings from; the free flow has none of its own. */
  base?: Record<string, unknown>;
  /** A style (free-styles.ts): its world is the whole of what the plan can draw from. */
  style?: FreeStyle;
  /**
   * false: the plan as it was before the song's one composition scheduler (Q1 phase 2): the composer's own reposes, no
   * event table (before/after comparisons). true: the scheduler takes over every world that declares compositions (off
   * by default, world-shared.ts `enabled`; VJ_WORLD_EVENTS=1 does the same). Unset: only enabled worlds; every other
   * world draws as before and carries its event table.
   */
  worldEvents?: boolean;
  /** For the measurements only: the scheduler's input and its plan as made (before the final check), every candidate refused included. */
  trace?: (input: WorldEventInput, plan: WorldEventPlan) => void;
  /**
   * Q3 phase 2: one scale contrast a sung section from the scale policy, approved by the song's scheduler, on a world that
   * declares `scale` (world-shared.ts WORLD_SCALE); the composer blows up no word of its own there. Off by default
   * (VJ_SCALE=1 does the same): every world draws as before.
   */
  scaleContrast?: boolean;
  /**
   * Q5 phase 2: the reading's moments ranked by the moment policy and approved by the scheduler (big and mini), on a world
   * that declares `moments` (WORLD_MOMENTS), in place of today's chorus-downbeat gate. Off by default (VJ_MOMENTS=1).
   */
  meaningMoments?: boolean;
  /** Where the stored reading came from, for each moment's trace (meaningRef#moments[i]). */
  meaningRef?: string;
  /**
   * Q1 phase 4c (Codex 2026-11-10 r2 §1): on a world the scheduler takes over, Q1 seat changes and Q2 holds are
   * arbitrated together, one primary action a line (hold, composition, declared composite or keep); the composer lists
   * hold candidates per seat and commits none. Off by default (VJ_JOINT=1 does the same); no effect unless scheduled.
   */
  jointHolds?: boolean;
}

/** A song to a render job: about a millisecond of rules, then the engine. */
/** A cue too short to read that only repeats the line before it is an alignment echo: that line runs on to its end instead. */
export function withoutEchoes(song: SongTimeline): SongTimeline {
  const cues: SongTimeline['cues'] = [];
  for (const c of song.cues) {
    const last = cues.at(-1);
    if (last && c.end - c.start < 0.2 && c.text === last.text) cues[cues.length - 1] = { ...last, end: c.end };
    else cues.push(c);
  }
  return cues.length === song.cues.length ? song : { ...song, cues };
}

/**
 * Where a free job starts in the browser: freeJob is synchronous, and a scheduled world measures its seats on the
 * advance table (render/layout-measure.ts), which the browser loads on first use. Await it once before freeJob.
 */
export const freeJobReady = (): Promise<void> => ensureAdvances();

export function freeJob(song0: SongTimeline, o: FreeOptions = {}) {
  const song = withoutEchoes(song0);
  const cues = song.cues as Cue[];
  const calm = isCalm(cues);
  const meaning: Meaning = validMeaning(o.meaning, cues) ?? { palette: calm ? 'frost' : 'tea', ground: 'grain', reading: '', parts: fallbackParts(cues, song.sections as never, calm), keys: [] };
  // a style is a version of its own: it always goes through the reroll's leanings
  const seed = o.style ? (o.seed ?? 0) : o.seed;
  const world = o.style?.world;
  const start = world ? schemeFor(world, song.title, meaning.palette, seed ?? 0) : 0;
  const paletteId = world ? world.palette[start].id : rerollPalette(song.title, meaning.palette, calm, seed);
  // (the scheduler takes a declared world over only when asked: no world is enabled by default, Q1 is not accepted yet)
  const asked = o.worldEvents === true || (o.worldEvents !== false && (!!(world && compositionsOf(world.id)?.enabled) || (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['VJ_WORLD_EVENTS'] === '1'));
  const scheduled = !!world && asked && !!compositionsOf(world.id);
  // (Q3 / Q5 phase 2: only when asked, only on a world that declares the capability)
  const env = (k: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] === '1';
  const scaleOn = !!world && !!scaleOf(world.id) && (o.scaleContrast ?? env('VJ_SCALE'));
  const momentsOn = !!world && !!momentsCapOf(world.id) && (o.meaningMoments ?? env('VJ_MOMENTS'));
  const joint = scheduled && (o.jointHolds ?? env('VJ_JOINT'));
  const font = o.font ?? (o.style ? styleFont(o.style, song.cues.map((c) => c.text).join(''), calm) : calm ? 'Noto Serif TC' : 'Chiron Hei HK');
  const { plan: composed0, shots } = composePlan(song as never, { ...meaning, palette: paletteId }, calm, { reroll: seed, ...(world ? { world: { ...poolOf(world, RECIPES, start), scheduled, ...(asked ? { stillLines: true } : {}), ...(scheduled ? { faces: { family: font, accent: validAccent(world.type.latin) } } : {}), ...(scaleOn ? { scaled: true } : {}), ...(joint ? { joint: true } : {}) } } : {}) });
  const palette = o.style ? STYLE_PALETTES[paletteId] : PALETTES[paletteId];
  const base = composerBase(o.base ?? FREE_BASE(), composed0, shots, palette, seed) as unknown as TreatmentV3;
  // a moment is its lines' whole treatment: their small tier and screen hit come off (scripts/lyric-vj/moments.mts withMoments)
  // (Q5 wiring: the scheduler's approved moments replace today's gate; the first draw, scheduled on, carries none)
  const today = momentsOn ? [] : freeMoments(song, meaning);
  const win = { start: 0, end: song.duration };
  const fps = o.fps ?? 30;
  const jobOf = (plan: typeof composed0, moments: SignatureMoment[] = today, mini: MiniMoment[] = []) => {
    const own = new Set(moments.flatMap(ownCues));
    const drawn = composerTreatment(song, plan as never, base, palette, world);
    const signed: TreatmentV3 = moments.length ? { ...drawn, cues: drawn.cues.map((c) => (own.has(c.cueId) ? { ...c, fine: undefined, hit: undefined } : c)), signature: moments } : drawn;
    const treatment: TreatmentV3 = mini.length ? { ...signed, miniMoments: mini } : signed;
    const checked = validateTreatment(treatment, song, win, TEMPLATES);
    if (checked.errors.length) throw new Error(`plan refused: ${checked.errors.slice(0, 3).join(' / ')}`);
    const job: RenderJob = { fps, window: win, beats: song.beats, downbeats: song.downbeats, beatStrength: song.beatStrength, tempo: song.tempo, cues: cuesIn(song, win), singers: song.singers, treatment: checked.treatment, assets: {}, fonts: { family: font }, meta: splitSongTitle(song.title), track: false, entrance: 'whole' };
    return { job, treatment };
  };
  // (pairs C, review 2026-11-10: a colour change the drawn ink would not show is no change: the line keeps, every path)
  const drafted = jobOf(composed0);
  const composed = seenColours(composed0, drafted.job);
  const first = composed === composed0 ? drafted : jobOf(composed);
  const policyOn = scaleOn || momentsOn;
  if (!world || (o.worldEvents === false && !policyOn)) return { job: first.job, plan: composed, palette: paletteId, calm, treatment: first.treatment };
  // the song's one composition plan (world-events.ts, Q1 phase 2): scheduled on the job as the renderer will set it, then
  // written into the plan (its seats and the switches inside lines) and drawn; a world with no capability keeps its plan
  const input = fromJob(first.job, song, world, { seed: seed ?? 0, off: !scheduled, ...(joint ? { joint: true } : {}) });
  // Q3 / Q5 phase 2: their candidates, arbitrated by the same scheduler after Q2 / Q4 are protected and Q1 is laid
  const q3 = scaleOn ? scaleCandidates({ job: first.job, plan: composed }, song, world, { seed: seed ?? 0, songId: song.title ?? '', meaning }) : undefined;
  const q5 = momentsOn ? momentCandidates({ job: first.job, plan: composed }, song, world, meaning, o.meaningRef ?? 'meaning.json') : undefined;
  const planned = planWorldEvents(policyOn ? { ...input, candidates: [...(q3?.candidates ?? []), ...(q5?.candidates ?? [])] } : input);
  const scale = q3 ? scalesOf(planned.policy ?? [], q3.plan, first.job.cues as { id: string; text: string }[]) : new Map<string, LineScale>();
  const regions = new Map((q5?.candidates ?? []).flatMap((c) => (c.id && c.protectedRegion ? [[c.id, c.protectedRegion] as const] : [])));
  const drawnMoments = q5 ? approvedMoments(planned.policy ?? [], q5.plan, song, shownBoxes(input.lines), regions) : undefined;
  const redraw = scheduled || scale.size > 0 || momentsOn;
  // (a type-only mini moves the line's own words: it goes onto the line, the overlay draws only page minis)
  const inLine = lineMoments(drawnMoments?.mini ?? [], first.job.cues as { id: string; text: string }[], new Map(input.lines.map((l) => [l.id, l.seat ?? ''])));
  const drawOf = (events: typeof planned): { plan: typeof composed0; job: RenderJob; treatment: TreatmentV3; checked: InputWarning[] } => {
    const plan = scheduled || scale.size ? applyWorldEvents(composed, events, world, scale.size ? { seats: scheduled, scale } : undefined) : composed;
    const drawnPlan = inLine.size ? withLineMoments(plan, inLine) : plan;
    const { job, treatment } = redraw ? jobOf(drawnPlan, drawnMoments?.big ?? today, drawnMoments?.mini ?? []) : first;
    // (the second draw is checked against the plan it carries: seats, pages, times, handoffs and the light clock)
    const checked = scheduled ? [...verifyWorldEvents(job, world, events, jobFaces(job)), ...lightGapWarnings(job, events), ...jointChecks(job, world, events)] : [];
    return { plan, job, treatment, checked };
  };
  o.trace?.(input, planned);
  let events = planned;
  let { plan, job, treatment, checked } = drawOf(events);
  // (phase 4a: a composite event (an ink-only hold merged with a material move) whose landing fails is undone, never left
  // half drawn and never by cancelling the hold: the material is refused, the hold and the line's layout are drawn as the
  // composer planned them, and the failure stays in the record as a contract failure)
  const { failed, warnings: lost } = failedComposites(events.events, checked);
  // (phase 4c, joint: a failed composite is undone whole, its event and the hold it committed together, the line kept
  // with landingFailed; the 4a restore of the hold alone would re-add a hold the joint plan never chose on its own)
  if (failed.length && events.outcomes) {
    const ids = new Set(failed.map((e) => e.lineIds.at(-1)!));
    const held = new Set(failed.map((e) => e.absorbed!.holdId));
    events = { ...events, events: events.events.filter((e) => !failed.includes(e)), holds: events.holds.filter((h) => !held.has(`hold:${h.kind}@${h.lineId}`)), rejected: [...events.rejected, ...failed.map((e) => ({ candidate: { lineId: e.lineIds.at(-1)!, kind: e.kind as CompositionFamily, at: e.at, seatAfter: e.seatAfter }, reason: `absorb ${e.absorbed!.holdId}: the composite did not land: the line kept (joint)` }))], outcomes: events.outcomes.map((x) => (ids.has(x.lineId) ? { ...x, outcome: 'keep' as const, reason: 'landingFailed' as const, why: 'composite did not land' } : x)) };
    ({ plan, job, treatment, checked } = drawOf(events));
    checked = [...checked, ...lost.map((w) => ({ ...w, reason: w.reason.replace("its hold and the line's layout restored, the material refused", 'the line kept with no hold (joint)') }))];
  } else if (failed.length) {
    events = { ...events, events: events.events.filter((e) => !failed.includes(e)), rejected: [...events.rejected, ...failed.map((e) => ({ candidate: { lineId: e.lineIds.at(-1)!, kind: e.kind as CompositionFamily, at: e.at, seatAfter: e.seatAfter }, reason: `absorb ${e.absorbed!.holdId}: the composite did not land: hold and layout restored` }))] };
    ({ plan, job, treatment, checked } = drawOf(events));
    checked = [...checked, ...lost];
  }
  // (phase 4c: a committed hold that did not land as planned is undone on its line alone, atomically: the line keeps
  // its seat with no hold (the alternative the plan validated, its boundary keep), the outcome records the landing
  // failure, and the failure stays a contract failure; nothing is re-added in its place)
  const sunk = events.outcomes ? failedHolds(events, checked) : [];
  if (sunk.length) {
    const ids = new Set(sunk.map((x) => x.lineId));
    events = { ...events, holds: events.holds.filter((h) => !ids.has(h.lineId)), outcomes: events.outcomes!.map((x) => (ids.has(x.lineId) ? { ...x, outcome: 'keep' as const, reason: 'landingFailed' as const, why: sunk.find((y) => y.lineId === x.lineId)!.why } : x)) };
    ({ plan, job, treatment, checked } = drawOf(events));
    checked = [...checked, ...sunk.map((x) => ({ inputs: [jointName(x.lineId)], reason: `final check: contract failure: the committed hold on ${x.lineId} did not land (${x.why}); the line kept its seat with no hold` }))];
  }
  const table: WorldEventTable = { events: events.events, holds: events.holds, warnings: [...events.warnings, ...checked], rejected: events.rejected.length, source: scheduled ? 'declared' : 'declared-off', ...(events.holdMoves ? { holdMoves: events.holdMoves } : {}), ...(events.camDrops ? { camDrops: events.camDrops } : {}), ...(events.policy ? { policy: events.policy } : {}), ...(events.outcomes ? { outcomes: events.outcomes } : {}) };
  job.treatment.worldEvents = table;
  treatment.worldEvents = table;
  return { job, plan, palette: paletteId, calm, treatment, ...(policyOn ? { policy: { scale: q3?.plan, moments: q5?.plan, decisions: events.policy ?? [], refused: [...(drawnMoments?.refused ?? []), ...(q5?.noRoom ?? []).map((x) => ({ id: x.meaningRef, why: x.why }))], unrealizable: q3?.unrealizable ?? [] } as FreePolicy } : {}) };
}

/**
 * The plan with every colour-change hold the drawn ink would not show taken off its line (world-events-adapter
 * colourChangeSeen, on the job drawn from it): the line keeps, the reason in `beatSkip` and an `invisible` refusal in
 * `beatRejects`; under the joint contract the same for each colour candidate on the seat it was measured on. The same
 * plan object when nothing is hidden.
 */
function seenColours<P extends { shots: { lines: { cue: string; world?: Record<string, unknown> }[] }[] }>(plan: P, job: RenderJob): P {
  type Beat = { kind: string; at: number; span?: { from: number; to: number } };
  let touched = false;
  const out = structuredClone(plan);
  for (const s of out.shots) for (const l of s.lines) {
    const w = l.world as { beat?: Beat; beatSkip?: string; beatRejects?: { kind: string; reason: string }[]; beatAbsorb?: unknown; holdCands?: { seat: string; beat: Beat }[] } | undefined;
    if (!w) continue;
    const b = w.beat;
    const v = b ? colourChangeSeen(job, l.cue, b) : { seen: true };
    if (b && !v.seen) {
      touched = true;
      delete w.beat;
      delete w.beatAbsorb;
      w.beatSkip = `colour change not visible on the drawn ink (pairs C): ${v.why}`;
      w.beatRejects = [...(w.beatRejects ?? []), { kind: b.kind, reason: 'invisible' }];
    }
    if (w.holdCands) {
      const kept = w.holdCands.filter((c) => colourChangeSeen(job, l.cue, c.beat, c.seat).seen);
      if (kept.length !== w.holdCands.length) {
        touched = true;
        for (const c of w.holdCands.filter((x) => !kept.includes(x))) if (!(w.beatRejects ?? []).some((r) => r.kind === c.beat.kind && r.reason === 'invisible')) w.beatRejects = [...(w.beatRejects ?? []), { kind: c.beat.kind, reason: 'invisible' }];
        if (kept.length) w.holdCands = kept;
        else delete w.holdCands;
      }
    }
  }
  return touched ? out : plan;
}

/** Each type-only mini as its line's own moment: the evidence word's span on the drawn text (calls on their own track). */
function lineMoments(minis: MiniMoment[], cues: { id: string; text: string }[], sets: Map<string, string>): Map<string, LineMoment> {
  const out = new Map<string, LineMoment>();
  for (const m of minis.filter((x) => x.family === 'type-only')) {
    const cue = cues.find((c) => c.id === m.evidenceCueId);
    const at = cue ? cue.text.indexOf(m.word) : -1;
    if (!cue || at < 0) continue;
    const from = [...cue.text.slice(0, at)].length;
    const kept = splitCalls(cue.text).map.slice(from, from + [...m.word].length).filter((x) => x >= 0);
    if (kept.length) out.set(cue.id, { id: m.id, form: m.form, variant: m.variant, span: { from: kept[0], to: kept.at(-1)! + 1 }, at: m.at, mainSec: m.mainSec, to: m.to, lift: liftRoom(sets.get(cue.id) ?? '', splitCalls(cue.text).main) });
  }
  return out;
}
const withLineMoments = <P,>(plan: P, moments: Map<string, LineMoment>): P => {
  const out = structuredClone(plan) as { shots: { lines: { cue: string; world?: Record<string, unknown> }[] }[] };
  for (const s of out.shots) for (const l of s.lines) { const m = moments.get(l.cue); if (m && l.world) l.world['moment'] = m; }
  return out as P;
};

/** What Q3 / Q5 planned and the scheduler made of it (measurement only; the treatment carries the decisions). */
export interface FreePolicy { scale?: ScalePlan; moments?: MomentPlan; decisions: NonNullable<WorldEventTable['policy']>; refused: { id: string; why: string }[]; /** Q3 seats not offered: their composition misses 1.6× on the shaped measure. */ unrealizable: { id: string; why: string }[] }

/**
 * Each approved Q3 seat as the line's scale composition (render/scale-pose.ts LineScale): its span moved onto the line as
 * drawn (the calls go to their own track), its plan's sizes, edge, rows and carrier.
 */
function scalesOf(decisions: NonNullable<WorldEventTable['policy']>, plan: ScalePlan, cues: { id: string; text: string }[]): Map<string, LineScale> {
  const out = new Map<string, LineScale>();
  const seats = plan.ranked.flat();
  for (const d of decisions.filter((x) => x.source === 'Q3' && x.approved)) {
    const c = seats.find((x) => x.eventId === d.id);
    const cue = cues.find((x) => x.id === d.lineId);
    const ls = c && cue ? lineScaleOf(c, cue.text, d.eventId ?? d.id) : undefined;
    if (ls) out.set(d.lineId, ls);
  }
  return out;
}

/** The hold and composite lines of a joint plan whose landing the final check names (phase 4c), and what it said. */
function failedHolds(events: WorldEventPlan, checked: InputWarning[]): { lineId: string; why: string }[] {
  return (events.outcomes ?? []).flatMap((o) => {
    if (o.outcome !== 'hold' && o.outcome !== 'composite') return [];
    const hold = events.holds.find((h) => h.lineId === o.lineId);
    const named = checked.filter((w) => w.reason.startsWith('final check') && (w.inputs[0] === jointName(o.lineId) || (hold && w.inputs[0] === `hold:${hold.kind}@${hold.lineId}`)));
    return named.length ? [{ lineId: o.lineId, why: named.map((w) => w.reason.replace(/^final check: /, '')).join('; ') }] : [];
  });
}
