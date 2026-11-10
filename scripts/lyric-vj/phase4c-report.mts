// Q1 phase 4c (docs/research/2026-11-10-q1-phase4c.md): the joint-contract run of measure-world-events.mts --joint read
// back by the frozen groups (phase4-groups.mts) beside phase 4b (phase4b.json, and the same run's own scheduler-on,
// joint-off column), with each segment's supply cap first, then the realised density, the per-line outcomes, the holds
// drawn on either side, and the full-song Q2 tallies (hold-plan-all.mts, joint off and on).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/phase4c-report.mts --raw out/research/q1-1109/phase4c-raw.json --b out/research/q1-1109/phase4b.json --planall-off …/planall-4c-off.json --planall …/planall-4c.json --out out/research/q1-1109/phase4c.json
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { GROUPS, THIRTEEN, TARGET_13 } from './phase4-groups.mts';

const { values: a } = parseArgs({ options: { raw: { type: 'string' }, b: { type: 'string' }, 'planall-off': { type: 'string' }, planall: { type: 'string' }, out: { type: 'string' } } });
type Row = Record<string, any>;
const raw = JSON.parse(readFileSync(a.raw!, 'utf8')) as { commit: string; seeds: number[]; rows: Row[] };
const b = JSON.parse(readFileSync(a.b!, 'utf8')) as { commit: string; bySeed: { seed: number; groups: Record<string, Record<string, Row>> }[] };
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const add = (acc: Record<string, number>, x: Record<string, number>) => { for (const [k, v] of Object.entries(x)) acc[k] = (acc[k] ?? 0) + v; return acc; };
const ids: Record<string, readonly string[] | undefined> = { five: GROUPS.five, eight: GROUPS.eight, thirteen: THIRTEEN, all45: undefined };
const bName: Record<string, string> = { five: 'original5', eight: 'eight', thirteen: 'thirteen', all45: 'all45' };
const windows = ['fast', 'calm'];

const groups = Object.fromEntries(Object.entries(ids).map(([g, list]) => [g, Object.fromEntries(raw.seeds.map((seed) => [seed, Object.fromEntries(windows.map((w) => {
  const rs = raw.rows.filter((r) => r['seed'] === seed && r['window'] === w && (!list || list.includes(r['world'])));
  const b4 = b.bySeed.find((x) => x.seed === seed)?.groups[bName[g]]?.[w];
  return [w, {
    worlds: rs.length,
    // (supply first: the most composition switches the segment's lines and boundaries could carry, one a line)
    supplyCapPer10: { median: median(rs.map((r) => r['joint'].supply.capPer10)), min: Math.min(...rs.map((r) => r['joint'].supply.capPer10)), max: Math.max(...rs.map((r) => r['joint'].supply.capPer10)) },
    medianJointPlanExclUnreliable: median(rs.map((r) => r['joint'].planExclUnreliablePer10)),
    medianWiredPlanExclUnreliable: median(rs.map((r) => r['wired'].planExclUnreliablePer10)),
    phase4b: b4 ? { commit: b.commit, medianWiredPlanExclUnreliable: b4['medianWiredPlanExclUnreliable'] } : undefined,
    outcomes: rs.reduce((acc, r) => add(acc, r['joint'].outcomes), {} as Record<string, number>),
    holdsDrawn: { joint: rs.reduce((n, r) => n + r['joint'].holdsDrawn, 0), wired: rs.reduce((n, r) => n + r['joint'].holdsDrawnWired, 0), committed: rs.reduce((n, r) => n + r['joint'].selected, 0) },
    ...(g === 'thirteen' ? { target: TARGET_13[w as 'fast' | 'calm'] } : {}),
  }];
}))]))]));

const segments = Object.fromEntries(windows.map((w) => [w, raw.rows.filter((r) => r['seed'] === 0 && r['window'] === w && THIRTEEN.includes(r['world'])).map((r) => ({ world: r['world'], lines: r['joint'].supply.lines, supplyCap: r['joint'].supply.cap, supplyCapPer10: r['joint'].supply.capPer10, joint: r['joint'].planExclUnreliablePer10, wired: r['wired'].planExclUnreliablePer10, holds: `${r['joint'].holdsDrawnWired} → ${r['joint'].holdsDrawn}`, outcomes: r['joint'].outcomes }))]));
// (art-deco on its own: once the one world allowed an entrance plus one in-line reseat, Codex r3 §4; withdrawn by pairs B, one a line)
const artDeco = Object.fromEntries(raw.seeds.map((seed) => [seed, Object.fromEntries(windows.map((w) => { const r = raw.rows.find((x) => x['seed'] === seed && x['window'] === w && x['world'] === 'art-deco'); return [w, r && { supply: r['joint'].supply, joint: r['joint'].planExclUnreliablePer10, wired: r['wired'].planExclUnreliablePer10, byKind: r['joint'].byKind, outcomes: r['joint'].outcomes, twoActionLines: r['joint'].twoActionLines, holds: `${r['joint'].holdsDrawnWired} → ${r['joint'].holdsDrawn}` }]; }))]));
const contract = raw.rows.flatMap((r) => (r['joint']?.contract ?? []).map((x: string) => `${r['world']} ${r['window']} seed ${r['seed']}: ${x}`));
const q2 = (f?: string) => { if (!f) return undefined; const d = JSON.parse(readFileSync(f, 'utf8')); return { commit: d.commit, joint: d.joint, coverage: d.coverage, split: d.split, outcomes: d.outcomes, selectedHoldRealization: d.selectedHoldRealization, primaryCoverage: d.primaryCoverage, ...(d.rejects ? { rejects: d.rejects, swapWhy: d.swapWhy, repeats: d.repeats } : {}) }; };
const report = {
  commit: raw.commit, phase4b: b.commit, seeds: raw.seeds, date: new Date().toISOString().slice(0, 10),
  note: 'plan level per 10 s, 雙截棍 76–101 (fast) and 三年後的大雪 67–92 (calm), proportional-time boundaries excluded. wired = scheduler on, joint off (the phase-4b contract) in the same run; joint = scheduler on, Q1/Q2 arbitrated together (jointHolds). supplyCapPer10 = the most composition switches the segment can carry at one primary action a line, SEAM_GAP apart (an upper bound: other clocks not applied). Outcome counts are lines shown in the window (all seeds summed in the groups, seed 0 in segments); holdsDrawn counts lines whose final job draws a hold (wired: the hold pinned its line; joint: only committed holds). popart, midcentury, screentone are not declared: joint has no effect there.',
  groups, artDeco, segments, contract, q2: { off: q2(a['planall-off']), joint: q2(a.planall) },
};
writeFileSync(a.out!, JSON.stringify(report, null, 1));
for (const [g, x] of Object.entries(groups)) console.log(g, windows.map((w) => `${w} cap ${x[0][w].supplyCapPer10.median} joint ${x[0][w].medianJointPlanExclUnreliable} wired ${x[0][w].medianWiredPlanExclUnreliable} 4b ${x[0][w].phase4b?.medianWiredPlanExclUnreliable} holds ${x[0][w].holdsDrawn.wired}→${x[0][w].holdsDrawn.joint}`).join(' | '), 'stab', windows.map((w) => raw.seeds.map((s) => x[s][w].medianJointPlanExclUnreliable).join('/')).join(' '));
console.log('contract', contract.length);
