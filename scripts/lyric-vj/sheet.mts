// Template contact sheet (QA): every lyric template rendered on a short, a medium and
// a long line of one song, one row per template, so a layout or typesetting change can be judged at a glance.
// npx tsx scripts/lyric-vj/sheet.mts --dir out/db/<id> --treatment <treatment.json> --assets <assets.json> --out <png>
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TEMPLATES } from '../../src/app/lyric-vj/templates';

const { values: a } = parseArgs({ options: { dir: { type: 'string' }, treatment: { type: 'string' }, assets: { type: 'string' }, out: { type: 'string' } } });
const song = JSON.parse(readFileSync(join(a.dir!, 'song.json'), 'utf8'));
const base = JSON.parse(readFileSync(a.treatment!, 'utf8'));
const tmp = join(a.dir!, 'sheet');
mkdirSync(tmp, { recursive: true });

// a short, a medium and a long line, each long enough on screen to be sampled settled
const lines = [...song.cues].filter((c) => c.end - c.start > 1.6).sort((x, y) => [...x.text].length - [...y.text].length);
const picks = [lines[0], lines[Math.floor(lines.length / 2)], lines[lines.length - 1]];
const times = picks.map((c) => +(c.start + Math.min(1.4, (c.end - c.start) * 0.6)).toFixed(2));
const rows: string[] = [];
for (const id of Object.keys(TEMPLATES).filter((x) => x !== 'title-card')) {
  const t = structuredClone(base);
  for (const s of t.shots) {
    if (s.template === 'title-card') continue;
    s.template = id;
    s.params = Object.fromEntries(Object.entries(TEMPLATES[id].params).map(([k, p]) => [k, p.default]));
    s.params['echo'] = undefined;
  }
  const file = join(tmp, `${id}.json`);
  writeFileSync(file, JSON.stringify(t));
  const dir = join(tmp, id);
  execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', join(a.dir!, 'song.json'), '--treatment', file, '--assets', a.assets!, '--start', '0', '--end', String(song.duration), '--unconfirmed', '--stills', times.join(','), '--out', dir], { stdio: 'ignore' });
  const row = join(tmp, `${id}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...times.flatMap((x) => ['-i', join(dir, `still_${x.toFixed(2)}.png`)]), '-filter_complex',
    `[0]scale=480:-1[a];[1]scale=480:-1[b];[2]scale=480:-1[c];[a][b][c]hstack=inputs=3`, row]);
  rows.push(row);
  console.log(id);
}
execFileSync('ffmpeg', ['-v', 'error', '-y', ...rows.flatMap((r) => ['-i', r]), '-filter_complex', `vstack=inputs=${rows.length}`, a.out!]);
console.log('sheet →', a.out, '(rows top to bottom:', Object.keys(TEMPLATES).filter((x) => x !== 'title-card').join(', '), ')');
