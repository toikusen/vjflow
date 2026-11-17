// The video stage of the paid pipeline: after typeplan has bound the song's sprites to its cuts as for any picture
// tier, the sprites that have a clip (a chroma still turned into a Veo clip and keyed frame by frame, subject-clips.mts)
// become sprite clips — a frames asset per run of the sprite, on its own clock from the run's start (engine.ts
// picture / sprite-clip.ts), so the subject keeps moving while the cuts, layouts and words change under it. A cast
// drawn in the language's own inks is printed as drawn (print own) and stands on a ground ellipse. Nothing else of
// the bound plan is touched: layouts, entrances, exits, emphasis, moments and transitions are the director's.
// npx tsx scripts/lyric-vj/video-stage.mts --treatment <img>/treatment.json --assets <img>/assets.json --script run3/script.json \
//   --clips run3/clips --out run4/edit [--song song.json --from 3 --to 63.06]  (--song: cuts the plan left without a prop take the script's shots)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { SubjectScript } from '../../src/app/lyric-vj/subject-script';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';
import { STYLE_WORLDS } from '../../src/app/lyric-vj/style-worlds';

const { values: a } = parseArgs({ options: { treatment: { type: 'string' }, assets: { type: 'string' }, script: { type: 'string' }, clips: { type: 'string' }, out: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, song: { type: 'string' },
  // the decided cast (fixed.json): its scheme is the window's scheme, so the cast's inks and the world's agree
  fixed: { type: 'string' } } });
const t: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
type Asset = { kind: 'image' | 'video'; url: string; frames?: { pattern: string; count: number; fps: number; start?: number; loop?: boolean } };
const assets: Record<string, Asset> = JSON.parse(readFileSync(a.assets!, 'utf8'));
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
mkdirSync(a.out!, { recursive: true });
const shots = new Map(script.shots.map((s) => [s.id, s]));
const loops = (subject: string) => /flutter|wave|sway|breeze|spin|turn|pedal|loop/i.test(subject) && !/stops|out of frame|walks|away/i.test(subject);

type KLayer = Record<string, unknown> & { kind: string; sprite?: string; at?: number; subjectAt?: number };
const secs = [...t.graphics!.sections].sort((x, y) => x.start - y.start);
// the cast was drawn in one scheme of the world: the window's grounds and lines take it (the plan's own pick printed
// a cobalt-and-vermilion cast into a pink-and-purple world)
const schemeId = a.fixed && existsSync(a.fixed) ? (JSON.parse(readFileSync(a.fixed, 'utf8')) as { scheme?: string }[]).find((f) => f.scheme)?.scheme : undefined;
const worldId = (t.design as { world?: { id?: string } } | undefined)?.world?.id;
const scheme = schemeId && worldId ? STYLE_WORLDS.find((w) => w.id === worldId)?.palette.find((p) => p.id === schemeId) : undefined;
if (scheme) {
  const withScheme = <T extends Record<string, unknown>>(x: T): T => ({ ...x, ...(x['slots'] ? { slots: scheme } : {}), ...(x['sheetInks'] ? { sheetInks: scheme } : {}), ...('ink' in x ? { ink: scheme.ink, paper: scheme.ground, accent: scheme.accent } : {}), ...('core' in x ? { core: scheme.ink2 } : {}) });
  const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
  for (const sec of secs) {
    if (sec.start < from - 1 || sec.start >= to) continue;
    sec.layers = (sec.layers as KLayer[]).map((l) => { const g = l.kind === 'kinetic' ? withScheme(l) : l; if (g['world']) g['world'] = withScheme(g['world'] as Record<string, unknown>); return g; }) as never;
  }
  for (const c of t.cues as (Record<string, unknown> & { world?: Record<string, unknown> })[]) if (c.world) c.world = withScheme(c.world);
}
const song = a.song ? (JSON.parse(readFileSync(a.song, 'utf8')) as { cues: { id: string; start: number; end: number; text?: string }[] }) : undefined;
// a line beside a subject keeps a share of its set's measure (world-layout compact): short lines give up more, a long
// line keeps most of its size to stay readable; the rest of the frame is the subject's (v3's rule, the one that let
// the rider stand at half the frame; without it the plates left him a third)
if (song) {
  const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
  for (const c of t.cues as (Record<string, unknown> & { cueId: string; world?: Record<string, unknown> })[]) {
    const cue = song.cues.find((x) => x.id === c.cueId);
    if (!cue || cue.start < from || cue.start >= to || !c.world) continue;
    const n = [...(cue as { text?: string }).text?.replace(/\s/g, '') ?? ''].length;
    c.world['compact'] = +Math.min(0.85, Math.max(0.68, 0.68 + (n - 10) * 0.012)).toFixed(3);
  }
}
// the subject's cuts: a chorus holds a cut for a bar, not two — a long section of a loud part is cut at its bars, each
// piece a cut of its own that takes the line's next shot (the plan's ground and camera kept), so a long line is not one
// small figure for 8 s; a quiet part keeps the director's holds
const SPLIT = { level: 0.5, least: 3.0, beats: 4 };
if (song) {
  const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
  let level = 0;
  const out: typeof secs = [];
  secs.forEach((sec, i) => {
    out.push(sec);
    const k = (sec.layers as KLayer[]).find((x) => x.kind === 'kinetic') as (KLayer & { world?: { level?: number }; bpm?: number }) | undefined;
    if (k?.world?.level !== undefined) level = k.world.level;
    const end = secs[i + 1]?.start ?? sec.start;
    if (!k || sec.start < from || sec.start >= to || level < SPLIT.level || end - sec.start < SPLIT.least) return;
    const bar = (SPLIT.beats * 60) / (k.bpm ?? 120);
    const n = Math.round((end - sec.start) / bar);
    for (let j = 1; j < n; j++) {
      const at = +(sec.start + j * bar).toFixed(3);
      if (end - at < bar * 0.5) break;
      const layers = (JSON.parse(JSON.stringify(sec.layers)) as KLayer[]).filter((l) => l.kind === 'kinetic').map((l) => { const c: KLayer = { ...l, at, seed: Number(l['seed'] ?? 0) + 50 * j }; delete c.sprite; delete c.subjectAt; return c; });
      out.push({ ...JSON.parse(JSON.stringify({ ...sec, layers: [] })), start: at, layers } as never);
    }
  });
  secs.splice(0, secs.length, ...out.sort((x, y) => x.start - y.start));
}
// the subject layer: the picture tier binds a prop to a cut here and there; a subject video keeps its cast in view,
// so a cut the plan left without one takes the script's shot for its line (the line's shots in order, cycling), and
// a scene shot stands in the language's circle window on the side its subject keeps
const lineAt = (time: number) => song?.cues.find((c) => time >= c.start - 1e-3 && time < c.end) ?? [...(song?.cues ?? [])].reverse().find((c) => c.start <= time);
const used = new Map<string, number>();
let filled = 0;
if (song) {
  const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
  for (const sec of secs) {
    if (sec.start < from || sec.start >= to) continue;
    const k = (sec.layers as KLayer[]).find((x) => x.kind === 'kinetic');
    if (!k || k.sprite) continue;
    const cue = lineAt(sec.start);
    const line = cue && script.lines.find((l) => l.cue === cue.id);
    if (!line?.shots.length) continue;
    const n = used.get(line.cue) ?? 0;
    used.set(line.cue, n + 1);
    const shot = shots.get(line.shots[n % line.shots.length]);
    if (!shot) continue;
    if (shot.frame === 'scene') {
      const sq = resolve(a.clips!, '..', 'stills', `${shot.id}_sq.jpg`);
      if (!existsSync(sq)) continue;
      if (!assets[shot.id]) { assets[shot.id] = { kind: 'image', url: sq }; t.assets.push({ id: shot.id, kind: 'image', prompt: shot.place ?? shot.subject }); }
      (sec.layers as KLayer[]).push({ kind: 'photo', mode: 'circle', asset: shot.id, x: shot.side === 'left' ? -0.3 : shot.side === 'right' ? 0.3 : 0, y: 0.02, w: 0.4, drift: 0.01 });
      continue;
    }
    if (!assets[`spr:${shot.id}`]) continue;
    Object.assign(k, { sprite: shot.id, side: shot.side, size: shot.height, flip: false });
    filled += 1;
  }
}
// the subject's frame (the video stage's own rules, on top of the director's plan):
// - no shot more than twice in a row: a third takes the line's next shot (three cuts of one picture read as one cut);
// - a line opening on a held vowel (one kana sung on, or a long mark) opens on a grid of the line's different shots;
// - the subject stands large (by its framing) and the line takes the part of the frame it leaves: the rows above it for
//   a long line, a blown-up word or a grid, else the side away from the subject, one seat for the whole line.
const SUBJECT_H: Record<string, number> = { wide: 0.62, medium: 0.72, close: 0.7 };
const HELD = 0.5;
const base = (id?: string) => id?.replace(/_r\d+$/, '');
const cutOuts = (cue: string) => (script.lines.find((l) => l.cue === cue)?.shots ?? []).filter((id) => shots.get(id)?.frame !== 'scene' && assets[`spr:${id}`]);
let thirds = 0, grids = 0, seated = 0;
if (song) {
  const from = Number(a.from ?? 0), to = Number(a.to ?? 1e9);
  const inWin = secs.filter((sec) => sec.start >= from && sec.start < to);
  const kOf = (sec: (typeof secs)[number]) => (sec.layers as KLayer[]).find((x) => x.kind === 'kinetic');
  // no third in a row
  let run: string[] = [];
  for (const sec of inWin) {
    const k = kOf(sec);
    const id = base(k?.sprite);
    if (!k || !id) { run = []; continue; }
    if (run.length >= 2 && run.every((r) => r === id)) {
      const cue = lineAt(sec.start);
      const alt = cue ? cutOuts(cue.id).find((x) => x !== id) : undefined;
      const any = alt ?? [...shots.keys()].find((x) => x !== id && shots.get(x)?.frame !== 'scene' && assets[`spr:${x}`]);
      if (any) { const sh = shots.get(any)!; Object.assign(k, { sprite: any, side: sh.side, size: sh.height }); thirds += 1; }
    }
    run = [...run.slice(-1), base(k.sprite)!];
  }
  for (const c of t.cues as (Record<string, unknown> & { cueId: string; world?: Record<string, unknown> })[]) {
    const cue = song.cues.find((x) => x.id === c.cueId) as ({ id: string; start: number; end: number; text?: string; charStarts?: number[] }) | undefined;
    if (!cue || cue.start < from || cue.start >= to || !c.world) continue;
    const mine = inWin.filter((sec) => lineAt(sec.start)?.id === cue.id && kOf(sec)?.sprite);
    if (!mine.length) continue;
    const chars = [...(cue.text ?? '')];
    const st = cue.charStarts ?? [];
    // (a held vowel: the line's first kana sung again, or drawn out by a long mark, for at least HELD s)
    const heldOpen = chars.length > 2 && st.length === chars.length && (chars[1] === chars[0] || /[ーぁぃぅぇぉ〜～]/.test(chars[1])) && st[2] - st[0] >= HELD;
    const panels = heldOpen ? [...new Set(cutOuts(cue.id))].slice(0, 3) : [];
    if (panels.length >= 2) {
      Object.assign(kOf(mine[0])!, { fx: 'grid', panels, sprite: panels[0], shadow: false });
      grids += 1;
    }
    const n = chars.filter((x) => !/\s/.test(x)).length;
    const first = kOf(mine[0])!;
    const seat = panels.length >= 2 || c.world['blow'] || n > 12 ? 'top' : first.side === 'left' ? 'right' : 'left';
    c.world['seat'] = seat;
    // (a seat already keeps the line to its band: the compact share on top of it set a blown-up word at half its size)
    delete c.world['compact'];
    seated += 1;
    for (const sec of mine) {
      const k = kOf(sec)!;
      const sh = shots.get(base(k.sprite)!);
      if (seat !== 'top') k['side'] = seat === 'left' ? 'right' : 'left';
      if (sh) k['size'] = Math.max(Number(k['size'] ?? 0), SUBJECT_H[sh.size] ?? 0.6);
    }
  }
}
// a run: consecutive sections showing one sprite; its clock starts where the run began
let prev: { sprite: string; run: number; index: number } | undefined;
let clips = 0, own = 0;
secs.forEach((sec, i) => {
  for (const l of sec.layers as KLayer[]) {
    if (l.kind !== 'kinetic' || !l.sprite) { if (l.kind === 'kinetic') prev = undefined; continue; }
    const shot = shots.get(l.sprite.replace(/_r\d+$/, ''));
    if (!shot) continue;
    // the cast keeps the inks it was drawn in, and a standing figure its ground
    Object.assign(l, { print: 'own', shadow: shot.size !== 'close' && l['fx'] !== 'grid' });
    own += 1;
    const run = prev && prev.sprite === shot.id && prev.index === i - 1 ? prev.run : sec.start;
    const frames = join(a.clips!, `${shot.id}_f`, 'frames.json');
    if (shot.kind !== 'video' || !existsSync(frames)) { prev = { sprite: shot.id, run, index: i }; continue; }
    const info = JSON.parse(readFileSync(frames, 'utf8')) as { count: number; fps: number };
    const key = `${shot.id}_r${Math.round(run * 100)}`;
    if (!assets[`spr:${key}`]) {
      assets[`spr:${key}`] = { kind: 'video', url: assets[`spr:${shot.id}`]?.url ?? resolve(a.clips!, '..', 'spr', `${shot.id}.png`), frames: { pattern: resolve(a.clips!, `${shot.id}_f`, '%05d.png'), count: info.count, fps: info.fps, start: run, loop: loops(shot.subject) } };
      // (the clip's first frame is the cut-out's picture: the spec the checks ask a video asset to come from)
      if (!t.assets.some((x) => x.id === `spr:${shot.id}`)) t.assets.push({ id: `spr:${shot.id}`, kind: 'image', prompt: shot.subject });
      t.assets.push({ id: `spr:${key}`, kind: 'video', prompt: shot.subject, from: `spr:${shot.id}` });
      clips += 1;
    }
    l.sprite = key;
    l.subjectAt = run;
    prev = { sprite: shot.id, run, index: i };
  }
});
t.graphics!.sections = secs;
// (the plan stays whole: its moments and word syncs refer to lines beyond a window; a window is rendered with --clip)
writeFileSync(join(a.out!, 'treatment.json'), JSON.stringify(t));
writeFileSync(join(a.out!, 'assets.json'), JSON.stringify(assets, null, 1));
console.log(`video stage: ${secs.length} sections, ${filled} cuts filled from the script, ${thirds} thirds-in-a-row changed, ${grids} held-vowel grids, ${seated} lines seated, ${own} cast cuts printed own, ${clips} sprite clips → ${join(a.out!, 'treatment.json')}`);
