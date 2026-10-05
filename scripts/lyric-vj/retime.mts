// Re-derives per-character timing (and early line starts) of an existing song.json from its cached force.json.
// npx tsx scripts/lyric-vj/retime.mts out/db/<id>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { charTiming } from '../../src/app/lyric-vj/align';

const dir = process.argv[2];
const song = JSON.parse(readFileSync(join(dir, 'song.json'), 'utf8'));
const lines = JSON.parse(readFileSync(join(dir, 'force.json'), 'utf8')).lines;
if (lines.length !== song.cues.length) throw new Error(`force.json ${lines.length} 行，歌詞 ${song.cues.length} 行`);
let moved = 0;
let trusted = 0;
song.cues = song.cues.map((c: { text: string; start: number; end: number }, i: number) => {
  const r = charTiming(c.text, lines[i].words, c.start, c.end);
  if (Math.abs(r.start - c.start) > 0.01) moved++;
  if (r.trusted) trusted++;
  return { ...c, start: r.start, charStarts: r.charStarts, charTimed: r.trusted };
});
writeFileSync(join(dir, 'song.json'), JSON.stringify(song, null, 1));
console.log(`${dir}: ${moved} line starts moved, ${trusted}/${song.cues.length} lines word-timed`);
