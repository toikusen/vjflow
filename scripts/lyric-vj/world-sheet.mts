// The side-by-side sheet of a batch: one row per style, stills from its clips. npx tsx scripts/lyric-vj/world-sheet.mts --dir out/research/styles/clips --song nun --window 76-101 --out sheet.jpg dark-glitch neon-stage ...
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values: a, positionals: styles } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string' }, song: { type: 'string' }, window: { type: 'string' }, out: { type: 'string' }, at: { type: 'string', default: '3,7,11,15,19,23' } } });
const times = a.at!.split(',');
const inputs = styles.flatMap((s) => times.flatMap((t) => ['-ss', t, '-i', `${a.dir}/${s}-${a.song}/lyric-vj_vocal_${a.window}s.mp4`]));
const n = styles.length * times.length;
const f = `${Array.from({ length: n }, (_, i) => `[${i}:v]trim=end_frame=1,scale=320:-2,setpts=PTS-STARTPTS[v${i}]`).join(';')};${Array.from({ length: n }, (_, i) => `[v${i}]`).join('')}xstack=inputs=${n}:layout=${Array.from({ length: n }, (_, i) => `${(i % times.length) * 324}_${Math.floor(i / times.length) * 184}`).join('|')}:fill=gray[o]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', f, '-map', '[o]', '-frames:v', '1', '-q:v', '3', a.out!]);
console.log(a.out);
