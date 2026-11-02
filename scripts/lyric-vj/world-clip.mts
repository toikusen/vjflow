// A style world on a song, as a treatment render.mts can take: npx tsx --tsconfig tsconfig.json scripts/lyric-vj/world-clip.mts
//   --song nun --style terminal --clip 76,101 --out out/research/styles/clips/terminal-nun [--seed 0]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { FREE_STYLES } from '../../src/app/lyric-vj/free-styles';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a } = parseArgs({ options: { song: { type: 'string' }, style: { type: 'string' }, clip: { type: 'string' }, out: { type: 'string' }, seed: { type: 'string', default: '0' }, fps: { type: 'string', default: '30' } } });
const id = IDS[a.song!];
const song = JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'));
const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${a.song}/meaning.json`, 'utf8'));
const style = FREE_STYLES.find((s) => s.id === a.style);
if (!style) throw new Error(`no style ${a.style}`);
const { treatment, job } = freeJob(song, { style, seed: Number(a.seed), meaning });
mkdirSync(a.out!, { recursive: true });
const tr = join(a.out!, 'treatment.json');
writeFileSync(tr, JSON.stringify(treatment));
const r = spawnSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', 'scripts/lyric-vj/render.mts', '--song', `out/db/${id}/song.json`, '--treatment', tr, '--out', a.out!, '--clip', a.clip!, '--fps', a.fps!, '--workers', '2', '--font', job.fonts.family, '--unconfirmed'], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
