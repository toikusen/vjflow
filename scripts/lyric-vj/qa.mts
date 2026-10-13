// The design's frame check before the user's preview: up to 16 stills (an even spread plus choruses, drops and the longest lines) (render.mts measures them,
// visual-qa.ts); on a problem the director redoes the design once with the findings, and whichever version has fewer
// problems is kept. Never fails the song: the result is written to <dir>/visual-qa.json for the Studio page.
//
// npx tsx scripts/lyric-vj/qa.mts --song <song.json> --dir <studio dir>
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { sampleTimes } from '../../src/app/lyric-vj/visual-qa';

const { values: a } = parseArgs({ options: { song: { type: 'string' }, dir: { type: 'string' }, history: { type: 'string', default: 'out/design-history.json' } } });
const dir = a.dir!;
const song = JSON.parse(readFileSync(a.song!, 'utf8')) as Parameters<typeof sampleTimes>[1] & { duration: number };
const treatment = join(dir, 'treatment.json');
const manifest = existsSync(join(dir, 'assets.merged.json')) ? join(dir, 'assets.merged.json') : join(dir, 'assets', 'assets.json');
// read per check: the director's redo may move the drops
const times = () => sampleTimes(song.duration, song, (JSON.parse(readFileSync(treatment, 'utf8')).moments ?? []) as { kind: string; at: number }[]).map((t) => t.toFixed(2)).join(',');

/** Renders the stills and returns the frame problems, or null when the check itself failed (never read as a pass). */
function check(): string[] | null {
  const out = join(dir, 'qa');
  rmSync(out, { recursive: true, force: true });
  try {
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/render.mts', '--song', a.song!, '--treatment', treatment, '--assets', manifest, '--start', '0', '--end', song.duration.toFixed(2), '--stills', times(), '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    return (JSON.parse(readFileSync(join(out, 'check.json'), 'utf8')).visual as string[] | undefined) ?? [];
  } catch (e) {
    console.error(`畫面檢查沒有跑完：${(e as Error).message.slice(0, 200)}`);
    return null;
  }
}

const before = check();
let after: string[] | null | undefined;
let kept: 'first' | 'redo' = 'first';
if (before?.length) {
  console.log(`##STEP 畫面檢查發現 ${before.length} 個問題，請導演修正設計`);
  copyFileSync(treatment, `${treatment}.qa-first`);
  const notes = join(dir, 'qa-notes.txt');
  writeFileSync(notes, before.join('\n'));
  // the redo writes its own director.json: keep the song's director cost as the sum of both passes
  const costOf = () => (existsSync(join(dir, 'director.json')) ? Number(JSON.parse(readFileSync(join(dir, 'director.json'), 'utf8')).costUSD) || 0 : 0);
  const firstCost = costOf();
  const firstDirector = existsSync(join(dir, 'director.json')) ? readFileSync(join(dir, 'director.json'), 'utf8') : undefined;
  try {
    execFileSync('npx', ['tsx', 'scripts/lyric-vj/direct.mts', '--song', a.song!, '--start', '0', '--end', song.duration.toFixed(2), '--out', dir, '--design-only', `${treatment}.qa-first`, '--qa-notes', notes, '--history', a.history!], { stdio: ['ignore', 'inherit', 'inherit'] });
    after = check();
    // a redo whose check failed is unknown, not clean: keep the measured first version
    if (after && after.length < before.length) kept = 'redo';
  } catch (e) {
    console.error(`修正設計失敗，保留第一版：${(e as Error).message.slice(0, 200)}`);
  }
  // both passes were paid for, whichever is kept
  const redoCost = existsSync(join(dir, 'director.json')) && readFileSync(join(dir, 'director.json'), 'utf8') !== firstDirector ? costOf() : 0;
  if (kept === 'first') {
    copyFileSync(`${treatment}.qa-first`, treatment);
    if (firstDirector) writeFileSync(join(dir, 'director.json'), firstDirector);
  }
  const d = existsSync(join(dir, 'director.json')) ? JSON.parse(readFileSync(join(dir, 'director.json'), 'utf8')) : {};
  writeFileSync(join(dir, 'director.json'), JSON.stringify({ ...d, costUSD: +(firstCost + redoCost).toFixed(3) }, null, 1));
}
// no result file when the check never ran, so the batch step reruns it instead of resuming past it
if (before === null) {
  console.error('畫面檢查未完成：設計尚未驗收');
  process.exit(1);
}
writeFileSync(join(dir, 'visual-qa.json'), JSON.stringify({ before, after, kept, remaining: kept === 'redo' ? after : before }, null, 1));
console.log(JSON.stringify({ before, after, kept }));
