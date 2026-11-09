// Q1 phase 4 step 3 (docs/research/2026-11-10-q1-phase4b.md): measure-world-events.mts runs read back by world group, as
// Codex's phase-4 ruling asks them reported apart (docs/research/2026-11-10-phase4-codex.md §1): the original five, the
// eight new worlds (riso, silk, file, card, spy declared here; popart, midcentury, screentone not yet, so measured as they
// stand), the thirteen together against the targets (fast 4.0 / calm 4.8 per 10 s, plan level, proportional-time
// boundaries excluded), and all 45. Also each world's count with the scheduler off (today's product), read on the same
// job with the composer's proportional reposes excluded the same way, so on and off compare on one rule.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/phase4b-groups.mts --runs a.json,b.json[,frames.json] [--base x.json] --out out/research/q1-1109/phase4b.json
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { countCuts } from '../../src/app/lyric-vj/world-events';

const ORIGINAL = ['blueprint', 'chalkboard', 'document', 'notebook', 'art-deco'];
const EIGHT = ['riso', 'silk', 'file', 'card', 'spy', 'popart', 'midcentury', 'screentone'];
const DONE = EIGHT.slice(0, 5);
const TARGET = { fast: 4.0, calm: 4.8 };
const WINDOWS: Record<string, { song: string; db: string; window: [number, number] }> = { fast: { song: 'nun', db: 'yt_w_fCuUR3lEs', window: [76, 101] }, calm: { song: 'snow', db: 'yt_5i50aTB7JFo', window: [67, 92] } };

const { values: a } = parseArgs({ options: { runs: { type: 'string' }, frames: { type: 'string' }, base: { type: 'string' }, out: { type: 'string' } } });
type Row = Record<string, any>;
const load = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as { commit: string; rows: Row[] };
const runs = (a.runs ?? '').split(',').filter(Boolean).map(load);
const frames = a.frames ? load(a.frames) : undefined;
const base = a.base ? load(a.base) : undefined;
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const per10 = (n: number, w: [number, number]) => +((n * 10) / (w[1] - w[0])).toFixed(2);

// today's product (freeJob with no option: the declared-off table), its given reposes at proportional times excluded
const off = new Map<string, number>();
for (const [name, w] of Object.entries(WINDOWS)) {
  const song = JSON.parse(readFileSync(`out/db/${w.db}/song.json`, 'utf8'));
  const meaning = JSON.parse(readFileSync(`out/research/instant/plans/${w.song}/meaning.json`, 'utf8'));
  for (const style of OFFERED_STYLES) {
    const f = freeJob(song, { style, seed: 0, meaning });
    const es = (f.treatment.worldEvents?.events ?? []).filter((e) => !e.unreliableBoundary && !e.holdLevel);
    off.set(`${name}/${style.id}`, per10(countCuts(es, w.window).cuts, w.window));
  }
}

const group = (rows: Row[], ids: string[] | undefined, win: string, f: (r: Row) => number) => median(rows.filter((r) => r['window'] === win && (!ids || ids.includes(r['world']))).map(f));
const groups = { original5: ORIGINAL, new5: DONE, eight: EIGHT, thirteen: [...ORIGINAL, ...EIGHT], all45: undefined };
const summarise = (rows: Row[], o: { withOff?: boolean } = {}) => Object.fromEntries(Object.entries(groups).map(([g, ids]) => [g, Object.fromEntries(Object.keys(WINDOWS).map((win) => [win, {
  worlds: rows.filter((r) => r['window'] === win && (!ids || ids.includes(r['world']))).length,
  medianWiredPlanExclUnreliable: group(rows, ids, win, (r) => r['wired'].planExclUnreliablePer10),
  medianWiredPlan: group(rows, ids, win, (r) => r['wired'].planCutsPer10),
  medianBefore: group(rows, ids, win, (r) => r['before'].planCutsPer10),
  ...(o.withOff ? { medianOffExclUnreliable: group(rows, ids, win, (r) => off.get(`${win}/${r['world']}`) ?? 0) } : {}),
  ...(rows.some((r) => r['wired'].verifiedCompositionCutsPer10 !== undefined) ? { medianVerified: group(rows.filter((r) => r['wired'].verifiedCompositionCutsPer10 !== undefined), ids, win, (r) => r['wired'].verifiedCompositionCutsPer10) } : {}),
  ...(g === 'thirteen' ? { target: TARGET[win as keyof typeof TARGET] } : {}),
}]))]));

const bySeed = runs.map((r) => ({ commit: r.commit, seed: r.rows[0]?.['seed'], groups: summarise(r.rows, { withOff: r.rows[0]?.['seed'] === 0 }) }));
const seed0 = runs.find((r) => r.rows[0]?.['seed'] === 0)!;
const worlds = [...ORIGINAL, ...EIGHT].map((id) => ({
  world: id, declared: [...ORIGINAL, ...DONE].includes(id),
  ...Object.fromEntries(Object.keys(WINDOWS).map((win) => {
    const r = seed0.rows.find((x) => x['world'] === id && x['window'] === win)!;
    const fr = frames?.rows.find((x) => x['world'] === id && x['window'] === win);
    const b = base?.rows.find((x) => x['world'] === id && x['window'] === win);
    return [win, {
      offExclUnreliable: off.get(`${win}/${id}`), planExclUnreliable: r['wired'].planExclUnreliablePer10, plan: r['wired'].planCutsPer10, byKind: r['wired'].byKind,
      ...(b ? { base36ExclUnreliable: b['wired'].planExclUnreliablePer10 } : {}),
      contract: r['contract'].length, unlaid: r['wired'].unlaid.length,
      ...(fr ? { unrealized: fr['wired'].unrealized, outlineOnly: fr['wired'].outlineOnly, verified: fr['wired'].verifiedCompositionCutsPer10 } : {}),
    }];
  })),
}));
const out = {
  commit: execSync('git rev-parse --short HEAD').toString().trim(),
  note: 'plan level per 10 s on 雙截棍 76–101 (fast) and 三年後的大雪 67–92 (calm); headline medianWiredPlanExclUnreliable (proportional-time boundaries excluded); eight = riso, silk, file, card, spy (declared, phase 4b) + popart, midcentury, screentone (not declared yet: wired = off); off = freeJob with no option (today), its reposes at proportional times excluded; base36 = the same measure at 36cc9b4 (3c code) on today\'s meaning caches; verified/unrealized only with --frames (frame check calibrated on 28 Claude-labelled events: provisional)',
  runs: runs.map((r) => r.commit), frames: frames?.commit, base: base ? { commit: base.commit, groups: summarise(base.rows) } : undefined,
  bySeed, worlds,
  contract: runs.flatMap((r) => r.rows.flatMap((x) => [...x['contract'], ...x['wired'].unlaid.map((t: number) => `unlaid ${t}`)].map((c: string) => `${x['world']} ${x['window']} seed ${x['seed']}: ${c}`))),
};
if (a.out) writeFileSync(a.out, JSON.stringify(out, null, 1));
console.log(JSON.stringify(bySeed.map((s) => ({ seed: s.seed, ...Object.fromEntries(Object.entries(s.groups).map(([g, v]) => [g, Object.fromEntries(Object.entries(v).map(([w, x]) => [w, [x.medianWiredPlanExclUnreliable, (x as { medianOffExclUnreliable?: number }).medianOffExclUnreliable]]))])) }))));
for (const w of worlds) console.log(w.world.padEnd(12), w.declared ? 'on ' : '   ', 'fast', JSON.stringify(w['fast' as never]), '\n             calm', JSON.stringify(w['calm' as never]));
