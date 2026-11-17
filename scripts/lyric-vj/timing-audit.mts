// Timing audit (MERGE CHECKLIST: run before merging any change to line timing — show-time, sung-tail, line-shows,
// engine buildLine — and it must exit 0):
//   nice -n 19 npx tsx scripts/lyric-vj/timing-audit-synth.mts && nice -n 19 npx tsx --tsconfig tsconfig.json scripts/lyric-vj/timing-audit.mts --jobs scripts/lyric-vj/timing-audit.jobs.txt
// Every saved render job of the corpus (the linebox corpus, plus synthetic duets, same starts, tight rap and LRC lines
// with no character times) is laid out by the engine itself in the render page, every line built (live jobs too), and
// the timetable it settled (showFrom, exitAt, exitDur) is checked line by line:
//  (1) every sung character is readable while sung: the line is up and not leaving from its first sung character until
//      one character's time past its last (an untimed line may blink out over the last EXIT_MIN + lead of its stated
//      end), and READ_FLOOR after its show — no frame of slack;
//  (2) one seat never holds two lines: no two lines are up at once (every pair, a held line against the next shot's too),
//      but where the plan seats them apart (one shot whose layout holds the earlier: stack, couplet, world-pair) or a
//      handoff carries one into the next;
//  (3) no line vanishes: it shows before it leaves, and is up READ_FLOOR at least;
//  (4) the readable gate agrees: a line failing (1)–(3) is not ok in the engine's metrics.
// A frame (1/30 s) of slack throughout. Exit 1 on any fault or a job that does not load.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { fontCache } from './font-cache.mts';

/** The least a line is up (reading-window.ts READ_FLOOR), and an untimed line's blink at its end (EXIT_MIN + lead). */
const READ_FLOOR = 0.4, UNTIMED_BLINK = 0.1, FRAME = 1 / 30;
/**
 * The last sung character is read at least one character's time (sung-tail.ts MIN_TAIL: 12 a second); on a plan whose
 * lines a world event names, the composer's PLAN_TAIL (a frame and a little), the tail it paired and scheduled them on.
 */
const LAST_CHAR = 1 / 12, LAST_CHAR_PLANNED = 0.04;
/** Jobs known not to load in the page (linebox-audit.mts KNOWN_UNLOADABLE): skipped, never counted as a pass. */
const KNOWN_UNLOADABLE: Record<string, string> = { 'out/research/style-refs/phone/job.json': 'all 32 of its assets were deleted (404)' };

export interface TimedLine { id: string; text: string; start: number; end: number; charStarts?: number[]; showFrom: number; exitAt: number; exitDur: number; tail: string; ok: boolean; how?: string; shot?: string; hand?: boolean; shout?: boolean }

/** The faults of one job's settled timetable (invariants 1–4 above), lines in show order. */
export function timingFaults(lines: TimedLine[], lastChar = LAST_CHAR): string[] {
  const out: string[] = [];
  const bad = new Set<string>();
  const sorted = [...lines].sort((a, b) => a.showFrom - b.showFrom);
  for (const l of sorted) {
    const timed = !!l.charStarts?.length;
    const first = timed ? l.charStarts![0] : l.start;
    const last = timed ? l.charStarts![l.charStarts!.length - 1] + lastChar : l.end - UNTIMED_BLINK;
    const gone = l.exitAt + l.exitDur;
    if (l.showFrom > first + 1e-3) { out.push(`(1) ${l.id} shows at ${l.showFrom.toFixed(2)}, after its first sung character ${first.toFixed(2)}「${l.text}」`); bad.add(l.id); }
    if (l.exitAt < Math.max(last, l.showFrom + READ_FLOOR) - 1e-3) { out.push(`(1) ${l.id} leaves at ${l.exitAt.toFixed(2)}, before ${last >= l.showFrom + READ_FLOOR ? `its last sung character ${last.toFixed(2)}` : `its reading floor ${(l.showFrom + READ_FLOOR).toFixed(2)}`}「${l.text}」 (${l.how ?? ''})`); bad.add(l.id); }
    if (!(l.showFrom < l.exitAt) || gone - l.showFrom < READ_FLOOR - FRAME) { out.push(`(3) ${l.id} vanishes: shown ${l.showFrom.toFixed(2)}, leaving ${l.exitAt.toFixed(2)}, gone ${gone.toFixed(2)} (${l.how ?? ''})「${l.text}」`); bad.add(l.id); }
  }
  // (every two lines up at once, not only neighbours: allowed only where the plan seats them apart — one shot whose earlier
  // line its layout holds (stack, couplet, world-pair: tail 'exempt') — or where a handoff carries one into the other)
  for (let i = 0; i < sorted.length; i++) {
    for (let k = i + 1; k < sorted.length && sorted[k].showFrom < sorted[i].exitAt + sorted[i].exitDur - FRAME; k++) {
      const [a, b] = [sorted[i], sorted[k]];
      if (a.shout || b.shout) continue;
      if (a.shot !== undefined && a.shot === b.shot && a.tail === 'exempt') continue;
      if (b.hand && k === i + 1) continue;
      out.push(`(2) ${a.id} still up (gone ${(a.exitAt + a.exitDur).toFixed(2)}, ${a.how ?? ''}) when ${b.id} shows at ${b.showFrom.toFixed(2)} on its seat`);
      bad.add(a.id);
      bad.add(b.id);
    }
  }
  for (const id of bad) if (lines.find((l) => l.id === id)?.ok) out.push(`(4) ${id} breaks the timing rules but the readable gate passes it`);
  return out;
}

if (process.argv[1]?.endsWith('timing-audit.mts')) {
  const { values: a } = parseArgs({ options: { job: { type: 'string', multiple: true }, jobs: { type: 'string' } } });
  const ROOT = process.cwd();
  const jobFiles = [...(a.job ?? []), ...(a.jobs ? readFileSync(a.jobs, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')) : [])].map((f) => resolve(f.trim()));
  const work = resolve('out/research/timing-audit/page');
  mkdirSync(work, { recursive: true });
  await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
  copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
  const server = createServer((req, res) => { const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname); const path = asked.startsWith('/fonts/') ? join(ROOT, 'out', asked) : asked.startsWith('/@abs/') ? asked.slice(5) : join(ROOT, asked); if (!existsSync(path)) return void res.writeHead(404).end(); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' }); createReadStream(path).pipe(res); }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
  const getFont = fontCache(resolve('out/font-cache'));
  let faults = 0, failedJobs = 0, loadFailed = 0, lineCount = 0;
  const byRule = new Map<string, number>();
  for (const jobFile of jobFiles) {
    const rel = relative(ROOT, jobFile);
    if (!existsSync(jobFile)) { console.log(`FAIL ${rel}: missing`); loadFailed++; continue; }
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    let lines: TimedLine[];
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => { const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? ''); return font ? route.fulfill({ body: font.body, contentType: font.type }) : route.continue(); });
      // (the job without its pictures and clips: the timetable never reads them, and loading sixty clips per job made a
      // corpus run take an hour)
      const bare = join(work, 'job.json');
      writeFileSync(bare, JSON.stringify({ ...(JSON.parse(readFileSync(jobFile, 'utf8')) as Record<string, unknown>), assets: {} }));
      await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, work)}/render.html?job=/${relative(ROOT, bare)}`);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
      const ready = await page.evaluate('window.vjReady.then(() => "ok", (e) => String(e && e.stack || e))');
      if (ready !== 'ok') throw new Error(`setup failed: ${ready}`);
      // (every line built, a live job's too: the timetable is the engine's own, read off its lines)
      lines = (await page.evaluate(`(() => {
        const e = window.vjEngine;
        const lz = e.lazy;
        if (lz) lz.styled.forEach((x, i) => { if (!lz.built.has(i)) { lz.built.add(i); lz.build(x, i); } });
        const ok = new Map(window.vjMetrics().cues.map((c) => [c.id, c.ok]));
        return e.cueLayers.map(({ rt }) => ({ id: rt.cue.id, text: rt.cue.text, start: rt.cue.start, end: rt.cue.end, charStarts: rt.cue.charStarts, showFrom: rt.showFrom, exitAt: rt.exitAt, exitDur: rt.exitDur, tail: rt.tail ?? 'exempt', ok: ok.get(rt.cue.id) ?? true, shot: rt.style.shot, hand: !!rt.style.handoff, shout: !!rt.style.shout, how: [rt.shot.template, rt.style.exit, rt.tail, ...(rt.adjust ?? []), rt.style.handoff?.kind ?? '', e.lazy ? 'live' : ''].filter(Boolean).join('/') }));
      })()`)) as TimedLine[];
    } catch (e) {
      const known = KNOWN_UNLOADABLE[rel];
      console.log(`${known ? 'skip (known)' : 'FAIL'} ${rel}: did not load (${(e as Error).message.split('\n')[0]})${known ? `: ${known}` : ''}${errors.length ? ` — page errors: ${errors.slice(0, 2).join(' | ').slice(0, 300)}` : ''}`);
      if (!known) loadFailed++;
      await page.close();
      continue;
    }
    await page.close();
    lineCount += lines.length;
    if (process.env['TA_DEBUG']) for (const id of process.env['TA_DEBUG'].split(',')) console.log('debug', JSON.stringify(lines.find((l) => l.id === id)));
    const f = timingFaults(lines, (JSON.parse(readFileSync(jobFile, 'utf8')) as { treatment?: { worldEvents?: unknown } }).treatment?.worldEvents ? LAST_CHAR_PLANNED : LAST_CHAR);
    for (const x of f) byRule.set(x.slice(0, 3), (byRule.get(x.slice(0, 3)) ?? 0) + 1);
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${rel}: ${lines.length} lines${f.length ? `, ${f.length} faults` : ''}`);
    for (const x of f.slice(0, 6)) console.log(`     ${x}`);
    faults += f.length;
    if (f.length) failedJobs++;
  }
  console.log(`timing audit: ${jobFiles.length} jobs, ${lineCount} lines, ${loadFailed} failed to load, ${failedJobs} with faults, ${faults} faults (${[...byRule].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
  await browser.close();
  server.close();
  process.exit(faults || loadFailed ? 1 : 0);
}
