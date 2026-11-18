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
//  (4) the readable gate agrees: a line failing (1)–(3) is not ok in the engine's metrics;
//  (5) no readable glyph of a line set together (two voices) is under REST_FLOOR at rest, just before it leaves;
//  (6) a line set together carries at most three voices, each genuinely sung over an earlier one (or two quick lines,
//      setTogether; or a line too short to read before the next) — never a cascade;
//  (7) no single-seat line stays up more than LINGER_MAX (1 s, the longest exit) past its last sung character while
//      another shot's line is sung.
// A frame (1/30 s) of slack throughout. Exit 1 on any fault or a job that does not load.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium } from 'playwright';
import { fontCache } from './font-cache.mts';
import { namedLines } from '../../src/app/lyric-vj/render/world-named';
import { setTogether } from '../../src/app/lyric-vj/render/reading-window';

/** The least a line is up (reading-window.ts READ_FLOOR), and an untimed line's blink at its end (EXIT_MIN + lead). */
const READ_FLOOR = 0.4, UNTIMED_BLINK = 0.1, FRAME = 1 / 30;
/** How long a line may stay up past its last sung character while another shot's line is sung: the longest exit, a 1 s fade. */
const LINGER_MAX = 1.0;
/** A line's sung times as the engine reads them — the audit's own copy of sung-tail.ts sungTimes, so older commits are judged by the same rule: none where charTimed is false or the times never move; finite times clamped into [start − 0.25, end]. */
type Sung = { start: number; end: number; charStarts?: number[]; charTimed?: boolean; voices?: Sung[] };
const sungTimes = (c: Sung) => { if (c.charTimed === false || !c.charStarts?.length) return undefined; const ts = c.charStarts.filter(Number.isFinite).map((t) => Math.min(c.end, Math.max(c.start - 0.25, t))); return !ts.length || (ts.length > 1 && Math.max(...ts) - Math.min(...ts) < 1e-6) ? undefined : ts; };
const lastSungOf = (c: Sung): number => (c.voices?.length ? Math.max(...c.voices.map(lastSungOf)) : (sungTimes(c) ?? [c.end]).reduce((x, y) => Math.max(x, y), -Infinity));
const firstSungOf = (c: Sung): number => (c.voices?.length ? Math.min(...c.voices.map(firstSungOf)) : (sungTimes(c) ?? [c.start]).reduce((x, y) => Math.min(x, y), Infinity));
const isTimed = (c: Sung): boolean => (c.voices?.length ? c.voices.some(isTimed) : !!sungTimes(c));
/** The least type a line rests at (reading-window.ts REST_FLOOR, px on the 1080 frame). */
const REST_FLOOR = 52;
/**
 * The last sung character is read at least one character's time (sung-tail.ts MIN_TAIL: 12 a second); on a plan whose
 * line a world event acts on, the composer's PLAN_TAIL (a frame and a little), the tail it paired and scheduled them on.
 */
const LAST_CHAR = 1 / 12, LAST_CHAR_PLANNED = 0.04;
/** Jobs known not to load in the page (linebox-audit.mts KNOWN_UNLOADABLE): skipped, never counted as a pass. */
const KNOWN_UNLOADABLE: Record<string, string> = { 'out/research/style-refs/phone/job.json': 'all 32 of its assets were deleted (404)' };

export interface TimedLine { id: string; text: string; start: number; end: number; charStarts?: number[]; charTimed?: boolean; showFrom: number; exitAt: number; exitDur: number; tail: string; ok: boolean; how?: string; rest?: number; voices?: { id: string; start: number; end: number; text: string; charStarts?: number[]; charTimed?: boolean }[]; shot?: string; hand?: boolean; shout?: boolean }

/** The faults of one job's settled timetable (invariants 1–4 above), lines in show order. */
export function timingFaults(lines: TimedLine[], lastCharOf: (id: string) => number = () => LAST_CHAR): string[] {
  const out: string[] = [];
  const bad = new Set<string>();
  const sorted = [...lines].sort((a, b) => a.showFrom - b.showFrom);
  for (const l of sorted) {
    const timed = isTimed(l);
    const first = firstSungOf(l);
    // (the latest sung character: a duet set together lists its voices one after the other, not in time)
    // (a time past the line's end is an alignment stray, not a sung character: sung-tail.ts lastSungChar)
    // (the last sung character is up one character's time — a line sung sooner after it shares the frame with it, never
    // a last character shown for no time: opus review of 0589e8a)
    // (voice by voice: a timed voice's last character and one character's time, an untimed voice's blink at its end)
    const needOf = (v: Sung): number => (v.voices?.length ? Math.max(...v.voices.map(needOf)) : sungTimes(v) ? lastSungOf(v) + lastCharOf(l.id) : v.end - UNTIMED_BLINK);
    const last = needOf(l);
    const gone = l.exitAt + l.exitDur;
    if (l.showFrom > first + 1e-3) { out.push(`(1) ${l.id} shows at ${l.showFrom.toFixed(2)}, after its first sung character ${first.toFixed(2)}「${l.text}」`); bad.add(l.id); }
    if (l.exitAt < Math.max(last, l.showFrom + READ_FLOOR) - 2e-3) { out.push(`(1) ${l.id} leaves at ${l.exitAt.toFixed(2)}, before ${last >= l.showFrom + READ_FLOOR ? `its last sung character ${last.toFixed(2)}` : `its reading floor ${(l.showFrom + READ_FLOOR).toFixed(2)}`}「${l.text}」 (${l.how ?? ''})`); bad.add(l.id); }
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
  // (6) a line set together carries two voices, three only where they sound at once, and only voices genuinely sung over
  // one another (or two quick lines too fast to read apart, reading-window.ts setTogether): never a cascade of rap lines
  // each sung after the last (Tokyo Drift's six-line block, 2026-11-18)
  const lastOf = lastSungOf;
  const firstOf = firstSungOf;
  for (const l of sorted) {
    const vs = l.voices ?? [];
    if (vs.length < 2) continue;
    // (three where a voice is sung over both others in turn — a long first voice over two short ones — never more)
    if (vs.length > 3) { out.push(`(6) ${l.id} sets ${vs.length} lines together「${l.text}」`); bad.add(l.id); }
    for (let k = 1; k < vs.length; k++) {
      const v = vs[k];
      const over = vs.slice(0, k).some((u) => firstOf(v) < (sungTimes(u) ? lastOf(u) + LAST_CHAR : u.end - UNTIMED_BLINK));
      // (or the earlier line is too short to be read before the next is sung: under READ_FLOOR from its start)
      const quick = vs.slice(0, k).some((u) => setTogether(u, v) || firstOf(v) < u.start + READ_FLOOR);
      if (!over && !quick) { out.push(`(6) ${l.id} sets ${v.id} together with it with no voice sung over another「${l.text}」`); bad.add(l.id); }
    }
  }
  // (7) no line stays up more than LINGER_MAX past its last sung character while a line of another shot is being sung —
  // the longest exit is a 1 s fade (engine.ts fadeSec), so past that the old line stands over the new one's reading
  for (const l of sorted) {
    // (a single-seat line: a layout that holds its earlier lines while the next arrive — stack, couplet, vertical, a
    // world-pair: 'exempt' — is held by design; its own lingering is docs/backlog/timing-2026-11-17.md item 7)
    if (l.shout || l.tail === 'exempt') continue;
    const gone = l.exitAt + l.exitDur;
    const last = lastSungOf(l);
    if (gone <= last + LINGER_MAX) continue;
    const over = sorted.find((m) => m !== l && !m.shout && m.shot !== l.shot && firstOf(m) < gone && lastOf(m) > last + LINGER_MAX);
    if (over) { out.push(`(7) ${l.id} stays up to ${gone.toFixed(2)}, ${(gone - last).toFixed(2)} s past its last sung character, while ${over.id} is sung (${l.how ?? ''})「${l.text}」`); bad.add(l.id); }
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
  let faults = 0, failedJobs = 0, loadFailed = 0, lineCount = 0, smallOther = 0;
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
        return e.cueLayers.map(({ rt }) => ({ id: rt.cue.id, text: rt.cue.text, start: rt.cue.start, end: rt.cue.end, charStarts: rt.cue.charStarts, charTimed: rt.cue.charTimed, showFrom: rt.showFrom, exitAt: rt.exitAt, exitDur: rt.exitDur, tail: rt.tail ?? 'exempt', ok: ok.get(rt.cue.id) ?? true, voices: rt.cue.voiceCues && rt.cue.voiceCues.map((v) => ({ id: v.id, start: v.start, end: v.end, text: v.text, charStarts: v.charStarts, charTimed: v.charTimed })), rest: e.rests?.get(rt.cue.id), shot: rt.style.shot, hand: !!rt.style.handoff, shout: !!rt.style.shout, how: [rt.shot.template, rt.style.exit, rt.tail, ...(rt.adjust ?? []), rt.style.handoff?.kind ?? '', e.lazy ? 'live' : ''].filter(Boolean).join('/') }));
      })()`)) as TimedLine[];
    } catch (e) {
      const known = KNOWN_UNLOADABLE[rel];
      console.log(`${known ? 'skip (known)' : 'FAIL'} ${rel}: did not load (${(e as Error).message.split('\n')[0]})${known ? `: ${known}` : ''}${errors.length ? ` — page errors: ${errors.slice(0, 2).join(' | ').slice(0, 300)}` : ''}`);
      if (!known) loadFailed++;
      await page.close();
      continue;
    }
    // (5) no readable glyph of a line under REST_FLOOR at rest (a duet set together fitted to the frame
    // went to 49 px): the em box of every glyph drawn at a readable opacity
    // (on lines set together — two voices in one line, its text not the cue's own — the merge's own rule; other lines' sizes
    // are their templates', counted apart: docs/backlog/timing-2026-11-17.md)
    const small: string[] = [];
    const own = new Map((JSON.parse(readFileSync(jobFile, 'utf8')) as { cues: { id: string; text: string }[] }).cues.map((c) => [c.id, c.text]));
    for (const l of lines) {
      // (at rest: just before it leaves, every word revealed and settled — a word popping in is not yet read)
      const t = +Math.max(l.showFrom + 0.3, Math.min(l.exitAt, l.end + 0.3) - 0.1).toFixed(3);
      const g = (await page.evaluate(`window.vjFrame(${t}).then(() => (window.vjGlyphs().find((x) => x.id === ${JSON.stringify(l.id)})?.glyphs ?? []).filter((x) => x.a >= 0.5 && !x.preview).map((x) => x.y1 - x.y0))`)) as number[];
      // (the engine's own rest size where it keeps one — restSize, the size the type floor is held to; small kana set at the
      // design's kana scale are below it by design — else the tallest glyph drawn)
      const least = l.rest ?? (g.length ? Math.max(...g) : Infinity);
      if (least >= REST_FLOOR - 1) continue;
      // (set together: its text runs past its own cue's — a second voice appended)
      if (own.get(l.id) === undefined || [...l.text.replace(/\s/g, '')].length <= [...own.get(l.id)!.replace(/\s/g, '')].length + 1) { smallOther++; continue; }
      small.push(`(5) ${l.id} reads at ${Math.round(least)} px at ${t.toFixed(2)} s, under REST_FLOOR ${REST_FLOOR} (${l.how ?? ''})「${l.text}」`);
    }
    if (process.env['TA_DEBUG']) console.log('debug-page', JSON.stringify(await page.evaluate(`(() => { const e = window.vjEngine; return ${JSON.stringify(process.env['TA_DEBUG'].split(','))}.map((id) => { const c = e.cueLayers.find((x) => x.rt.cue.id === id); return c && { id, floored: e.floored.has(id), voices: c.rt.cue.voices, fit: c.fitScale, params: c.rt.params && c.rt.params.floor, waits: e.waits.filter((w) => w.id === id), overlaps: e.overlaps.filter((o) => o.id === id || o.next === id), first: c.rt.cue.charStarts && Math.min(...c.rt.cue.charStarts.filter(Number.isFinite)) }; }); })()`)));
    await page.close();
    lineCount += lines.length;
    if (process.env['TA_DEBUG']) for (const id of process.env['TA_DEBUG'].split(',')) console.log('debug', JSON.stringify(lines.find((l) => l.id === id)));
    // (per line: a line a world event acts on is read at the composer's tail, world-named.ts)
    const named = namedLines((JSON.parse(readFileSync(jobFile, 'utf8')) as { treatment: { worldEvents?: unknown } }).treatment);
    const f = [...timingFaults(lines, (id) => (named.has(id) ? LAST_CHAR_PLANNED : LAST_CHAR)), ...small];
    for (const x of f) byRule.set(x.slice(0, 3), (byRule.get(x.slice(0, 3)) ?? 0) + 1);
    console.log(`${f.length ? 'FAIL' : 'ok  '} ${rel}: ${lines.length} lines${f.length ? `, ${f.length} faults` : ''}`);
    for (const x of f.slice(0, 6)) console.log(`     ${x}`);
    faults += f.length;
    if (f.length) failedJobs++;
  }
  console.log(`timing audit: ${jobFiles.length} jobs, ${lineCount} lines, ${loadFailed} failed to load, ${failedJobs} with faults, ${faults} faults (${[...byRule].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}); ${smallOther} unmerged lines under REST_FLOOR (backlog)`);
  await browser.close();
  server.close();
  process.exit(faults || loadFailed ? 1 : 0);
}
