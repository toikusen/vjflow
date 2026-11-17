// Subject-video tier, v4: the subject footage as a layer over the normal paid plan. The paid chain (direct → typeplan →
// linedirect --world → typeplan --plan) makes the treatment as for any paid song: the language's world, each line's
// own entrance, exit, hold and emphasis, its moments, transitions and grounds. This script only adds the cast: the
// script's shots cut on the song's beats (char-cuts), each cut's cut-out or sprite clip printed on the section's own
// kinetic layer (print own, a ground shadow, the subject's clock over its run), a scene in the language's circle
// window. The paid sections are split at the subject's cut times so a new picture lands on a beat; nothing of the
// paid plan is removed or re-decided.
// npx tsx scripts/lyric-vj/subject-overlay.mts --song song.json --script run3/script.json --paid run4/line/final/treatment.json \
//   --paid-assets run4/line/final/assets.json --assets-dir run3 --out run4 --from 3 --to 63.06 [--fps 30]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { cutGrid, energyReader, stillShare, type Cut, type CutPlanLine } from './char-cuts';
import type { SubjectScript, SubjectShot } from '../../../src/app/lyric-vj/subject-script';
import type { TreatmentV3 } from '../../../src/app/lyric-vj/treatment';
import { NEEDS_ART } from '../../../src/app/lyric-vj/render/kinetic';

const { values: a } = parseArgs({
  options: {
    song: { type: 'string' }, script: { type: 'string' }, paid: { type: 'string' }, 'paid-assets': { type: 'string' }, 'assets-dir': { type: 'string' }, out: { type: 'string' },
    from: { type: 'string' }, to: { type: 'string' }, fps: { type: 'string', default: '30' },
  },
});
const out = a.out!;
const dir = a['assets-dir'] ?? out;
const from = Number(a.from), to = Number(a.to);
type Song = { tempo: number; beats: number[]; energy: number[]; energyFps: number; sections?: { start: number; end: number; energy: number }[]; cues: { id: string; start: number; end: number; text: string }[] };
const song: Song = JSON.parse(readFileSync(a.song!, 'utf8'));
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
const base: TreatmentV3 = JSON.parse(readFileSync(a.paid!, 'utf8'));
type Asset = { kind: 'image' | 'video'; url: string; frames?: { pattern: string; count: number; fps: number; start?: number; loop?: boolean } };
const assets: Record<string, Asset> = a['paid-assets'] && existsSync(a['paid-assets']) ? JSON.parse(readFileSync(a['paid-assets'], 'utf8')) : {};
mkdirSync(join(out, 'edit'), { recursive: true });

// ---- cuts on the song's own grid ----
const byId = new Map(script.shots.map((s) => [s.id, s]));
const cueOf = (id: string) => song.cues.find((c) => c.id === id)!;
const beatsOf = (b: number | number[] | undefined) => (Array.isArray(b) ? (b.length ? Math.round(b.reduce((x, y) => x + y, 0) / b.length) : undefined) : b);
const sectionEnergy = (t: number) => (song.sections ?? []).find((x) => t >= x.start - 0.05 && t < x.end)?.energy ?? 0;
const lines: CutPlanLine[] = script.lines.map((l) => {
  const c = cueOf(l.cue);
  const hint = beatsOf(l.beats);
  const beats = sectionEnergy(c.start) >= 0.5 ? (hint ? Math.min(4, hint) : undefined) : hint;
  return { cue: l.cue, start: Math.max(from, c.start), end: Math.min(to, c.end), shots: l.shots, ...(beats ? { beats } : {}) };
});
lines[lines.length - 1].end = to;
const minCut = Math.max(0.3, 1.5 * 60 / (song.tempo || 120));
const raw = energyReader(song.energy, song.energyFps);
const top = Math.max(...song.energy.filter((_, i) => i / song.energyFps >= from && i / song.energyFps <= to), 0.01);
const grid = cutGrid(song.beats, lines, { energyAt: (t) => Math.min(1, raw(t) / top), minCut });
// no A-B-A within a line (B stays on), and no third cut in a row on one shot (the next of the line's shots takes it)
const cuts: Cut[] = [];
for (const c of grid) {
  const b = cuts.at(-1), a2 = cuts.at(-2);
  if (a2 && b && a2.cue === c.cue && b.cue === c.cue && a2.shot === c.shot && b.shot !== c.shot) { b.end = c.end; continue; }
  if (a2 && b && a2.shot === c.shot && b.shot === c.shot) {
    const list = script.lines.find((l) => l.cue === c.cue)!.shots;
    const other = list.find((id) => id !== c.shot);
    if (other) { cuts.push({ ...c, shot: other }); continue; }
  }
  cuts.push({ ...c });
}

// ---- assets ----
const specs: TreatmentV3['assets'] = [];
const stillOf = (s: SubjectShot) => join(dir, 'stills', `${s.id}.jpg`);
const spriteOf = (s: SubjectShot) => join(dir, 'spr', `${s.id}.png`);
const loops = (s: SubjectShot) => /flutter|wave|sway|breeze|spin|turn|pedal|loop/i.test(s.subject) && !/stops|out of frame|walks|away/i.test(s.subject);
let prevShot = '', runs = 0;
const runStartOf: number[] = [];
cuts.forEach((c, i) => runStartOf.push(i && cuts[i - 1].shot === c.shot ? runStartOf[i - 1] : c.start));
const cutAssets = cuts.map((c, i) => {
  const s = byId.get(c.shot)!;
  if (c.shot !== prevShot) { runs += 1; prevShot = c.shot; }
  if (s.frame === 'scene') {
    if (!assets[s.id]) {
      const sq = join(dir, 'stills', `${s.id}_sq.jpg`);
      if (!existsSync(sq)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', stillOf(s), '-vf', `crop=ih:ih:${s.side === 'left' ? '0' : s.side === 'right' ? 'iw-ih' : '(iw-ih)/2'}:0`, '-q:v', '2', sq]);
      assets[s.id] = { kind: 'image', url: resolve(sq) };
      specs.push({ id: s.id, kind: 'image', prompt: s.place ?? s.subject });
    }
    return { sprite: undefined as string | undefined };
  }
  if (!existsSync(spriteOf(s))) throw new Error(`${s.id}: cut-out missing`);
  const info = s.kind === 'video' && existsSync(join(dir, 'clips', `${s.id}_f`, 'frames.json')) ? (JSON.parse(readFileSync(join(dir, 'clips', `${s.id}_f`, 'frames.json'), 'utf8')) as { count: number; fps: number }) : undefined;
  if (!info) {
    const id = `spr:${s.id}`;
    if (!assets[id]) { assets[id] = { kind: 'image', url: resolve(spriteOf(s)) }; specs.push({ id, kind: 'image', prompt: s.subject }); }
    return { sprite: s.id };
  }
  const key = `${s.id}_r${runs}`, id = `spr:${key}`;
  if (!assets[id]) {
    assets[id] = { kind: 'video', url: resolve(spriteOf(s)), frames: { pattern: resolve(dir, 'clips', `${s.id}_f`, '%05d.png'), count: info.count, fps: info.fps, start: runStartOf[i], loop: loops(s) } };
    specs.push({ id, kind: 'video', prompt: s.subject, from: `spr:${s.id}` });
    if (!assets[`spr:${s.id}`]) { assets[`spr:${s.id}`] = { kind: 'image', url: resolve(spriteOf(s)) }; specs.push({ id: `spr:${s.id}`, kind: 'image', prompt: s.subject }); }
  }
  return { sprite: key };
});

// ---- the paid sections, split at the subject's cuts, each carrying its cut's subject ----
const t: TreatmentV3 = structuredClone(base);
const g = t.graphics!;
type Sec = (typeof g.sections)[number];
type KLayer = Record<string, unknown> & { kind: string };
const secs = [...g.sections].sort((x, y) => x.start - y.start);
const splitAt = (time: number) => {
  if (secs.some((s) => Math.abs(s.start - time) < 1e-3)) return;
  const k = secs.filter((s) => s.start < time).length - 1;
  if (k < 0) return;
  const src = secs[k];
  const clone = structuredClone(src) as Sec & { start: number };
  clone.start = +time.toFixed(3);
  // a cloned layer keeps its own motion's start, so a backdrop held under several cuts keeps moving on
  for (const l of clone.layers as KLayer[]) if (l['t0'] === undefined) l['t0'] = src.start;
  delete (clone as { transition?: unknown }).transition;
  secs.splice(k + 1, 0, clone);
};
for (const c of cuts) splitAt(c.start);
const held = (cue: string) => script.text.find((x) => x.cue === cue)?.emphasis === 'hold';
cuts.forEach((c, i) => {
  const s = byId.get(c.shot)!;
  const ga = cutAssets[i];
  const l = script.lines.find((x) => x.cue === c.cue)!;
  for (const sec of secs) {
    const next = secs[secs.indexOf(sec) + 1]?.start ?? Infinity;
    if (sec.start >= c.end - 1e-3 || next <= c.start + 1e-3) continue;
    if (s.frame === 'scene') {
      const x = s.side === 'left' ? -0.42 : s.side === 'right' ? 0.42 : 0;
      (sec.layers as KLayer[]).push({ kind: 'photo', mode: 'circle', asset: s.id, x, y: 0.02, w: 0.46, drift: 0.01 });
      continue;
    }
    const k = (sec.layers as KLayer[]).find((x) => x.kind === 'kinetic');
    if (!k) continue;
    const firstOfLine = i === 0 || cuts[i - 1].cue !== c.cue;
    const panels = held(c.cue) && firstOfLine && s.size !== 'wide';
    const artFx = l.fx && (NEEDS_ART.has(l.fx) || ['panels', 'tiles'].includes(l.fx)) && !(l.fx === 'window' && s.size !== 'close') ? l.fx : undefined;
    Object.assign(k, { sprite: ga.sprite, print: 'own', side: s.side, size: s.height, flip: false, subjectAt: runStartOf[i], shadow: s.size !== 'close' && !panels && !artFx, ...(panels ? { fx: 'grid' } : artFx ? { fx: artFx } : {}) });
  }
});
g.sections = secs;
t.assets = [...base.assets, ...specs];
// the window's own treatment
const inWindow = new Set(song.cues.filter((c) => c.start < to && c.end > from).map((c) => c.id));
t.cues = t.cues.filter((c) => inWindow.has(c.cueId));
t.shots = base.shots.filter((s) => s.start < to && s.end > from).map((s) => ({ ...s, start: Math.max(from, s.start), end: Math.min(to, s.end) }));
writeFileSync(join(out, 'edit', 'treatment.json'), JSON.stringify(t));
writeFileSync(join(out, 'edit', 'assets.json'), JSON.stringify(assets, null, 1));
const isStill = (id: string) => byId.get(id)!.kind === 'still';
const report = cuts.map((c, i) => ({ ...c, kind: byId.get(c.shot)!.frame === 'scene' ? 'SCENE' : isStill(c.shot) ? 'STILL' : 'VIDEO', cast: byId.get(c.shot)!.cast.join('+'), sprite: cutAssets[i].sprite, len: +(c.end - c.start).toFixed(3) }));
writeFileSync(join(out, 'edit', 'cuts.json'), JSON.stringify({ stillShare: +stillShare(cuts, isStill).toFixed(3), cuts: report }, null, 1));
const lens = report.map((r) => r.len).sort((x, y) => x - y);
console.log(`overlay: ${cuts.length} cuts over ${secs.filter((s) => s.start >= from && s.start < to).length} sections, median ${lens[Math.floor(lens.length / 2)]} s, min ${lens[0]} s, sprite clips ${Object.values(assets).filter((x) => x.frames).length} → ${join(out, 'edit', 'treatment.json')}`);
