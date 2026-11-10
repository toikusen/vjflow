// Lyrics really on screen while they should be read: the same frame with and without the lyric layer, at the middle and near
// the end of every line's readable time. A line that adds almost nothing to its frame is invisible, whatever the metrics say
// (dark words left on a dark ground after a line moved off its paper). No video written.
// The same moments are read against the shared reading rules (src/app/lyric-vj/reading-rules.ts): words cut by the frame,
// a dark plate under them, small words on an empty frame, the picture's lines under the strokes, ink under 4.5:1, and a
// soft glow laid behind them. Counts per world go to <out>/<worlds>.json; --baseline fails a world that got worse.
// The frame without the words keeps what they stand on (a card, a banner, a tape): only the glyphs are taken away, so a
// line on its own carrier is read against the carrier, not against the ground the carrier hides. This is the default
// since 2026-11-04: taking the carrier away with the words (the old way) read a dark word against the dark ground under
// its white card and reported false failures on carrier worlds (gameshow, idol-live, popart's balloons counted low).
// --strip-carriers: the old way, carrier and glyphs both removed; its counts are not comparable with the baseline.
// --shots <dir>: every flagged moment's full-size frame with and without its glyphs (<world>/<song>-<cue>-<t>.on|off|ground.jpg; ground: carriers taken away too) and
// its rule values (index.json), to look at what a count is made of.
// npx tsx --tsconfig tsconfig.json scripts/lyric-vj/style-gate-reading.mts --out out/research/styles/gate/reading [--songs nun,snow] [--baseline f.json] [--write-baseline f.json] [--strip-carriers] [--shots dir] terminal ink-wash
// (no worlds named: every world not held). The recorded counts: scripts/lyric-vj/style-gate-rules.baseline.json, every
// world including the held ones, 5 songs, seed 0 (rules a world's design owns: style-gate-rules.accepted.json), measured the default way (re-recorded 2026-11-04 after the carrier
// default, the call placer and the repeat-per-shot fix; a world's moments count rose where repeats now keep their shot).
// A world the composition scheduler takes over (VJ_WORLD_EVENTS=1) whose final draw does not match its event plan
// (world-events-adapter verifyWorldEvents, lightGapWarnings) fails the run: listed under `contract`, exit non-zero.
import { execSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { chromium, Page } from 'playwright';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { turnChecks } from '../../src/app/lyric-vj/world-events-adapter';
import { FREE_STYLES, HELD_WORLDS } from '../../src/app/lyric-vj/free-styles';
import { countMoment, emptyCounts, RuleCounts, RuleMoment, regressions } from '../../src/app/lyric-vj/reading-rules';
import { fontCache } from './font-cache.mts';

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'out/research/styles/gate/reading' }, songs: { type: 'string', default: 'nun,snow,tsuzuki,choroin,tenmon' }, seed: { type: 'string', default: '0' }, baseline: { type: 'string' }, 'write-baseline': { type: 'string' }, 'strip-carriers': { type: 'boolean', default: false }, shots: { type: 'string' } } });
if (!positionals.length) positionals.push(...FREE_STYLES.filter((s) => !HELD_WORLDS.has(s.id)).map((s) => s.id));
/** Share of a frame a line must change, and how hard, to count as there. */
export const READ = { minShare: 0.002, minDelta: 40 };
/**
 * A turn of ground inside a sung line (lineplan-core's turn, review 2026-11-10) is read just before it and once it has
 * landed: the words must keep at least `keep` of the pixels they changed before it (a carrier taken away leaves its white
 * row on cream: card 2161 → 430), and their share of solid ink under 4.5:1 may not rise past `low` while it rises by more
 * than `lowRise`. A turn that fails, or one the plan's own final check names (world-events-adapter turnChecks), fails
 * the run under `turns`.
 */
export const TURN = { before: 0.12, after: 0.2, keep: 0.7, low: 0.5, lowRise: 0.05 };
const [GW, GH] = [320, 180];
const work = join(a.out!, 'work', positionals.join('-').slice(0, 30));
mkdirSync(work, { recursive: true });
await esbuild.build({ entryPoints: ['src/app/lyric-vj/render/main.ts'], bundle: true, format: 'esm', target: 'es2022', outfile: join(work, 'render.js'), logLevel: 'warning' });
copyFileSync('scripts/lyric-vj/render.html', join(work, 'render.html'));
await esbuild.build({ entryPoints: ['scripts/lyric-vj/gate-page.mts'], bundle: true, format: 'iife', target: 'es2022', outfile: join(work, 'gate-page.js'), logLevel: 'warning' });
const ROOT = process.cwd();
const server = createServer((req, res) => {
  const asked = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  // the self-hosted fonts live in out/fonts and are asked for at /fonts/ (as in render.mts)
  const path = join(ROOT, asked.startsWith('/fonts/') ? join('out', asked) : asked);
  if (!existsSync(path)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const browser = await chromium.launch({ channel: 'chromium', args: ['--force-device-scale-factor=1', '--ignore-gpu-blocklist'] });
const getFont = fontCache(resolve('out/font-cache'));
/** One moment, read in the page (gate-page.mts): the reading measure, the rules and whether a soft clearing was drawn. */
const moment = (p: Page, t: number) => p.evaluate(`window.gatePage.moment(${t}, ${GW}, ${GH})`) as Promise<{ n: number; sum: number; x0: number; x1: number; y0: number; y1: number; rules?: RuleMoment; soft: boolean }>;
const fails: string[] = [];
/** Contract warnings of the worlds the scheduler took over (VJ_WORLD_EVENTS=1): the final draw against its event plan. */
const contract: string[] = [];
/** Turns of ground inside sung lines that take from the words (TURN), and how many were read. */
const turns: string[] = [];
let turnsRead = 0;
/** Camera moves a taken-over world dropped because they collided with a switch the song keeps (resolved, for the record). */
const camDrops: string[] = [];
/** A page-carried composition's page as the gate's frames drew it (render/page-layout.ts): checked, re-laid, fallen back whole, turned over, carrier covered, glyphs checked. */
const pageCounts = { frames: 0, relaid: 0, pageFallbackFrames: 0, pageTurnFrames: 0, carrierCoveredFrames: 0, glyphFrames: 0 };
const fill: number[] = [];
let checked = 0;
const counts: Record<string, RuleCounts> = {};
const moments: string[] = [];
const shots: unknown[] = [];
for (const id of positionals) {
  const style = FREE_STYLES.find((s) => s.id === id)!;
  for (const name of a.songs!.split(',')) {
    const song = JSON.parse(readFileSync(`out/db/${IDS[name]}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${name}/meaning.json`, 'utf8'));
    const { job, plan } = freeJob(song, { style, seed: Number(a.seed), meaning });
    const turnsAt = (plan as unknown as { shots: { cuts: { at?: number; repose?: boolean }[] }[] }).shots.flatMap((s) => s.cuts.filter((x) => x.repose).map((x) => Number(x.at)));
    turns.push(...turnChecks(job, style.world, turnsAt).map((w) => `${id} ${name} ${w.inputs[0]}: ${w.reason}`));
    // (a world the scheduler takes over must draw its plan as approved: any final-check warning is a broken contract)
    const table = job.treatment.worldEvents;
    if (table?.source === 'declared') contract.push(...table.warnings.filter((w) => w.reason.startsWith('final check')).map((w) => `${id} ${name} ${w.inputs.join(' / ')}: ${w.reason}`));
    // (phase 3b: a world camera still colliding with another switch in a taken-over world, as an input the plan could not
    // resolve, is a broken contract too: camera moves are scheduler inputs, dropped or failed, never just noted)
    if (table?.source === 'declared') contract.push(...table.warnings.filter((w) => !w.reason.startsWith('final check') && /world camera/.test(`${w.reason} ${w.inputs.join(' ')}`)).map((w) => `${id} ${name} unresolved camera overlap ${w.inputs.join(' / ')}: ${w.reason}`));
    camDrops.push(...(table?.camDrops ?? []).map((c) => `${id} ${name} ${c.kind}@${c.lineId}`));
    const file = join(work, `${id}-${name}.job.json`);
    writeFileSync(file, JSON.stringify({ ...job, live: true }));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.addInitScript({ path: join(work, 'gate-page.js') });
    if (!a['strip-carriers']) await page.addInitScript('window.__carriers = true');
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
      const font = await getFont(route.request().url(), route.request().headers()['user-agent'] ?? '');
      return font ? route.fulfill({ body: font.body, contentType: font.type, headers: { 'access-control-allow-origin': '*' } }) : route.abort();
    });
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/${relative(ROOT, resolve(work))}/render.html?job=/${relative(ROOT, resolve(file))}`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 200000 });
    const cues = await page.evaluate(() => window.vjMetrics().cues.map((c) => ({ id: c.id, from: c.readableFrom, to: c.readableTo, text: c.text })));
    for (const c of cues) {
      // the video's own ending fade takes the last line with it, in every style
      const ending = c === cues.at(-1);
      for (const t of ending ? [(c.from + c.to) / 2 - 1] : [(c.from + c.to) / 2, c.to - 0.08]) {
        const { n, sum, x0, x1, y0, y1, rules: r, soft } = await moment(page, t);
        const share = n / (GW * GH);
        checked++;
        if (share >= READ.minShare) fill.push(((x1 - x0) * (y1 - y0)) / (GW * GH));
        if (share < READ.minShare || sum / Math.max(1, n) < READ.minDelta) fails.push(`${id} ${name} ${c.id} ${t.toFixed(2)} share ${share.toFixed(4)} delta ${(sum / Math.max(1, n)).toFixed(0)} ${c.text.slice(0, 10)}`);
        if (!r) continue;
        const m = r;
        counts[id] = countMoment(counts[id] ?? emptyCounts(), m, soft);
        const why = [soft && 'glow', m.clip && 'clip', m.plate < 0 && 'plate', m.small && 'small', m.cross > 0.08 && `cross ${m.cross.toFixed(2)}`, m.low > 0.5 && `low ${m.low.toFixed(2)}`].filter(Boolean);
        if (why.length) moments.push(`${id} ${name} ${c.id} ${t.toFixed(2)} ${why.join(' ')} ${c.text.slice(0, 10)}`);
        if (why.length && a.shots) {
          const stem = `${name}-${c.id}-${t.toFixed(2)}`;
          mkdirSync(join(a.shots, id), { recursive: true });
          // on, off (carriers kept as the rules read them) and ground (carriers gone too)
          for (const [kind, on, carriers] of [['on', true, true], ['off', false, !a['strip-carriers']], ['ground', false, false]] as const) {
            const url = (await page.evaluate(`(window.vjLyrics(${on}, ${carriers}), window.grabAt(${t}, 0.9))`)) as string;
            writeFileSync(join(a.shots, id, `${stem}.${kind}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
          }
          await page.evaluate('window.vjLyrics(true)');
          shots.push({ world: id, song: name, cue: c.id, t, stem, why, text: c.text, rules: m });
        }
      }
    }
    // every turn of ground inside a sung line, read just before it and once it has landed (TURN)
    for (const c of cues) {
      const sc = (song.cues as { id: string; text: string; start: number; end: number; charStarts?: number[] }[]).find((x) => x.id === c.id);
      if (!sc) continue;
      const k = [...sc.text].findIndex((ch) => /[\p{L}\p{N}]/u.test(ch));
      const first = Math.max(sc.charStarts?.[Math.max(0, k)] ?? sc.start, c.from);
      for (const t of turnsAt.filter((x) => x > first + TURN.before && x < Math.min(sc.end, c.to) - TURN.after)) {
        const [p, q] = [await moment(page, t - TURN.before), await moment(page, t + TURN.after)];
        turnsRead++;
        const [lowP, lowQ] = [p.rules?.low ?? 0, q.rules?.low ?? 0];
        if (q.n < TURN.keep * p.n) turns.push(`${id} ${name} ${c.id} ${t.toFixed(2)} words ${p.n} → ${q.n} px after the turn`);
        if (lowQ > TURN.low && lowQ > lowP + TURN.lowRise) turns.push(`${id} ${name} ${c.id} ${t.toFixed(2)} low ${lowP.toFixed(2)} → ${lowQ.toFixed(2)} after the turn`);
      }
    }
    // (a page-carried scale composition's page is checked on every frame the gate draws, render/page-layout.ts: a frame
    // that breaks its contract is a broken contract here too)
    const pc = (await page.evaluate(() => (globalThis as { vjPageChecks?: Record<string, number> & { fails: string[] } }).vjPageChecks)) ?? undefined;
    if (pc) {
      for (const k of Object.keys(pageCounts) as (keyof typeof pageCounts)[]) pageCounts[k] += pc[k] ?? 0;
      contract.push(...pc.fails.map((f) => `${id} ${name} page: ${f}`));
      // (a carrier a page turn or a set piece painted over, the line up: a fault, not a count)
      if (pc['carrierCoveredFrames']) contract.push(`${id} ${name} page: ${pc['carrierCoveredFrames']} frame(s) with the re-laid carrier covered`);
    }
    await page.close();
    console.log(id, name, 'fails so far', fails.length);
  }
}
await browser.close();
server.close();
if (a.shots) writeFileSync(join(a.shots, `${positionals.join('-').slice(0, 40)}.index.json`), JSON.stringify(shots, null, 1));
const sorted = [...fill].sort((x, y) => x - y);
const out = { commit: execSync('git rev-parse --short HEAD').toString().trim(), scheduled: process.env['VJ_WORLD_EVENTS'] === '1', checked, pageChecks: pageCounts, contract, turnsRead, turns, camDrops, fails, fillMedian: +sorted[Math.floor(sorted.length / 2)].toFixed(3), fillP10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(3), rules: counts, ruleMoments: moments };
writeFileSync(join(a.out!, `${positionals.join('-').slice(0, 40)}.json`), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, fails: out.fails.length, contract: contract.length, turns: turns.length, ruleMoments: moments.length }), out.fails.slice(0, 6));
if (turns.length) console.log('turn faults', turns.length, turns.slice(0, 10));
if (contract.length) console.log('contract warnings', contract.length, contract.slice(0, 10));
// the rules against a world's recorded counts: a world that got worse on any rule fails
const worse: string[] = [];
if (a.baseline && existsSync(a.baseline)) {
  const base = JSON.parse(readFileSync(a.baseline, 'utf8')) as Record<string, RuleCounts>;
  for (const [id, c] of Object.entries(counts)) if (base[id]) for (const k of regressions(base[id], c)) worse.push(`${id}: ${k} ${c[k]}/${c.moments} (was ${base[id][k]}/${base[id].moments})`);
  console.log('rule regressions', worse.length, worse);
}
// a world's rule the owner accepted as its design (style-gate-rules.accepted.json, with the reason): still counted and
// still held to its baseline, named here so a high count is not read as an open problem
const accepted = JSON.parse(readFileSync('scripts/lyric-vj/style-gate-rules.accepted.json', 'utf8')) as Record<string, Record<string, string>>;
const named = Object.keys(counts).flatMap((id) => Object.keys(accepted[id] ?? {}).map((k) => `${id}: ${k} ${counts[id][k as keyof RuleCounts]}/${counts[id].moments} (accepted)`));
if (named.length) console.log('accepted', named);
if (a['write-baseline']) {
  const file = a['write-baseline'];
  const base = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, JSON.stringify({ ...base, ...counts }, null, 1) + '\n');
}
process.exitCode = fails.length || worse.length || contract.length || turns.length ? 1 : 0;
