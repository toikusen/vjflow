// Exports a song's lyric timing as (enhanced) LRC for karaoke apps, VJ software and the timing editor.
// npx tsx scripts/lyric-vj/lrc.mts out/db/<id>/song.json > song.lrc
import { readFileSync } from 'node:fs';
import { phraseBoundaries } from '../../src/app/lyric-vj/phrases';
import { toLrc } from '../../src/app/lyric-vj/timeline';

const song = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(toLrc(song, (text) => [...phraseBoundaries(text)].sort((a, b) => a - b).filter((b) => b < [...text].length)));
