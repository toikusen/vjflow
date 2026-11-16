// Subject-video tier, phase 2c: the window's treatment from the language's own world plan (free-plan freeJob, the
// song's reading) and the director's script. Cuts fall on the song's beats and energy (char-cuts); each cut is a
// graphics section: the world ground the director gave the line, the shot's cut-out printed in the world's inks
// (a sprite clip on its own clock, so a subject keeps moving while the grounds and words cut under it), a ground
// shadow under a standing figure, the director's kinetic move where a line asked for one, a scene in the language's
// circle window, and the line's text motions (enter / exit / hold / emphasis on its word) over the world's own
// layouts, set on the side the subject leaves free.
// npx tsx scripts/lyric-vj/subject-edit.mts --song song.json --script run2/script.json --world run2/world/treatment.json \
//   --out run2 --from 3 --to 63.06 [--fps 30] [--clip-fps 12] [--clip-in 0.5 --clip-len 1.5]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cutGrid, energyReader, stillShare, type Cut, type CutPlanLine } from '../../src/app/lyric-vj/char-cuts';
import type { SubjectScript, SubjectShot } from '../../src/app/lyric-vj/subject-script';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';
import { NEEDS_ART } from '../../src/app/lyric-vj/render/kinetic';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, script: { type: 'string' }, world: { type: 'string' }, out: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
    fps: { type: 'string', default: '30' }, 'clip-fps': { type: 'string', default: '12' }, 'clip-in': { type: 'string', default: '0.5' }, 'clip-len': { type: 'string', default: '1.5' },
  },
});
const out = a.out!;
const from = Number(a.from), to = Number(a.to);
type Song = { tempo: number; beats: number[]; energy: number[]; energyFps: number; cues: { id: string; start: number; end: number; text: string; charStarts?: number[] }[] };
const song: Song = JSON.parse(readFileSync(a.song!, 'utf8'));
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
const base: TreatmentV3 = JSON.parse(readFileSync(a.world!, 'utf8'));
const world = STYLE_WORLDS.find((w) => w.id === (base.design as { world?: { id: string } }).world?.id)!;
mkdirSync(join(out, 'edit'), { recursive: true });

// ---- cuts on the song's own grid ----
const byId = new Map(script.shots.map((s) => [s.id, s]));
const cueOf = (id: string) => song.cues.find((c) => c.id === id)!;
const beatsOf = (b: number | number[] | undefined) => (Array.isArray(b) ? (b.length ? Math.round(b.reduce((x, y) => x + y, 0) / b.length) : undefined) : b);
const sections = (song as { sections?: { start: number; end: number; energy: number }[] }).sections ?? [];
const sectionEnergy = (t: number) => sections.find((x) => t >= x.start - 0.05 && t < x.end)?.energy ?? 0;
const lines: CutPlanLine[] = script.lines.map((l) => {
  const c = cueOf(l.cue);
  // the director's hold hints hold in the verse; a chorus line cuts faster (the hints made v2's chorus a 3 s metronome)
  // (a chorus line keeps the director's hints only up to four beats: a uniform two-beat chorus was a metronome too)
  const hint = beatsOf(l.beats);
  const beats = sectionEnergy(c.start) >= 0.5 ? (hint ? Math.min(4, hint) : undefined) : hint;
  return { cue: l.cue, start: Math.max(from, c.start), end: Math.min(to, c.end), shots: l.shots, ...(beats ? { beats } : {}) };
});
lines[lines.length - 1].end = to;
// no cut under a beat and a half: a 0.48 s showing of a shot between two others read as a flash (review e)
const minCut = Math.max(0.3, 1.5 * 60 / (song.tempo || 120));
// the song's energy read against its own range: a quiet mix whose chorus sits at 0.58 still gets chorus holds
const raw = energyReader(song.energy, song.energyFps);
const top = Math.max(...song.energy.filter((_, i) => i / song.energyFps >= from && i / song.energyFps <= to), 0.01);
const energyAt = (t: number) => Math.min(1, raw(t) / top);
const grid = cutGrid(song.beats, lines, { energyAt, minCut });
// no ping-pong: a shot shown, left and shown again within one line (A B A) keeps B on instead
const cuts: Cut[] = [];
for (const c of grid) {
  const b = cuts.at(-1), a = cuts.at(-2);
  if (a && b && a.cue === c.cue && b.cue === c.cue && a.shot === c.shot && b.shot !== c.shot) { b.end = c.end; continue; }
  cuts.push({ ...c });
}

// ---- assets: a cut-out per still shot, a sprite clip per run of a video shot (its clock starts with the run), a scene picture ----
type Asset = { kind: 'image' | 'video'; url: string; frames?: { pattern: string; count: number; fps: number; start?: number; loop?: boolean } };
const assets: Record<string, Asset> = {};
const specs: TreatmentV3['assets'] = [];
const stillOf = (s: SubjectShot) => join(out, 'stills', `${s.id}.jpg`);
const spriteOf = (s: SubjectShot) => join(out, 'spr', `${s.id}.png`);
/** A looping motion (wind in a ribbon, a wheel) loops; an action (a laugh, a walk away) holds its last frame. */
const loops = (s: SubjectShot) => /flutter|wave|sway|breeze|spin|turn/i.test(s.subject) && !/stops|out of frame|walks|away/i.test(s.subject);
let runStart = -1;
let prevShot = '';
let runs = 0;
const cutAssets = cuts.map((c) => {
  const s = byId.get(c.shot)!;
  if (c.shot !== prevShot) { runStart = c.start; runs += 1; prevShot = c.shot; }
  if (s.frame === 'scene') {
    if (!assets[s.id]) {
      // the window is round: the picture's square round the subject's side (a circle over a wide picture cut the bike in half)
      const sq = join(out, 'stills', `${s.id}_sq.jpg`);
      if (!existsSync(sq)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', stillOf(s), '-vf', `crop=ih:ih:${s.side === 'left' ? '0' : s.side === 'right' ? 'iw-ih' : '(iw-ih)/2'}:0`, '-q:v', '2', sq]);
      assets[s.id] = { kind: 'image', url: resolve(sq) };
      specs.push({ id: s.id, kind: 'image', prompt: s.place ?? s.subject });
    }
    return { id: s.id, sprite: undefined as string | undefined };
  }
  if (s.kind === 'still') {
    const id = `spr:${s.id}`;
    if (!assets[id]) { if (!existsSync(spriteOf(s))) throw new Error(`${s.id}: cut-out missing`); assets[id] = { kind: 'image', url: resolve(spriteOf(s)) }; specs.push({ id, kind: 'image', prompt: s.subject }); }
    return { id, sprite: s.id };
  }
  const dir = join(out, 'clips', `${s.id}_f`);
  const info = existsSync(join(dir, 'frames.json')) ? (JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8')) as { count: number; fps: number }) : undefined;
  if (!info) {
    // no clip yet: the still cut-out stands in (the pose check and the edit can run before the clips)
    const id = `spr:${s.id}`;
    if (!assets[id]) { assets[id] = { kind: 'image', url: resolve(spriteOf(s)) }; specs.push({ id, kind: 'image', prompt: s.subject }); }
    return { id, sprite: s.id };
  }
  const key = `${s.id}_r${runs}`;
  const id = `spr:${key}`;
  if (!assets[id]) {
    assets[id] = { kind: 'video', url: resolve(spriteOf(s)), frames: { pattern: resolve(dir, '%05d.png'), count: info.count, fps: info.fps, start: runStart, loop: loops(s) } };
    specs.push({ id, kind: 'video', prompt: s.subject, from: `spr:${s.id}` });
    if (!assets[`spr:${s.id}`]) { assets[`spr:${s.id}`] = { kind: 'image', url: resolve(spriteOf(s)) }; specs.push({ id: `spr:${s.id}`, kind: 'image', prompt: s.subject }); }
  }
  return { id, sprite: key };
});

// ---- the treatment: the world's plan, its sections in the window rebuilt per cut ----
const t: TreatmentV3 = structuredClone(base);
const g = t.graphics!;
type Sec = (typeof g.sections)[number];
type KLayer = Record<string, unknown> & { kind: 'kinetic'; fx: string };
// the decided cast was drawn in one scheme: the window's grounds and lines keep it (the world plan rotates schemes by
// part, and a magenta part printed cobalt cut-outs into a stranger's inks, review e)
const schemeId = (JSON.parse(readFileSync(join(out, 'fixed.json'), 'utf8')) as { scheme?: string }[]).find((f) => f.scheme)?.scheme;
const scheme = world.palette.find((p) => p.id === schemeId) ?? world.palette[0];
const withScheme = <T extends Record<string, unknown>>(x: T): T => ({ ...x, ...(x['slots'] ? { slots: scheme } : {}), ...(x['sheetInks'] ? { sheetInks: scheme } : {}), ...('ink' in x ? { ink: scheme.ink, paper: scheme.ground, accent: scheme.accent } : {}), ...('core' in x ? { core: scheme.ink2 } : {}) });
const groundAt = (time: number): KLayer => {
  const sec = [...base.graphics!.sections].filter((s) => s.start <= time + 1e-6).at(-1) ?? base.graphics!.sections[0];
  const k = sec.layers.find((l) => l.kind === 'kinetic') as KLayer | undefined;
  if (!k) throw new Error(`no world layer at ${time}`);
  const g = withScheme(structuredClone(k));
  if (g['world']) g['world'] = withScheme(g['world'] as Record<string, unknown>);
  return g;
};
const lineOf = (cue: string) => script.lines.find((l) => l.cue === cue)!;
const textOf = (cue: string) => script.text.find((x) => x.cue === cue);
const held = (cue: string) => textOf(cue)?.emphasis === 'hold';
// each cut's run start (consecutive cuts of one shot): the subject's clock
const runStartOf: number[] = [];
cuts.forEach((c, i) => runStartOf.push(i && cuts[i - 1].shot === c.shot ? runStartOf[i - 1] : c.start));
/**
 * One of the language's graphic layers behind the subject, by the cut's index: a blob (sun or moon) breathing on the
 * subject's side, a band of two inks, or a halftone screen — overprinted (multiply) like a second drum. Which one
 * rotates by cut so no two neighbours repeat; sized to the subject's side.
 */
function kitLayer(i: number, s: SubjectShot, g: KLayer): Sec['layers'] {
  const x = s.side === 'left' ? -0.45 : s.side === 'right' ? 0.45 : 0;
  const ink2 = (g['sheetInks'] as { ink2?: string } | undefined)?.ink2 ?? (g['accent'] as string);
  const pick = i % 3;
  if (pick === 0) return [{ kind: 'blob', x, y: 0.15, r: 0.42, color: ink2, breathe: 0.02, blend: 'multiply', opacity: 0.55, ghosts: [{ dx: 3, dy: 2, color: g['accent'] as string }] } as never];
  if (pick === 1) return [{ kind: 'bands', colors: [g['accent'] as string, ink2], from: 0.62, to: 0.86, blend: 'multiply', opacity: 0.5 } as never];
  return [{ kind: 'pattern', type: 'halftone', color: ink2, scale: 14, angle: 15 + (i % 4) * 30, blend: 'multiply', opacity: 0.35 } as never];
}
const made: Sec[] = cuts.map((c, i) => {
  const s = byId.get(c.shot)!;
  const l = lineOf(c.cue);
  const ga = cutAssets[i];
  const ground = groundAt(cueOf(c.cue).start);
  const firstOfLine = i === 0 || cuts[i - 1].cue !== c.cue;
  const layer: KLayer = { ...ground, fx: l.ground || ground.fx, seed: i + 1, at: c.start, len: +(c.end - c.start).toFixed(3), words: [], side: s.side, size: s.height, flip: false };
  delete layer['sprite'];
  const layers: Sec['layers'] = [];
  if (s.frame === 'scene') {
    layers.push(layer as never);
    // the language prints no full scenes: the picture in its circle window, on the subject's side, tinted in ink
    const x = s.side === 'left' ? -0.42 : s.side === 'right' ? 0.42 : 0;
    layers.push({ kind: 'photo', mode: 'circle', asset: s.id, x, y: 0.02, w: 0.46, tint: ground['ink'] as string, drift: 0.01 } as never);
  } else {
    // a held vowel (the director's hold emphasis) on the line's first cut: one still composition of the same picture repeated in panels, not more cuts
    const panels = held(c.cue) && firstOfLine && s.size !== 'wide';
    // a move that draws the character itself (panels, tiles, grid, window…) runs on the subject layer; a window frames
    // a close shot only (it cut a wide two-member shot down to a corner, review e)
    const artFx = l.fx && (NEEDS_ART.has(l.fx) || ['panels', 'tiles'].includes(l.fx)) && !(l.fx === 'window' && s.size !== 'close') ? l.fx : undefined;
    const run = runStartOf[i];
    // the cut-out keeps the inks it was drawn in (print own): a duotone print lost the vermilion ribbon, skirt and lamp;
    // its clock is the run's start, so it comes up once and holds through the cuts under it
    // no bare paper: a cut with no move of its own gets one of the language's graphic layers behind the subject
    if (!l.fx && !panels) layers.push(...kitLayer(i, s, ground));
    // the director's move for the line, over the ground and under the subject (a move's boxes drawn over the rider
    // hid him; the character prints last, like a cut-out laid on the sheet)
    // (the move's own words would double the sung line, which the lyric layout draws: it gets none)
    if (l.fx && !panels && !artFx && !(l.fx === 'window' && s.size !== 'close')) layers.push({ kind: 'kinetic', fx: l.fx, bare: true, words: [], ink: ground['ink'], paper: ground['paper'], accent: ground['accent'], seed: i + 11, side: s.side, size: s.height, flip: false, bpm: ground['bpm'], song: ground['song'], mood: ground['mood'], at: c.start, len: +(c.end - c.start).toFixed(3) } as never);
    layers.push({ ...layer, sprite: ga.sprite, print: 'own', subjectAt: run, shadow: s.size !== 'close' && !panels && !artFx, ...(panels ? { fx: 'grid' } : artFx ? { fx: artFx } : {}) } as never);
  }
  return { start: +c.start.toFixed(3), layers } as Sec;
});
g.sections = [...base.graphics!.sections.filter((s) => s.start < from - 1e-6), ...made, ...base.graphics!.sections.filter((s) => s.start >= to - 1e-6)];

// ---- the lines: the world's layouts on the side the subject leaves free, the director's motions and emphasis ----
const inWindow = new Set(song.cues.filter((c) => c.start < to && c.end > from).map((c) => c.id));
/** Entrances that take a while to read, and exits that start before the line is done: unsafe against a sung word. */
const SLOW_ENTERS = new Set(['slice', 'decode', 'gather', 'settle', 'shuffle', 'spin', 'focus', 'ink', 'karaoke', 'handwrite', 'prelight']);
const EARLY_EXITS = new Set(['dust', 'fade', 'melt', 'scramble', 'shatter', 'domino']);
/** The share of its set's measure a line keeps beside a subject (world-layout compact): short lines give up more, a long line keeps most of its size to stay readable. */
const compactFor = (text: string) => { const n = [...text.replace(/\s/g, '')].length; return n >= 20 ? 1 : +Math.min(0.85, Math.max(0.68, 0.68 + (n - 10) * 0.012)).toFixed(3); };
const setFor = (side: SubjectShot['side']) => (side === 'left' ? 'riso/drop-right' : side === 'right' ? 'riso/offset-stair' : 'riso/tilted');
const worldSets = new Set(world.layouts.lines.map((x) => x.set));
t.cues = t.cues.map((cue) => {
  if (!inWindow.has(cue.cueId)) return cue;
  const l = lineOf(cue.cueId);
  const tx = textOf(cue.cueId);
  const firstShot = byId.get(l.shots[0])!;
  const w = (cue as { world?: Record<string, unknown> }).world;
  const next = { ...cue } as typeof cue & { world?: Record<string, unknown> };
  if (w) {
    const set = setFor(firstShot.side);
    Object.assign(w, withScheme(w as Record<string, unknown>));
    // the line keeps a share of its set's measure and stays put, so the subject beside it has the rest of the frame;
    // the world's own blown-up word goes when the director named the line's emphasis himself
    next.world = { ...w, ...(worldSets.has(set) ? { set } : {}), compact: compactFor(cueOf(cue.cueId).text), drift: [0, 0], swell: 0 };
    // the world's own blown-up word and scale composition (one word flush on the frame edge) take the frame the
    // subject needs; the director's emphasis is the line's emphasis here
    delete next.world['blow'];
    delete next.world['scale'];
    // extreme scale: the director's scaled or weighted word blown up, the rest of the line small (the world's own device)
    if (tx && ['scale', 'weight'].includes(tx.emphasis) && tx.word) {
      const text0 = cueOf(cue.cueId).text, at0 = text0.indexOf(tx.word);
      if (at0 >= 0) next.world['blow'] = { from: at0, to: at0 + tx.word.length, stress: 'plate' };
    }
    if (tx) {
      if (world.motion.enters.includes(tx.enter)) next.world['enter'] = tx.enter;
      if (world.motion.exits.includes(tx.exit)) next.world['exit'] = tx.exit;
      if (world.motion.holds.includes(tx.idle)) next.world['hold'] = tx.idle;
    }
  }
  if (tx) {
    if (!world.motion.enters.includes(tx.enter)) next.enter = tx.enter as never;
    if (!world.motion.exits.includes(tx.exit)) next.exit = tx.exit as never;
    if (!world.motion.holds.includes(tx.idle)) next.idle = tx.idle as never;
    const c0 = cueOf(cue.cueId);
    const text = c0.text;
    // a slow entrance must be read by the first sung character: when that comes within 0.4 s of the line, a quick one
    const firstSung = (c0.charStarts?.[0] ?? c0.start) - c0.start;
    if (firstSung < 0.4 && SLOW_ENTERS.has(next.enter as string)) next.enter = 'wipe' as never;
    // an exit that starts before the last word is sung: a short line leaves on a cut
    if (c0.end - c0.start < 2.5 && EARLY_EXITS.has(next.exit as string)) next.exit = 'cut' as never;
    const at = tx.word ? text.indexOf(tx.word) : -1;
    // a symbol emphasis names its sign: the director's "small doodle" is the swirl until the script carries a symbol field
    // on a flooded ground (the window move) a coloured word loses contrast: the word stands on a paper box instead
    const method = l.fx === 'window' && ['color', 'symbol', 'faces'].includes(tx.emphasis) ? 'box' : tx.emphasis;
    next.emphasis = method && at >= 0 ? [{ from: at, to: at + tx.word.length, method: method as never, ...(method === 'symbol' ? { symbol: 'swirl' } : {}) } as never] : [];
  }
  return next;
});
// the window's own treatment: lines and shots outside it are left out (a render of the window rejects styles for
// lines it does not hold, and a shot squeezed to its start)
t.cues = t.cues.filter((c) => inWindow.has(c.cueId));
t.shots = base.shots.filter((s) => s.start < to && s.end > from).map((s) => ({ ...s, start: Math.max(from, s.start), end: Math.min(to, s.end) }));
t.assets = [...base.assets, ...specs];
writeFileSync(join(out, 'edit', 'treatment.json'), JSON.stringify(t));
writeFileSync(join(out, 'edit', 'assets.json'), JSON.stringify(assets, null, 1));
const isStill = (id: string) => byId.get(id)!.kind === 'still';
const report = cuts.map((c, i) => ({ ...c, kind: byId.get(c.shot)!.frame === 'scene' ? 'SCENE' : isStill(c.shot) ? 'STILL' : 'VIDEO', cast: byId.get(c.shot)!.cast.join('+'), asset: cutAssets[i].id, len: +(c.end - c.start).toFixed(3) }));
writeFileSync(join(out, 'edit', 'cuts.json'), JSON.stringify({ stillShare: +stillShare(cuts, isStill).toFixed(3), cuts: report }, null, 1));
const lens = report.map((r) => r.len).sort((x, y) => x - y);
console.log(`edit: ${cuts.length} cuts, median ${lens[Math.floor(lens.length / 2)]} s, min ${lens[0]} s, stills ${Math.round(stillShare(cuts, isStill) * 100)} % by count, sprite clips ${Object.values(assets).filter((x) => x.frames).length} → ${join(out, 'edit', 'treatment.json')}`);
