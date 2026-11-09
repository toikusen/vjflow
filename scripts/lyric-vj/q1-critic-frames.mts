// Frames for the visual critic of Q1 phase 3b (docs/research/2026-11-10-q1-phase3b-critic.md): each world's own move,
// before / during / after, scheduler off (left, today's product) and on (right), one jpeg a moment, 1920 × 1080 halves.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q1-critic-frames.mts --out out/research/q1-1109/critic-3b
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';
import { framePage } from './frame-page.mts';

const { values: a } = parseArgs({ options: { out: { type: 'string', default: 'out/research/q1-1109/critic-3b' } } });
const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', utsusemi: 'yt_zN5-4JfdVRM', taimei: 'yt_ZQ8mn5fS5_M' };
// (world, song, the material and the moment it falls; with no material, the fixed moment itself)
const PICKS: [string, string, string, number][] = [
  ['chalkboard', 'nun', 'erase-reseat', 114.3],
  ['document', 'nun', 'head-print', 58.18],
  ['document', 'nun', 'tear-next', 95.96],
  ['art-deco', 'utsusemi', 'poster-panel', 75.86],
  ['art-deco', 'taimei', 'old-poster-panel', 31.1],
];
mkdirSync(a.out!, { recursive: true });
const page = await framePage('.q1-critic-frames');
const index: Record<string, unknown>[] = [];
for (const [id, name, mat, at] of PICKS) {
  const song = JSON.parse(readFileSync(`out/db/${SONGS[name]}/song.json`, 'utf8'));
  const meaning = existsSync(`out/research/instant/plans/${name}/meaning.json`) ? JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8')) : undefined;
  const style = FREE_STYLES.find((s) => s.id === id)!;
  const sides = { off: freeJob(song, { style, seed: 0, meaning, worldEvents: false }), on: freeJob(song, { style, seed: 0, meaning, worldEvents: true }) };
  const e = sides.on.treatment.worldEvents!.events.find((x) => x.material === mat && Math.abs(x.at - at) < 0.01);
  const [from, to] = e ? [e.from, e.to] : [at, at + 0.42];
  const times = { before: from - 0.15, mid: (from + to) / 2, after: Math.max(to + 0.3, at + 0.45) };
  for (const [side, f] of Object.entries(sides)) {
    const p = await page.job(`${id}-${name}-${side}`, f.job);
    for (const [k, t] of Object.entries(times)) {
      const l = await p.layers(t, 1920, 1080, true);
      writeFileSync(join(a.out!, `${id}-${name}-${at}-${k}-${side}.jpg`), Buffer.from(l.jpeg!.split(',')[1], 'base64'));
    }
    await p.close();
  }
  index.push({ world: id, song: name, material: mat, at, planned: !!e, window: e ? [e.from, e.to] : undefined, times, sides: { off: 'freeJob worldEvents:false (today)', on: 'freeJob worldEvents:true' } });
}
await page.close();
writeFileSync(join(a.out!, 'index.json'), JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), frames: index }, null, 1));
