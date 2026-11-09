// The frame check's calibration set (Q1 phase 3a): planned switches from the phase-2 measurement
// (out/research/q1-1109/wired.json, scheduler on, seed 0) with their two stable frames, labelled by hand, and the check
// scored against the labels.
//   extract: renders each picked event's job and writes calib/<id>/before.png, after.png (the frames with the words) and
//            frames.bin (the grey frames the check reads: on/off/bare before, then after, GRID bytes each)
//   score:   reads calib/labels.json ({ id: { label: realized|unrealized|unclear, why } }) and prints the agreement of
//            frame-change.mts at its SEEN thresholds; --tune searches the thresholds and prints the best few
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/q1-calib.mts extract|score [--tune] [--dir out/research/q1-1109/calib]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { frameChange, GRID, judge, SEEN, stableTimes } from './frame-change.mts';

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { dir: { type: 'string', default: 'out/research/q1-1109/calib' }, from: { type: 'string', default: 'out/research/q1-1109/wired.json' }, tune: { type: 'boolean', default: false } } });
const SONGS: Record<string, { db: string; plan: string }> = { fast: { db: 'yt_w_fCuUR3lEs', plan: 'nun' }, calm: { db: 'yt_5i50aTB7JFo', plan: 'snow' } };
/** The picked events: world, clip, switch time. A mix of the phase-2 check's unrealized and realized, every family. */
export const PICKS: [string, 'fast' | 'calm', number][] = [
  ['file', 'fast', 78.46], ['notebook', 'fast', 78.46], ['popart', 'calm', 68.56], ['art-deco', 'calm', 84.542],
  ['claymation', 'fast', 92.9], ['terminal', 'calm', 82.7], ['card', 'fast', 80.96], ['paper-lantern', 'fast', 95.96],
  ['embroidery', 'fast', 95.96], ['watercolor', 'calm', 74.92], ['scrapbook', 'fast', 98.6], ['notebook', 'fast', 92.84],
  ['blueprint', 'fast', 88.19], ['chalkboard', 'fast', 95.27], ['silk', 'fast', 90.56], ['gothic-lolita', 'fast', 92.84],
  ['papercut', 'fast', 92.84], ['dark-glitch', 'fast', 92.9], ['ukiyoe', 'fast', 91.626], ['chalkboard', 'fast', 80.96],
  ['woodcut', 'fast', 80.96], ['xerox', 'calm', 90.98], ['embroidery', 'calm', 78.94], ['watercolor', 'calm', 90.98],
  ['paper-lantern', 'calm', 91.997], ['card', 'fast', 98.6], ['riso', 'calm', 82.7], ['silk-cold', 'calm', 86.962],
];
const idOf = ([w, c, t]: (typeof PICKS)[number]) => `${w}-${c}-${t}`;
const N = GRID.w * GRID.h;

if (positionals[0] === 'extract') {
  const { freeJob } = await import('../../src/app/lyric-vj/free-plan');
  const { OFFERED_STYLES } = await import('../../src/app/lyric-vj/free-styles');
  const { framePage } = await import('./frame-page.mts');
  const wired = JSON.parse(readFileSync(a.from!, 'utf8')) as { rows: { world: string; window: string; wired: { frames: { at: number; kind: string; lineIds: string[]; realized: boolean; why: string }[] } }[] };
  const page = await framePage('.q1-calib-work');
  const index: Record<string, unknown> = {};
  for (const pick of PICKS) {
    const [world, clip, at] = pick;
    const f = wired.rows.find((r) => r.world === world && r.window === clip)?.wired.frames.find((x) => Math.abs(x.at - at) < 1e-3);
    if (!f) { console.error('not in', a.from, idOf(pick)); continue; }
    const s = SONGS[clip];
    const song = JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${s.plan}/meaning.json`, 'utf8'));
    const { job } = freeJob(song, { style: OFFERED_STYLES.find((x) => x.id === world)!, seed: 0, meaning, worldEvents: true });
    const p = await page.job(idOf(pick), job);
    const e = (job.treatment.worldEvents?.events ?? []).find((x) => x.kind !== 'keep' && Math.abs(x.at - at) < 1e-3);
    const times = e && stableTimes(e, await p.cues());
    if (!times) { console.error('no stable frames for', idOf(pick)); await p.close(); continue; }
    const dir = join(a.dir!, idOf(pick));
    mkdirSync(dir, { recursive: true });
    const bytes = new Uint8Array(N * 6);
    for (const [k, side, t] of [[0, 'before', times.before], [1, 'after', times.after]] as const) {
      const l = await p.layers(t, GRID.w, GRID.h, true);
      [l.on, l.off, l.bare].forEach((g, j) => bytes.set(g, (k * 3 + j) * N));
      const jpg = join(dir, `${side}.jpg`);
      writeFileSync(jpg, Buffer.from(l.jpeg!.split(',')[1], 'base64'));
      execSync(`sips -s format png -Z 960 ${jpg} --out ${join(dir, `${side}.png`)} >/dev/null && rm ${jpg}`);
    }
    writeFileSync(join(dir, 'frames.bin'), bytes);
    await p.close();
    index[idOf(pick)] = { world, clip, at, kind: f.kind, scope: e!.scope, lineIds: f.lineIds, before: times.before, after: times.after, phase2: { realized: f.realized, why: f.why } };
    console.error('extracted', idOf(pick));
  }
  await page.close();
  writeFileSync(join(a.dir!, 'index.json'), JSON.stringify({ commit: execSync('git rev-parse --short HEAD').toString().trim(), source: a.from, note: 'phase-2 events (scheduler on, seed 0); frames at frame-change.mts stableTimes (reading windows)', events: index }, null, 1));
}

if (positionals[0] === 'score') {
  const labels = Object.fromEntries(Object.entries(JSON.parse(readFileSync(join(a.dir!, 'labels.json'), 'utf8'))).filter(([k]) => !k.startsWith('_'))) as Record<string, { label: 'realized' | 'unrealized' | 'unclear'; why: string }>;
  const index = JSON.parse(readFileSync(join(a.dir!, 'index.json'), 'utf8')).events as Record<string, { scope: string; phase2: { realized: boolean } }>;
  const frames = Object.fromEntries(Object.keys(labels).filter((id) => existsSync(join(a.dir!, id, 'frames.bin'))).map((id) => {
    const b = readFileSync(join(a.dir!, id, 'frames.bin'));
    const g = (k: number) => Array.from(b.subarray(k * N, (k + 1) * N));
    return [id, { before: { on: g(0), off: g(1), bare: g(2) }, after: { on: g(3), off: g(4), bare: g(5) } }];
  }));
  const judged = Object.entries(labels).filter(([id, l]) => l.label !== 'unclear' && frames[id]);
  const read = Object.fromEntries(Object.keys(frames).map((id) => [id, frameChange(frames[id].before, frames[id].after, index[id]?.scope === 'in-line')]));
  const score = (seen: typeof SEEN) => judged.filter(([id, l]) => judge(read[id], seen).seen === (l.label === 'realized')).length;
  const rows = Object.entries(labels).map(([id, l]) => { const c = read[id]; return { id, label: l.label, check: c?.seen ? 'realized' : 'unrealized', phase2: index[id]?.phase2.realized ? 'realized' : 'unrealized', ...c }; });
  for (const r of rows) console.log([r.id.padEnd(28), r.label.padEnd(10), 'check', r.check.padEnd(10), 'phase2', r.phase2.padEnd(10), r.why].join('  '));
  const phase2 = judged.filter(([id, l]) => index[id]?.phase2.realized === (l.label === 'realized')).length;
  const out = { thresholds: SEEN, judged: judged.length, unclear: Object.values(labels).filter((l) => l.label === 'unclear').length, agree: score(SEEN), phase2Agree: phase2, rows };
  writeFileSync(join(a.dir!, 'score.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ judged: out.judged, unclear: out.unclear, agree: out.agree, phase2Agree: phase2 }));
  if (a.tune) {
    const tries: { seen: typeof SEEN; agree: number }[] = [];
    for (const shift of [0.04, 0.06, 0.08]) for (const scale of [1.4, 1.75, 2, 2.4]) for (const relation of [1.3, 1.6, 2, 9]) for (const page of [0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.15]) for (const onCarrier of [0.2, 0.5, 9]) { const seen = { shift, scale, relation, page, onCarrier }; tries.push({ seen, agree: score(seen) }); }
    tries.sort((x, y) => y.agree - x.agree);
    console.log(tries.slice(0, 12).map((t) => `${t.agree}/${judged.length} ${JSON.stringify(t.seen)}`).join('\n'));
  }
}
