// Where each style's set pieces fall in a song, first use of each. npx tsx --tsconfig tsconfig.json scripts/lyric-vj/world-pieces-list.mts --song nun terminal
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { song: { type: 'string', default: 'nun' }, seed: { type: 'string', default: '0' } } });
const song = JSON.parse(readFileSync(`out/db/${IDS[a.song!]}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
for (const id of positionals) {
  const { job } = freeJob(song, { style: FREE_STYLES.find((s) => s.id === id)!, seed: Number(a.seed), meaning });
  const out: Record<string, number[]> = {};
  for (const s of job.treatment.graphics!.sections as { start: number; layers: { world?: { piece?: string } }[] }[]) { const p = s.layers[0]?.world?.piece; if (p) (out[p] ??= []).push(s.start); }
  console.log(id, JSON.stringify(out));
}
