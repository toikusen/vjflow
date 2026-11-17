// The video stage of the paid pipeline: after typeplan has bound the song's sprites to its cuts as for any picture
// tier, the sprites that have a clip (a chroma still turned into a Veo clip and keyed frame by frame, subject-clips.mts)
// become sprite clips — a frames asset per run of the sprite, on its own clock from the run's start (engine.ts
// picture / sprite-clip.ts), so the subject keeps moving while the cuts, layouts and words change under it. A cast
// drawn in the language's own inks is printed as drawn (print own) and stands on a ground ellipse. Nothing else of
// the bound plan is touched: layouts, entrances, exits, emphasis, moments and transitions are the director's.
// npx tsx scripts/lyric-vj/video-stage.mts --treatment <img>/treatment.json --assets <img>/assets.json --script run3/script.json \
//   --clips run3/clips --out run4/edit [--from 3 --to 63.06]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { SubjectScript } from '../../src/app/lyric-vj/subject-script';
import type { TreatmentV3 } from '../../src/app/lyric-vj/treatment';

const { values: a } = parseArgs({ options: { treatment: { type: 'string' }, assets: { type: 'string' }, script: { type: 'string' }, clips: { type: 'string' }, out: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
const t: TreatmentV3 = JSON.parse(readFileSync(a.treatment!, 'utf8'));
type Asset = { kind: 'image' | 'video'; url: string; frames?: { pattern: string; count: number; fps: number; start?: number; loop?: boolean } };
const assets: Record<string, Asset> = JSON.parse(readFileSync(a.assets!, 'utf8'));
const script: SubjectScript = JSON.parse(readFileSync(a.script!, 'utf8'));
mkdirSync(a.out!, { recursive: true });
const shots = new Map(script.shots.map((s) => [s.id, s]));
const loops = (subject: string) => /flutter|wave|sway|breeze|spin|turn|pedal|loop/i.test(subject) && !/stops|out of frame|walks|away/i.test(subject);

type KLayer = Record<string, unknown> & { kind: string; sprite?: string; at?: number; subjectAt?: number };
const secs = [...t.graphics!.sections].sort((x, y) => x.start - y.start);
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
      t.assets.push({ id: `spr:${key}`, kind: 'video', prompt: shot.subject, from: `spr:${shot.id}` });
      clips += 1;
    }
    l.sprite = key;
    l.subjectAt = run;
    prev = { sprite: shot.id, run, index: i };
  }
});
t.graphics!.sections = secs;
if (a.from && a.to) {
  const from = Number(a.from), to = Number(a.to);
  const inWindow = new Set(t.cues.filter((c) => { const s = t.shots.find((x) => x.id === c.shot); return s && s.start < to && s.end > from; }).map((c) => c.cueId));
  t.cues = t.cues.filter((c) => inWindow.has(c.cueId));
  t.shots = t.shots.filter((s) => s.start < to && s.end > from).map((s) => ({ ...s, start: Math.max(from, s.start), end: Math.min(to, s.end) }));
}
writeFileSync(join(a.out!, 'treatment.json'), JSON.stringify(t));
writeFileSync(join(a.out!, 'assets.json'), JSON.stringify(assets, null, 1));
console.log(`video stage: ${own} cast cuts printed own, ${clips} sprite clips → ${join(a.out!, 'treatment.json')}`);
