// Every song on disk through art-deco with the scheduler on (Q1 phase 3c, docs/research/2026-11-10-q1-phase3c.md): each
// poster-panel the scheduler approves, whether the final job draws it (landedEvents / verifyWorldEvents: no contract
// warning), and whether the renderer, measuring the line's characters in its own browser on the job's face, parts it
// (seat-geometry panelSplit on those advances, as world-layout calls it). Seed 0, the style's own face; --font adds a
// face the owner's clips are rendered in.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/poster-panel-scan.mts [--out out/research/q1-1109/poster-panel-3c.json] [--font Huninn]
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { laidSeat, panelSplit } from '../../src/app/lyric-vj/render/seat-geometry';
import { jobFaces, landedEvents } from '../../src/app/lyric-vj/world-events-adapter';
import { realAdvances } from './real-advances.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q1-1109/poster-panel-3c.json' }, font: { type: 'string', multiple: true, default: [] }, seeds: { type: 'string', default: '0' } } });
const MEANINGS: Record<string, string> = { yt_w_fCuUR3lEs: 'nun', yt_5i50aTB7JFo: 'snow', yt_b3GCfyNKeLs: 'tsuzuki', yt_hCCskTJwvuc: 'choroin', yt_iwYXfOhcsYI: 'tenmon' };
// (every song file on disk, one per song: the same title and lines once)
const files = execSync('find -L out/db out/beta/songs out/indigo out/research/song-flow -maxdepth 4 -name song.json 2>/dev/null || true', { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
const songs = new Map<string, { file: string; song: any }>();
for (const f of files) {
  try {
    const song = JSON.parse(readFileSync(f, 'utf8'));
    if (!song.cues?.length) continue;
    const key = `${song.title}|${song.cues.length}|${song.cues[0].start}`;
    if (!songs.has(key)) songs.set(key, { file: f, song });
  } catch { /* not a song */ }
}
const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
const real = await realAdvances();
const rows: Record<string, unknown>[] = [];
const failed: { file: string; error: string }[] = [];
const total = { songs: songs.size, runs: 0, approved: 0, drawnJob: 0, drawnReal: 0, contractPosterPanel: 0, finalCheckOther: 0 };
for (const font of [undefined, ...a.font!])
  for (const seed of a.seeds!.split(',').map(Number))
    for (const { file, song } of songs.values()) {
      const id = file.split('/').at(-2)!;
      const meaning = MEANINGS[id] && existsSync(`out/research/instant/plans/${MEANINGS[id]}/meaning.json`) ? JSON.parse(readFileSync(`out/research/instant/plans/${MEANINGS[id]}/meaning.json`, 'utf8')) : undefined;
      let f;
      try { f = freeJob(song, { style, seed, meaning, worldEvents: true, ...(font ? { font } : {}) }); } catch (e) { failed.push({ file, error: (e as Error).message.slice(0, 160) }); continue; }
      total.runs++;
      const table = f.treatment.worldEvents!;
      const faceOf = jobFaces(f.job);
      // (the contract on poster-panel: a final-check warning naming one of its events or the move; any other final check
      // is counted apart: art-deco's page checks on songs outside the gate's five, the same before this phase)
      const ids = new Set(table.events.filter((x) => x.material === 'poster-panel').map((x) => x.id));
      const finals = table.warnings.filter((w) => /final check/.test(w.reason ?? ''));
      const mine = finals.filter((w) => /poster-panel/.test(w.reason) || w.inputs.some((x) => ids.has(x) || /poster-panel/.test(x)));
      total.contractPosterPanel += mine.length;
      total.finalCheckOther += finals.length - mine.length;
      const landed = landedEvents(f.job, style.world, table);
      for (const e of table.events.filter((x) => x.material === 'poster-panel')) {
        total.approved++;
        const cue = f.job.cues.find((c) => c.id === e.lineIds.at(-1))!;
        // (the face the engine sets this line in: fonts.ts lineFace)
        const face = faceOf(cue.text);
        const land = landed.events.find((x) => x.id === e.id);
        const chars = [...new Set([...cue.text])];
        const adv = await real.advances(face, chars);
        const m = new Map(chars.map((c, i) => [c, adv[i]]));
        const measure = (x: string) => [...x].reduce((w, c) => w + (m.get(c) ?? 0), 0);
        const job = panelSplit(laidSeat(cue.text, e.seatAfter, { font: face }));
        const pic = panelSplit(laidSeat(cue.text, e.seatAfter, { measure }));
        const drawnJob = !!land?.same && !!job;
        if (drawnJob) total.drawnJob++;
        if (pic) total.drawnReal++;
        const gap = job && pic ? Math.max(...(['main', 'panel'] as const).flatMap((k) => (['x0', 'y0', 'x1', 'y1'] as const).map((q) => Math.abs(job[k][q] - pic[k][q])))) : undefined;
        rows.push({ song: song.title, file, seed, font: face, line: cue.id, text: cue.text, at: e.at, from: e.from, to: e.to, seat: e.seatAfter, landed: land?.same ?? false, why: land?.why, drawnByRenderer: !!pic, boxes: job, rendererGapPx: gap });
      }
    }
await real.close();
const out = { commit: execSync('git rev-parse --short HEAD').toString().trim(), uncommitted: !!execSync('git status --porcelain src').toString().trim(), total, failed, rows, note: 'approved = poster-panel events in the scheduled job\'s table; drawnJob = landed as planned and panelSplit gives two on the job\'s face (the contract); drawnReal = panelSplit on the browser\'s own advances of the line in that face (what world-layout lays)' };
writeFileSync(a.out!, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ total, failed: failed.length, rows: rows.map((r) => `${r['song']} ${r['font']} ${r['at']} ${r['landed']} ${r['drawnByRenderer']} ${r['rendererGapPx']}`) }, null, 1));
