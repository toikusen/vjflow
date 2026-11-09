// Default free output fingerprint (Q3/Q5 phase 2): sha256 of every freeJob job and treatment with no option beyond the
// style, seed and stored meaning, across the five measured songs × 45 offered worlds, to prove the wiring off is byte-identical.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/default-hash.mts [--out file] [--seed 0] [--q1]  (--q1: worldEvents true, the scheduler's own opt-in)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';

const SONGS: [string, string][] = [['nun', 'yt_w_fCuUR3lEs'], ['snow', 'yt_5i50aTB7JFo'], ['tsuzuki', 'yt_b3GCfyNKeLs'], ['choroin', 'yt_hCCskTJwvuc'], ['tenmon', 'yt_iwYXfOhcsYI']];
const { values: a } = parseArgs({ options: { out: { type: 'string' }, seed: { type: 'string', default: '0' }, q1: { type: 'boolean', default: false } } });
const rows: Record<string, string> = {};
for (const [name, db] of SONGS) {
  const song = JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
  for (const style of OFFERED_STYLES) {
    const f = freeJob(song, { style, seed: Number(a.seed), meaning, ...(a.q1 ? { worldEvents: true } : {}) });
    rows[`${name}/${style.id}`] = createHash('sha256').update(JSON.stringify(f.job)).digest('hex').slice(0, 16);
  }
}
const all = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
if (a.out) writeFileSync(a.out, JSON.stringify({ all, rows }, null, 1));
console.log(all, Object.keys(rows).length);
