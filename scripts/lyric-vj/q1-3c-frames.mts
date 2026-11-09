// Q1 phase 3c (docs/research/2026-11-10-q1-phase3c.md): the poster-panel as the renderer draws it on real lines. The
// scheduler approves none on the songs on disk (poster-panel-scan.mts), so each line here is one pageSeatsFor offers
// +panels on, its repose forced into the job at a sung word break (the same edit world-events-3b.spec makes): frames
// before / mid / after the slide, scheduler off (left: today) and forced (right), and the engine's record of the line
// (floored or not). Not an approved instance: a look at what an approval would draw.
// --pinned: also lines the scheduler pins (a Q2 hold, a blown-up word, a shared shot), to see the renderer's own guard.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q1-3c-frames.mts --out out/research/q1-1109/critic-3c [--pinned]
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { laidSeat, panelSplit } from '../../src/app/lyric-vj/render/seat-geometry';
import { pageSeatsFor } from '../../src/app/lyric-vj/lineplan-core';
import { jobFaces, sungWords } from '../../src/app/lyric-vj/world-events-adapter';
import { framePage } from './frame-page.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q1-1109/critic-3c' }, font: { type: 'string', default: 'Huninn' }, picks: { type: 'string', default: '2' }, pinned: { type: 'boolean', default: false } } });
const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
const files = execSync('find -L out/db out/beta/songs -maxdepth 3 -name song.json', { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
type Cue = { cueId: string; shot?: string; world?: { set: string; repose?: { at: number; set: string; sec?: number; move?: string }[] } };
const picks: { file: string; id: string; text: string; at: number }[] = [];
for (const f of files) {
  if (picks.length >= Number(a.picks)) break;
  const song = JSON.parse(readFileSync(f, 'utf8'));
  if (!song.cues?.length || picks.some((p) => p.file === f)) continue;
  const job = freeJob(song, { style, seed: 0, worldEvents: true, font: a.font }).job;
  for (const c of job.treatment.cues as Cue[]) {
    const cue = job.cues.find((x) => x.id === c.cueId)!;
    const w = c.world;
    // (a line the scheduler could move inside itself: offered the panels seat, no Q2 hold, no blown-up word, alone in its
    // shot: fromJob pins every other line)
    const shared = (job.treatment.cues as { shot?: string }[]).filter((x) => x.shot === (c as { shot?: string }).shot).length > 1;
    if (!w || !/^art-deco\/marquee(-low)?$/.test(w.set) || w.repose?.length || (!a.pinned && ((w as { beat?: unknown }).beat || (w as { blow?: unknown }).blow || shared))) continue;
    if (!(w as { seats?: string[] }).seats?.includes(`${w.set}+panels`) || !pageSeatsFor(cue.text, w.set, 'art-deco', jobFaces(job)(cue.text)).includes(`${w.set}+panels`)) continue;
    const words = sungWords(cue as never);
    const at = words?.slice(1).map((x) => x.from).find((t) => t - cue.start >= 1.2 && cue.end - t - 0.4 >= 0.6);
    if (at === undefined) continue;
    picks.push({ file: f, id: c.cueId, text: cue.text, at });
    break;
  }
}
mkdirSync(a.out!, { recursive: true });
const page = await framePage('.q1-3c-frames');
const index: Record<string, unknown>[] = [];
for (const p of picks) {
  const song = JSON.parse(readFileSync(p.file, 'utf8'));
  const off = freeJob(song, { style, seed: 0, worldEvents: false, font: a.font }).job;
  const forced = structuredClone(freeJob(song, { style, seed: 0, worldEvents: true, font: a.font }).job);
  const c = (forced.treatment.cues as Cue[]).find((x) => x.cueId === p.id)!;
  c.world!.repose = [{ at: p.at, set: `${c.world!.set}+panels`, sec: 0.4, move: 'poster-panel' }];
  const face = jobFaces(forced)(p.text);
  const boxes = panelSplit(laidSeat(p.text, `${c.world!.set}+panels`, { font: face }));
  const times = { before: p.at - 0.15, mid: p.at + 0.2, after: p.at + 0.7 };
  const record: Record<string, unknown> = {};
  for (const [side, job] of [['off', off], ['forced', forced]] as const) {
    const pg = await page.job(`deco-${p.id}-${side}`, job);
    record[side] = (await pg.metrics()).find((m) => m.id === p.id);
    for (const [k, t] of Object.entries(times)) {
      const l = await pg.layers(t, 1920, 1080, true);
      writeFileSync(join(a.out!, `art-deco-${p.id}-${p.at}-${k}-${side}.jpg`), Buffer.from(l.jpeg!.split(',')[1], 'base64'));
    }
    await pg.close();
  }
  index.push({ pinned: !!(c.world as { beat?: unknown }).beat, hold: (c.world as { beat?: { kind: string } }).beat?.kind, song: song.title, file: p.file, line: p.id, text: p.text, at: p.at, set: c.world!.set, font: a.font, face, boxes, engine: record, times });
}
await page.close();
writeFileSync(join(a.out!, 'index.json'), JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), note: 'forced: the poster-panel repose written into the scheduled job at a sung word break (no approved instance exists on the songs on disk); off: freeJob worldEvents:false', frames: index }, null, 1));
console.log(JSON.stringify(index, null, 1));
