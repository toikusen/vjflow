// The free tier's whole plan in the browser: composer plan, treatment and render job from a song, no server and no
// model call. It is the path `lineplan.mts` + `typeplan.mts --plan` + `render.mts` take offline, kept to what a composer
// plan can hold (no sprites, backdrops, boards or documents); scripts/lyric-vj/free-plan.check.mts proves it gives the
// same treatment as those scripts on the five test songs.
import { FreeStyle, STYLE_PALETTES, styleFont } from './free-styles';
import { composePlan, composerBase, Cue, fallbackParts, Meaning, PALETTES, RECIPES, rerollPalette } from './lineplan-core';
import { poolOf, schemeFor, type StyleWorld } from './style-world';
import { isWorldGround, WORLD_INS } from './render/world-grounds';
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
import { splitCalls } from './calls';
import { TEMPLATES } from './templates';
import { feltTempo, SongTimeline } from './timeline';
import { cuesIn, TreatmentV3, validateTreatment } from './treatment';
import { checkMoments, ownCues, type SignatureMoment } from './signature-moments';

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
  const linesAt = (a: number, b: number) => song.cues.filter((x) => x.start < b + 1 && x.end > a).map((x) => x.text).join(' ') || titleOf;
  /** The computer the terminal world is set on (graphics.ts ui): every word in its windows is the song's own. */
  const desktopOf = (pal: StyleWorld['palette'][number], k: number, a: number, b: number): UiLayer[] => {
    const skin: UiLayer['skin'] = pal.id === 'mac-desk' ? 'mac' : 'term';
    const said = song.cues.filter((x) => x.end <= b).slice(-6).map((x) => x.text.split(/\s+/)[0]);
    const now = linesAt(a, b).split(/\s+/).filter(Boolean);
    const line = (i: number) => said[i % Math.max(1, said.length)] ?? titleOf;
    const base = { kind: 'ui' as const, color: pal.ink, alert: pal.accent, skin, plain: true, leaves: true };
    const sets: Omit<UiLayer, 'kind' | 'color' | 'alert' | 'skin' | 'plain'>[][] = [
      [{ type: 'terminal', x: -0.62, y: 0.6, w: 0.34, h: 0.26, title: titleOf, lines: said.slice(-3) }, { type: 'log', x: 0.62, y: -0.6, w: 0.34, h: 0.28, title: 'log', lines: said, delay: 0.3 }],
      [{ type: 'progress', x: 0.58, y: 0.66, w: 0.36, h: 0.14, title: titleOf, lines: [`${now[0] ?? titleOf}`] }, { type: 'files', x: -0.62, y: -0.56, w: 0.32, h: 0.32, title: `~/${titleOf.slice(0, 12)}`, lines: said.map((x) => `${x.slice(0, 10)}.txt`), delay: 0.25 }],
      [{ type: 'loading', x: 0.66, y: -0.66, w: 0.3, h: 0.16, title: line(0) }, { type: 'code', x: -0.6, y: 0.56, w: 0.36, h: 0.3, title: `${titleOf.slice(0, 12)}.txt`, lines: said, delay: 0.2 }],
      [{ type: 'cursor', x: -0.5, y: -0.72, lines: [line(1)] }],
      [{ type: 'error', x: 0.6, y: 0.62, w: 0.34, h: 0.2, title: titleOf.slice(0, 18), lines: [line(2)] }, { type: 'terminal', x: -0.6, y: -0.6, w: 0.36, h: 0.26, title: titleOf, lines: [line(3), line(4)], delay: 0.3 }],
    ];
    return sets[k % sets.length].map((l) => ({ ...base, ...l }) as UiLayer);
  };
  const sections: { start: number; layers: (KineticLayer | UiLayer)[]; transition?: { kind: string; dur?: number; dir?: number } }[] = [];
  const transitions = new Map<string, number>();
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
      let fx = (KINETIC_FX as readonly string[]).includes(c.fx) || isLineGround(c.fx) || (!!world && isWorldGround(c.fx)) ? c.fx : 'wall';
      if (!c.yields) throw new Error(`a composer cut always yields (${c.fx})`);
      const runsTo = landedEnd(times, i, gap, s.end);
      if (0 < (WORDED[fx] ?? 0)) fx = 'motes';
      // the same ground twice running reads as a cut that did not happen
      if (world && sections.length) fx = unrepeatGround(world, fx, (sections[sections.length - 1].layers[0] as KineticLayer).fx, calm, sections.length);
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
      if (pal && isWorldGround(fx)) layer.world = { slots: pal, level: c.level ?? 0.5, enter: WORLD_INS[c.transition ?? ''] ? c.transition : undefined, sheet: world!.family === 'print', title: titleOf, ...(world!.layouts.lines.some((l) => l.ground === fx) ? { bound: true } : {}), ...(c.piece ? { piece: c.piece, words: linesAt(when, runsTo), lines: song.cues.filter((x) => x.start < runsTo + 3 && x.end > when).map((x) => ({ a: x.start, b: x.end, t: x.text })) } : {}) };
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
  return { ...line, slots, surface: w.material.surface, core: slots[w.material.core], sheet: w.sheet, fixedInk: w.family === 'wet' || !!w.ownInk, pair: undefined, weight: kana.weight, callOn: w.standsOnPlate ? slots.plate : undefined };
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
  // (a line with a call beside it is left alone: the moment drew the call over its own sung words, 雙截棍 c019 2026-11-04)
  const hasCall = (id: string) => splitCalls(song.cues.find((x) => x.id === id)?.text ?? '').calls.length > 0;
  return kept.filter((m) => chorusAt(m.at) && onDownbeat(m.at) && !ownCues(m).some(hasCall)).slice(0, FREE_MOMENTS_MAX);
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
  const { plan, shots } = composePlan(song as never, { ...meaning, palette: paletteId }, calm, { reroll: seed, ...(world ? { world: poolOf(world, RECIPES, start) } : {}) });
  const palette = o.style ? STYLE_PALETTES[paletteId] : PALETTES[paletteId];
  const font = o.font ?? (o.style ? styleFont(o.style, song.cues.map((c) => c.text).join(''), calm) : calm ? 'Noto Serif TC' : 'Chiron Hei HK');
  const base = composerBase(o.base ?? FREE_BASE(), plan, shots, palette, seed) as unknown as TreatmentV3;
  const drawn = composerTreatment(song, plan as never, base, palette, world);
  // a moment is its lines' whole treatment: their small tier and screen hit come off (scripts/lyric-vj/moments.mts withMoments)
  const moments = freeMoments(song, meaning);
  const own = new Set(moments.flatMap(ownCues));
  const treatment: TreatmentV3 = moments.length ? { ...drawn, cues: drawn.cues.map((c) => (own.has(c.cueId) ? { ...c, fine: undefined, hit: undefined } : c)), signature: moments } : drawn;
  const win = { start: 0, end: song.duration };
  const checked = validateTreatment(treatment, song, win, TEMPLATES);
  if (checked.errors.length) throw new Error(`plan refused: ${checked.errors.slice(0, 3).join(' / ')}`);
  const fps = o.fps ?? 30;
  const job: RenderJob = { fps, window: win, beats: song.beats, downbeats: song.downbeats, beatStrength: song.beatStrength, tempo: song.tempo, cues: cuesIn(song, win), singers: song.singers, treatment: checked.treatment, assets: {}, fonts: { family: font }, meta: splitSongTitle(song.title), track: false, entrance: 'whole' };
  return { job, plan, palette: paletteId, calm, treatment };
}
