// Why the scheduler approves no poster-panel (Q1 phase 3c): every art-deco line the composer offers the panels seat,
// over every song on disk, seeds 0-2, the style's face, and what pins it before an in-line switch (world-events-adapter
// fromJob: a Q2 hold, a blown-up word, a shared shot, no word timing).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/poster-panel-pins.mts > out/research/q1-1109/poster-panel-3c-pins.json
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { sungWords } from '../../src/app/lyric-vj/world-events-adapter';

const style = FREE_STYLES.find((s) => s.id === 'art-deco')!;
const files = execSync('find -L out/db out/beta/songs out/indigo out/research/song-flow -maxdepth 4 -name song.json 2>/dev/null || true', { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
const seen = new Set<string>();
const pins: Record<string, number> = {};
let offered = 0;
for (const f of files) {
  const song = JSON.parse(readFileSync(f, 'utf8'));
  if (!song.cues?.length) continue;
  const k = `${song.title}|${song.cues.length}|${song.cues[0].start}`;
  if (seen.has(k)) continue;
  seen.add(k);
  for (const seed of [0, 1, 2]) {
    const j = freeJob(song, { style, seed, worldEvents: true });
    const cues = j.treatment.cues as { cueId: string; shot?: string; world?: { seats?: string[]; beat?: unknown; blow?: unknown; repose?: unknown[] } }[];
    for (const c of cues) {
      const w = c.world;
      if (!w?.seats?.some((s) => s.endsWith('+panels'))) continue;
      offered++;
      const cue = j.job.cues.find((x) => x.id === c.cueId)!;
      const why = w.beat ? 'Q2 hold' : w.blow ? 'blown-up word' : cues.filter((x) => x.shot === c.shot).length > 1 ? 'shared shot' : !sungWords(cue as never) ? 'no word timing' : w.repose?.length ? 'moved another way' : 'free';
      pins[why] = (pins[why] ?? 0) + 1;
    }
  }
}
console.log(JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), songs: seen.size, seeds: [0, 1, 2], face: 'style', offered, pins }, null, 1));
