// The owner's before/after clips of the pairs rules (Codex 2026-11-10 pairs B, C): for each blind pair, the holds-first
// side it was shown (pairs-4c/<pair>-<label>, rendered at 6d1d57c) is "before"; "after" is the same song, window, seed 0,
// Huninn and scheduler on (holds-first) at this commit. Writes each after treatment and the list run.sh renders and
// stacks (before left, after right). $0: stored meanings only, no render here.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/pairs-rules-clips.mts --key out/research/q1-1109/pairs-4c-key.json --out out/research/q1-1109/pairs-rules/clips
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';

const { values: a } = parseArgs({ options: { key: { type: 'string' }, out: { type: 'string' } } });
type Pair = { pair: string; world: string; song: string; db: string; window: [number, number]; labels: Record<string, string> };
const key = JSON.parse(readFileSync(a.key!, 'utf8')) as { font: string; seed: number; pairs: Pair[] };
const list = key.pairs.map((p) => {
  const song = JSON.parse(readFileSync(`out/db/${p.db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${p.song}/meaning.json`, 'utf8'));
  const style = OFFERED_STYLES.find((s) => s.id === p.world)!;
  const f = freeJob(song, { style, seed: key.seed, meaning, worldEvents: true, font: key.font });
  const dir = join(a.out!, `${p.pair}-${p.world}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'treatment.json'), JSON.stringify(f.treatment));
  const label = Object.entries(p.labels).find(([, side]) => side === 'holdsFirst')![0];
  const beforeDir = join('out/research/q1-1109/pairs-4c', `${p.pair}-${label}`);
  const before = join(beforeDir, readdirSync(beforeDir).find((x) => x.endsWith('.mp4'))!);
  const contract = f.treatment.worldEvents!.warnings.filter((w) => w.reason.startsWith('final check')).length;
  return { pair: p.pair, world: p.world, song: p.song, db: p.db, clip: `${p.window[0]},${p.window[1]}`, before, after: dir, contract };
});
writeFileSync(join(a.out!, 'list.json'), JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), font: key.font, seed: key.seed, clips: list }, null, 1));
for (const x of list) console.log(x.pair, x.world, x.song, x.clip, x.before, x.after, 'contract', x.contract);
