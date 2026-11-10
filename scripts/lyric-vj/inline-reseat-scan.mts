// A sung line keeps its seat, anchor, base size, line breaks and block from its first sung character to its end (owner
// 2026-11-10, cards no-inline-line-move and motivated-colour-pass): this scan counts the lines that break it. For every
// world line of every job it walks the sets the line is drawn in (its own `set`, then each `repose` switch) and lays the
// line in each (world-events-adapter seatIn: the renderer's own measure, render/layout-measure.ts). A switch that lands
// between the line's first sung character (charStarts, else its start) and its end is a text move when the words do not
// keep their box and type size (world-events sameWords); a switch where they do (an art-deco poster-panel carrier swap)
// is listed as carrier-only. Hold animations (line-grow, ink changes), grounds behind still words and Q4 handoffs at the
// seams are not set switches and are not read. 45 worlds x 5 songs (hold-plan-all's set) x seeds, scheduler off
// (today's product) and holds-first on (VJ_WORLD_EVENTS=1 through the `worldEvents` option).
// Each job is also read by the final check on the turns of ground kept inside lines (world-events-adapter turnChecks:
// page, carrier, ink at 4.5:1 and no worse), and `--paid` runs the paid director's composer on the named worlds (no
// director answer: every line its composer recipe, paid-world worldPoolOf / worldTreatment), the same counts.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/inline-reseat-scan.mts [--seeds 0,1,2] [--paths off,on] [--paid spy,card,chalkboard] [--out f.json]
import { readFileSync, writeFileSync } from 'node:fs';
const CODE = process.cwd();
const { freeJob } = await import(`${CODE}/src/app/lyric-vj/free-plan.ts`);
const { FREE_STYLES } = await import(`${CODE}/src/app/lyric-vj/free-styles.ts`);
const { seatIn, scheduledFaces, turnChecks } = await import(`${CODE}/src/app/lyric-vj/world-events-adapter.ts`);
const { composePlan, RECIPES } = await import(`${CODE}/src/app/lyric-vj/lineplan-core.ts`);
const { FREE_BASE, isCalm } = await import(`${CODE}/src/app/lyric-vj/free-plan.ts`);
const { worldById } = await import(`${CODE}/src/app/lyric-vj/style-worlds.ts`);
const { planWorldOf, worldBase, worldPoolOf, worldTreatment } = await import(`${CODE}/scripts/lyric-vj/paid-world.mts`);
const { sameWords } = await import(`${CODE}/src/app/lyric-vj/world-events.ts`);

const IDS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const arg = (k: string, d: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = arg('--seeds', '0,1,2').split(',').map(Number);
const PATHS = arg('--paths', 'off,on').split(',');
const OUT = arg('--out', '');
const PAID = arg('--paid', '').split(',').filter(Boolean);

interface Row { world: string; song: string; seed: number; path: string; cue: string; text: string; from: string; to: string; at: number; firstSung: number; end: number; move: boolean; material?: string }
const rows: Row[] = [];
const totals: Record<string, { jobs: number; lines: number; moved: number; carrierOnly: number; beforeSung: number; turns: number; turnFails: number }> = {};
const turnFails: { world: string; song: string; seed: number; path: string; id: string; why: string }[] = [];
const songs = Object.fromEntries(Object.entries(IDS).map(([n, id]) => [n, JSON.parse(readFileSync(`out/db/${id}/song.json`, 'utf8'))]));
const meanings = Object.fromEntries(Object.keys(IDS).map((n) => { try { return [n, JSON.parse(readFileSync(`out/research/instant/plans/${n}/meaning.json`, 'utf8'))]; } catch { return [n, undefined]; } }));

/** The paid director's composer on a world with no director answer, drawn the paid way (paid-world.mts). */
function paidJob(song: any, world: string, meaning: any) {
  const w = worldById(world)!;
  const calm = isCalm(song.cues);
  const pw = planWorldOf(w, song, calm, '', 'buyer');
  const { plan, shots } = composePlan(song, { ...(meaning ?? { ground: 'grain', reading: '', parts: [{ from: song.cues[0].id, tension: 0.5, fx: [], what: '' }], keys: [] }), palette: calm ? 'frost' : 'tea' }, calm, { director: true, world: worldPoolOf(pw) });
  const treatment = worldTreatment(song, plan as never, worldBase({ ...FREE_BASE() } as never, plan as never, shots, pw) as never, pw);
  return { job: { fps: 30, window: { start: 0, end: song.duration }, beats: song.beats, downbeats: song.downbeats, tempo: song.tempo, cues: song.cues, treatment, assets: {}, fonts: { family: 'Huninn' } } as any, plan };
}

const runs = [...PATHS.map((p) => ({ path: p, styles: FREE_STYLES, seeds: SEEDS })), ...(PAID.length ? [{ path: 'paid', styles: FREE_STYLES.filter((s: any) => PAID.includes(s.id)), seeds: [0] }] : [])];
for (const { path, styles, seeds } of runs) {
  const tot = (totals[path] = { jobs: 0, lines: 0, moved: 0, carrierOnly: 0, beforeSung: 0, turns: 0, turnFails: 0 });
  for (const st of styles) for (const name of Object.keys(IDS)) for (const seed of seeds) {
    const song = songs[name];
    const r = path === 'paid' ? paidJob(song, st.id, meanings[name]) : freeJob(song, { style: st, seed, meaning: meanings[name], font: 'Huninn', worldEvents: path === 'on' });
    const faces = scheduledFaces(r.job);
    tot.jobs += 1;
    const turnsAt: number[] = (r.plan as any).shots.flatMap((s: any) => s.cuts.filter((x: any) => x.repose).map((x: any) => Number(x.at)));
    tot.turns += turnsAt.length;
    for (const f of turnChecks?.(r.job, st.world, turnsAt) ?? []) { tot.turnFails += 1; turnFails.push({ world: st.id, song: name, seed, path, id: f.inputs[0], why: f.reason }); }
    for (const l of r.job.treatment.cues as any[]) {
      const c = song.cues.find((x: any) => x.id === l.cueId);
      const w = l.world;
      if (!c || !w) continue;
      tot.lines += 1;
      const chars = [...c.text];
      const k = chars.findIndex((ch) => /[\p{L}\p{N}]/u.test(ch));
      const firstSung = c.charStarts?.[Math.max(0, k)] ?? c.start;
      let here = w.set as string;
      let moved = false;
      for (const x of w.repose ?? []) {
        const move = !sameWords(seatIn(st.world, here, c.text, faces), seatIn(st.world, x.set, c.text, faces));
        if (x.at < firstSung) { tot.beforeSung += 1; here = x.set; continue; }
        if (x.at < c.end) {
          rows.push({ world: st.id, song: name, seed, path, cue: c.id, text: c.text, from: here, to: x.set, at: x.at, firstSung: +firstSung.toFixed(3), end: c.end, move, ...(x.move ? { material: x.move } : {}) });
          if (move) moved = true;
          else tot.carrierOnly += 1;
        }
        here = x.set;
      }
      if (moved) tot.moved += 1;
    }
  }
}
const byWorld: Record<string, Record<string, number>> = {};
for (const r of rows.filter((x) => x.move)) {
  byWorld[r.path] ??= {};
  byWorld[r.path][r.world] = (byWorld[r.path][r.world] ?? 0) + 1;
}
const spy = rows.filter((r) => r.world === 'spy' && r.song === 'snow' && r.path === 'off');
const report = { seeds: SEEDS, totals, movedSwitchesByWorld: byWorld, spySnowOff: { switches: spy.length, whileSung: spy.filter((r) => r.move).length }, turnFails, rows };
console.log(JSON.stringify({ seeds: SEEDS, totals, movedSwitchesByWorld: byWorld, spySnowOff: report.spySnowOff }, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
