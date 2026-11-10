// Q1 phase 4d (docs/research/2026-11-10-q1-phase4d.md): measure-world-events.mts --joint read back by the frozen groups
// (phase4-groups.mts) once popart and midcentury are declared: the original five, the eight (now seven of eight declared,
// screentone still not), the thirteen against the targets, all 45, and the twelve declared worlds. Each group: the supply
// cap first, then the scheduler-on medians (wired, the phase-4b contract; joint, the phase-4c experiment) beside phase 4b
// (phase4b.json) and phase 4c (phase4c.json); then popart and midcentury world by world, and the whole-song Q2 tally.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/phase4d-report.mts --raw out/research/q1-1109/phase4d-raw.json --b out/research/q1-1109/phase4b.json --c out/research/q1-1109/phase4c.json --c-raw out/research/q1-1109/phase4c-r3-raw.json --planall out/research/q1-1109/planall-4d.json --out out/research/q1-1109/phase4d.json
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { GROUPS, HEADLINE, THIRTEEN, TARGET_13 } from './phase4-groups.mts';

const { values: a } = parseArgs({ options: { raw: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' }, 'c-raw': { type: 'string' }, planall: { type: 'string' }, out: { type: 'string' } } });
type Row = Record<string, any>;
const load = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
const raw = load(a.raw!) as { commit: string; seeds: number[]; rows: Row[] };
const b = load(a.b!) as { commit: string; bySeed: { seed: number; groups: Record<string, Record<string, Row>> }[] };
const c = load(a.c!) as { commit: string; groups: Record<string, Record<string, Record<string, Row>>> };
const cRaw = a['c-raw'] ? (load(a['c-raw']) as { commit: string; rows: Row[] }) : undefined;
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const NEW = ['popart', 'midcentury'];
const DECLARED: string[] = [...GROUPS.five, ...GROUPS.eight.filter((w) => w !== 'screentone')];
const ids: Record<string, readonly string[] | undefined> = { five: GROUPS.five, eight: GROUPS.eight, thirteen: THIRTEEN, all45: undefined, declared12: DECLARED };
const bName: Record<string, string> = { five: 'original5', eight: 'eight', thirteen: 'thirteen', all45: 'all45' };
const windows = ['fast', 'calm'] as const;

const groups = Object.fromEntries(Object.entries(ids).map(([g, list]) => [g, Object.fromEntries(raw.seeds.map((seed) => [seed, Object.fromEntries(windows.map((w) => {
  const rs = raw.rows.filter((r) => r['seed'] === seed && r['window'] === w && (!list || list.includes(r['world'])));
  const caps = rs.map((r) => r['joint'].supply.capPer10);
  return [w, {
    worlds: rs.length,
    // (supply first: the most composition switches the segment's lines and reliable boundaries could carry, one a line)
    supplyCapPer10: { median: median(caps), min: Math.min(...caps), max: Math.max(...caps) },
    [HEADLINE]: median(rs.map((r) => r['wired'].planExclUnreliablePer10)),
    medianJointPlanExclUnreliable: median(rs.map((r) => r['joint'].planExclUnreliablePer10)),
    phase4b: b.bySeed.find((x) => x.seed === seed)?.groups[bName[g]]?.[w]?.[HEADLINE],
    phase4cJoint: c.groups[g]?.[seed]?.[w]?.['medianJointPlanExclUnreliable'],
    phase4cWired: c.groups[g]?.[seed]?.[w]?.['medianWiredPlanExclUnreliable'],
    ...(g === 'thirteen' ? { target: TARGET_13[w] } : {}),
  }];
}))]))]));

// (the two worlds of this step, seed by seed: today's product (scheduler off, before), the wired and joint plans, the supply)
const worlds = Object.fromEntries(NEW.map((id) => [id, Object.fromEntries(raw.seeds.map((seed) => [seed, Object.fromEntries(windows.map((w) => {
  const r = raw.rows.find((x) => x['seed'] === seed && x['window'] === w && x['world'] === id)!;
  // (phase 4c's run, the world still undeclared: its scheduler-on plan was today's product, read by the same rule)
  const undeclared = cRaw?.rows.find((x) => x['seed'] === seed && x['window'] === w && x['world'] === id)?.['wired'].planExclUnreliablePer10;
  return [w, { undeclared4c: undeclared, lines: r['joint'].supply.lines, supplyCapPer10: r['joint'].supply.capPer10, before: r['before'].planCutsPer10, wired: r['wired'].planExclUnreliablePer10, wiredByKind: r['wired'].byKind, unlaid: r['wired'].unlaid.length, joint: r['joint'].planExclUnreliablePer10, jointByKind: r['joint'].byKind, outcomes: r['joint'].outcomes }];
}))]))]));
const contract = raw.rows.flatMap((r) => [...(r['contract'] ?? []), ...(r['joint']?.contract ?? [])].map((x: string) => `${r['world']} ${r['window']} seed ${r['seed']}: ${x}`));
const unlaid = raw.rows.reduce((n, r) => n + r['wired'].unlaid.length + (r['joint']?.unlaid?.length ?? 0), 0);
const q2 = a.planall ? (({ commit, scheduled, joint, tally, split }) => ({ commit, scheduled, joint, tally, split }))(load(a.planall)) : undefined;
const report = {
  commit: raw.commit, phase4b: b.commit, phase4c: c.commit, phase4cRaw: cRaw?.commit, seeds: raw.seeds, date: new Date().toISOString().slice(0, 10),
  note: 'plan level per 10 s, 雙截棍 76–101 (fast) and 三年後的大雪 67–92 (calm), proportional-time boundaries excluded. wired = scheduler on, joint off (the phase-4b contract, the headline); joint = Q1/Q2 arbitrated together (phase 4c, experimental). supplyCapPer10 = the most composition switches the segment can carry at one primary action a line, SEAM_GAP apart over reliable boundaries (an upper bound, other clocks not applied). Twelve worlds declared: the five, riso, silk, file, card, spy, popart, midcentury; screentone is not.',
  groups, worlds, contract, unlaid, q2,
};
writeFileSync(a.out!, JSON.stringify(report, null, 1));
for (const [g, x] of Object.entries(groups)) console.log(g.padEnd(10), raw.seeds.map((s) => `s${s} ` + windows.map((w) => `${w} cap ${x[s][w].supplyCapPer10.median} wired ${x[s][w][HEADLINE]} (4b ${x[s][w].phase4b}) joint ${x[s][w].medianJointPlanExclUnreliable} (4c ${x[s][w].phase4cJoint})`).join(' ')).join(' | '));
for (const [id, x] of Object.entries(worlds)) console.log(id, raw.seeds.map((s) => `s${s} ` + windows.map((w) => `${w} cap ${x[s][w].supplyCapPer10} 4c ${x[s][w].undeclared4c} wired ${x[s][w].wired} joint ${x[s][w].joint}`).join(' ')).join(' | '));
console.log('contract', contract.length, 'unlaid', unlaid);
