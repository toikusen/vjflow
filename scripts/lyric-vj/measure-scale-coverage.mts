// Q3 scale coverage, PLAN-LEVEL ONLY (Q3 phase 1, docs/research/2026-11-09-q3-phase1.md): nothing is rendered or checked
// on video, so a planned scale contrast the frame never shows still counts here, and every ratio is an estimate from
// blockOf() and an estimated glyph width. Per world, song and seed:
//   today  — the current plan's keyword blow-ups (lineplan-core blowOf / blownParts) per sung section, with the rule that
//            refused each line (scale-policy-adapter.ts todayScale, replay checked against the plan's own blows);
//   policy — pickScaleContrasts() on the same plan (scale-policy.ts), not wired into any render: per section the
//            candidates, their semantic source, score, kind, estimated ratio and rejection reasons, and the choice.
// Sections are song.json sections with sung lines, a line in the section it starts in (the 11-09 measurement's basis).
// `renderedScaleSections` here is PLANNED sections; phase 2 replaces it with the frames' own check.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-scale-coverage.mts [--world riso] [--seeds 0,1,2] [--out out/research/q3-1109/coverage.json]
//     [--meaning-suffix haiku-1109]  (the instant variant reads meaning.<suffix>.json beside each cached meaning.json instead)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { scaleCapsOf } from '../../src/app/lyric-vj/scale-caps-draft';
import { pickScaleContrasts, type ScalePlan } from '../../src/app/lyric-vj/scale-policy';
import { scaleInputOf, todayScale } from '../../src/app/lyric-vj/scale-policy-adapter';
import { splitCalls } from '../../src/app/lyric-vj/calls';
import { scaleLayout } from '../../src/app/lyric-vj/render/scale-pose';
import { shapedMeasure } from '../../src/app/lyric-vj/render/seat-geometry';
import { blockOf, SET_SPECS } from '../../src/app/lyric-vj/render/world-sets';
import type { WorldLine } from '../../src/app/lyric-vj/render/world-layout';
import { scaleOf } from '../../src/app/lyric-vj/world-shared';

const SONGS = [
  { song: 'nun', db: 'yt_w_fCuUR3lEs' },
  { song: 'snow', db: 'yt_5i50aTB7JFo' },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seeds: { type: 'string', default: '0,1,2' }, out: { type: 'string' }, 'meaning-suffix': { type: 'string' }, phase: { type: 'string', default: '1' } } });

/**
 * Phase 2 (2026-11-10, docs/research/2026-11-10-q3q5-phase2.md): the wiring on. freeJob with scaleContrast and
 * meaningMoments on and the scheduler on (worldEvents: true, the five single-page worlds as today), five songs on their
 * stored readings (merged-1109d, keys present), seeds as given, every world that declares `scale` (riso, screentone).
 * Per sung section: the policy's candidates (semantic key or whole-line fallback), what the scheduler approved or refused
 * and why (each candidate tried), the approved line's planned ratio and its DRAWN ratio — the renderer's own layout
 * (render/scale-pose.ts scaleLayout, the function world-layout.ts draws from) on the shaped glyph measure
 * (seat-geometry.ts shapedMeasure, a second guess at real advances; the browser's real glyphs are not available here) at
 * the line's reading size in its set on that measure. A section counts as rendered only when the drawn ratio is ≥ 1.6,
 * as edgeFit only when the drawn ratio is ≥ 1.8 on a key phrase; a drawn ratio below the planned one is `unrealized`.
 */
function phase2() {
  const FIVE = [...SONGS, { song: 'tsuzuki', db: 'yt_b3GCfyNKeLs' }, { song: 'choroin', db: 'yt_hCCskTJwvuc' }, { song: 'tenmon', db: 'yt_iwYXfOhcsYI' }];
  const worlds = OFFERED_STYLES.filter((s) => scaleOf(s.id) && (!a.world || s.id === a.world));
  const rows: Record<string, unknown>[] = [];
  for (const { song: sid, db } of FIVE) {
    const song = JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8'));
    const path = `out/research/instant/plans/${sid}/meaning${suffix}.json`;
    const meaning = JSON.parse(readFileSync(path, 'utf8'));
    for (const seed of seeds)
      for (const style of worlds) {
        const f = freeJob(song, { style, seed, meaning, worldEvents: true, scaleContrast: true, meaningMoments: true, meaningRef: path });
        const plan = f.policy!.scale!;
        const decisions = f.policy!.decisions.filter((d) => d.source === 'Q3');
        const lines = (f.treatment.cues as { cueId: string; world?: WorldLine }[]);
        const cueText = (id: string) => (f.job.cues as { id: string; text: string }[]).find((c) => c.id === id)!.text;
        const sections = plan.sections.map((s) => {
          const tried = decisions.filter((d) => d.group === s.sectionId);
          const ok = tried.find((d) => d.approved);
          const drawnLine = ok ? lines.find((c) => c.cueId === ok.lineId) : undefined;
          const sc = drawnLine?.world?.scale;
          const spec = drawnLine?.world ? SET_SPECS[drawnLine.world.set] : undefined;
          // (the renderer draws the line's main text, its calls on their own track: world-layout lays rt.cue.text)
          const main = ok ? splitCalls(cueText(ok.lineId)).main : '';
          const reading = spec ? blockOf(main.replace(/[\s　]+/g, ' ').trim(), spec, spec.even ? (x: string) => [...x].length * 100 : shapedMeasure).size : 0;
          const drawn = sc && spec ? scaleLayout(main, sc, reading, spec, shapedMeasure) : undefined;
          const c = s.chosen === undefined ? undefined : s.candidates[s.chosen];
          return {
            sectionId: s.sectionId, lineIds: s.lineIds, policyKind: s.kind, pool: s.pool,
            candidates: s.candidates.map((x) => ({ lineId: x.lineId, source: x.source, text: x.text, legal: x.legal, kind: x.kind, ratio: x.ratio, score: x.score, ...(x.seat ? { edge: x.seat.edge } : {}), ...(x.legal ? {} : { reasons: x.reasons }) })),
            policyChoice: c ? { lineId: c.lineId, source: c.source, text: c.text, ratio: c.ratio } : null,
            tried: tried.map((d) => ({ id: d.id, rank: d.rank, approved: d.approved, reason: d.reason })),
            chosen: ok ? { id: ok.id, lineId: ok.lineId, eventId: ok.eventId, shared: !!ok.shared, source: sc?.source, text: sc ? [...main].slice(sc.span.from, sc.span.to).join('') : undefined, edge: sc?.edge, plannedRatio: sc?.ratio, drawnRatio: drawn && drawn.kind !== 'miss' ? drawn.ratio : 0, drawnKind: drawn?.kind ?? 'miss', unrealized: !drawn || drawn.unrealized, ...(drawn?.why ? { why: drawn.why } : {}) } : null,
            unrealizable: f.policy!.unrealizable.filter((u) => s.candidates.some((x) => u.id.startsWith(`scale:${x.lineId}`))).map((u) => `${u.id}: ${u.why}`),
            rejection: ok ? null : tried.length ? tried.map((d) => d.reason).join(' | ') : s.reasons.join(' | '),
          };
        });
        const rendered = sections.filter((x) => x.chosen && x.chosen.drawnKind !== 'miss').length;
        rows.push({ world: style.id, song: sid, seed, meaning: path, keys: (meaning.keys ?? []).length, sungSections: plan.sungSections, plannedSections: plan.plannedSections, approvedSections: sections.filter((x) => x.chosen).length, renderedScaleSections: rendered, edgeFitSections: sections.filter((x) => x.chosen?.drawnKind === 'edgeFit').length, unrealized: sections.filter((x) => x.chosen?.unrealized).length, sections });
      }
  }
  type R = { world: string; song: string; seed: number; sungSections: number; plannedSections: number; approvedSections: number; renderedScaleSections: number; edgeFitSections: number; unrealized: number; sections: { sectionId: string; candidates: { lineId: string; source: string; text: string; legal: boolean }[]; chosen: { lineId: string; text?: string } | null }[] };
  const R = rows as unknown as R[];
  const sum = (xs: R[], k: keyof R) => xs.reduce((n, r) => n + (r[k] as number), 0);
  const perWorld = Object.fromEntries(worlds.map((w) => [w.id, Object.fromEntries(seeds.map((seed) => { const xs = R.filter((r) => r.world === w.id && r.seed === seed); return [seed, { sungSections: sum(xs, 'sungSections'), plannedSections: sum(xs, 'plannedSections'), approvedSections: sum(xs, 'approvedSections'), renderedScaleSections: sum(xs, 'renderedScaleSections'), edgeFitSections: sum(xs, 'edgeFitSections'), unrealized: sum(xs, 'unrealized') }]; }))]));
  const overall = Object.fromEntries(seeds.map((seed) => { const xs = R.filter((r) => r.seed === seed); return [seed, { sungSections: sum(xs, 'sungSections'), renderedScaleSections: sum(xs, 'renderedScaleSections'), edgeFitSections: sum(xs, 'edgeFitSections'), unrealized: sum(xs, 'unrealized') }]; }));
  // diversity: a section (song, seed) where both worlds have ≥ 2 legal candidates in common and both approved one
  const div: { song: string; seed: number; sectionId: string; shared: number; choices: string[] }[] = [];
  for (const { song } of FIVE) for (const seed of seeds) {
    const of = R.filter((r) => r.song === song && r.seed === seed);
    for (const s of of[0]?.sections ?? []) {
      const per = of.map((r) => r.sections.find((x) => x.sectionId === s.sectionId)!);
      const key = (c: { lineId: string; source: string; text: string }) => `${c.lineId}|${c.source}|${c.text}`;
      const common = per.map((p) => new Set(p.candidates.filter((c) => c.legal).map(key))).reduce((x, y) => new Set([...x].filter((k) => y.has(k))));
      if (common.size >= 2 && per.every((p) => p.chosen)) div.push({ song, seed, sectionId: s.sectionId, shared: common.size, choices: per.map((p) => `${p.chosen!.lineId}「${p.chosen!.text}」`) });
    }
  }
  const report = {
    note: 'phase 2: wiring on (scaleContrast, meaningMoments, worldEvents true); approved = the scheduler approved a candidate; rendered = drawn ratio ≥ 1.6 by the renderer\'s own layout (scale-pose.ts) on shapedMeasure, not browser pixels; edgeFit = drawn ≥ 1.8 on a key phrase',
    date: '2026-11-10', seeds, worlds: worlds.map((w) => w.id), songs: FIVE.map((s) => s.song), apiCalls: 0,
    summary: { perWorld, overall, diversity: { eligibleSections: div.length, distinctAcrossWorlds: div.filter((d) => new Set(d.choices).size >= 2).length, sections: div } },
    rows,
  };
  if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, JSON.stringify(report)); }
  console.log(JSON.stringify(report.summary, (k, v) => (k === 'sections' ? v.length : v)));
}
const suffix = a['meaning-suffix'] ? `.${a['meaning-suffix']}` : '';
// the measurement's meanings (keys empty), and the older line-plan readings that do name keys, as a second variant
const VARIANTS = [
  { id: 'instant', path: (s: string) => `out/research/instant/plans/${s}/meaning${suffix}.json`, note: suffix ? `the same instant plans re-read (meaning${suffix}.json)` : 'the meanings the 11-09 measurement used (world-clip.mts); keys: []' },
  { id: 'lineplan-keys', path: (s: string) => `out/research/lineplan/${s}/meaning.json`, note: 'supplementary: out/research/lineplan readings, 10 keys a song; also changes the parts, so today differs' },
];
const seeds = a.seeds!.split(',').map(Number);
const styles = OFFERED_STYLES.filter((s) => !a.world || s.id === a.world);
if (a.phase === '2') { phase2(); process.exit(0); }

const policyRow = (p: ScalePlan) => ({
  sungSections: p.sungSections,
  renderedScaleSections: p.plannedSections,
  edgeFitSections: p.edgeFitSections,
  sections: p.sections.map((s) => {
    const c = s.chosen === undefined ? undefined : s.candidates[s.chosen];
    return {
      sectionId: s.sectionId, kind: s.kind, ratio: s.ratio, pool: s.pool, reasons: s.reasons,
      chosen: c ? { lineId: c.lineId, text: c.text, source: c.source, score: c.score, ratio: c.ratio, edge: c.seat!.edge, eventId: `scale:${c.lineId}` } : null,
      candidates: s.candidates.map((x) => ({ lineId: x.lineId, source: x.source, text: x.text, legal: x.legal, kind: x.kind, ratio: x.ratio, score: x.score, ...(x.seat ? { edge: x.seat.edge } : {}), reasons: x.reasons })),
    };
  }),
});

const rows: Record<string, unknown>[] = [];
for (const v of VARIANTS)
  for (const { song: sid, db } of SONGS) {
    const song = JSON.parse(readFileSync(`out/db/${db}/song.json`, 'utf8'));
    const meaning = JSON.parse(readFileSync(v.path(sid), 'utf8'));
    for (const seed of seeds)
      for (const style of styles) {
        const free = freeJob(song, { style, seed, meaning });
        const today = todayScale(free, song, style.world, meaning);
        const inp = scaleInputOf(free, song, style.world, { seed, songId: sid, meaning });
        const plan = pickScaleContrasts(inp);
        const caps = scaleCapsOf(style.world);
        rows.push({
          variant: v.id, world: style.id, song: sid, seed, caps: { source: caps.source, edges: caps.edges, carrierRole: caps.carrierRole }, keys: inp.keys.length, estimatedReadingSize: inp.estimated,
          today: { sungSections: today.sungSections, plannedSections: today.plannedSections, renderableSections: today.renderableSections, blownLines: today.blownLines, mismatches: today.mismatches, sections: today.sections },
          policy: policyRow(plan),
        });
      }
  }

type Row = { variant: string; world: string; song: string; seed: number; today: { sungSections: number; plannedSections: number; renderableSections: number; mismatches: string[]; sections: { sectionId: string; planned: boolean; renderable: boolean; why: string; lines: { reason: string; blown: boolean }[] }[] }; policy: ReturnType<typeof policyRow> };
const R = rows as unknown as Row[];
const median = (xs: number[]) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/**
 * Diversity across worlds, per variant, song, seed and section: a section counts as eligible when at least two worlds share
 * at least two legal candidates in the tier they chose from (same line, source and text); it is diverse when the worlds
 * that chose there picked at least two different lines. Single-candidate sections are not asked for a fake difference.
 */
function diversity(variant: string) {
  const out: { song: string; seed: number; sectionId: string; tier: string; eligibleWorlds: number; distinctChoices: number; choices: Record<string, number> }[] = [];
  for (const { song } of SONGS)
    for (const seed of seeds) {
      const of = R.filter((r) => r.variant === variant && r.song === song && r.seed === seed);
      const ids = [...new Set(of.flatMap((r) => r.policy.sections.map((s) => s.sectionId)))];
      for (const id of ids) {
        const picks = of.map((r) => r.policy.sections.find((s) => s.sectionId === id)!).filter((s) => s?.chosen);
        for (const tier of ['meaning', 'sectionScale'] as const) {
          const here = picks.filter((s) => s.chosen!.source === tier);
          const legal = here.map((s) => new Set(s.candidates.filter((c) => c.legal && c.source === tier).map((c) => `${c.lineId}|${c.text}`)));
          // worlds that share ≥ 2 legal candidates with at least one other world
          const eligible = legal.filter((a, i) => legal.some((b, j) => j !== i && [...a].filter((x) => b.has(x)).length >= 2)).length;
          if (eligible < 2) continue;
          const choices = here.reduce<Record<string, number>>((m, s) => ({ ...m, [s.chosen!.lineId]: (m[s.chosen!.lineId] ?? 0) + 1 }), {});
          out.push({ song, seed, sectionId: id, tier, eligibleWorlds: eligible, distinctChoices: Object.keys(choices).length, choices });
        }
      }
    }
  return { eligibleSections: out.length, diverseSections: out.filter((x) => x.distinctChoices >= 2).length, sections: out };
}

/** Today's misses across worlds at seed 0: per song and section, how many worlds missed it and the reasons' tally. */
function todayMisses(variant: string) {
  return Object.fromEntries(SONGS.map(({ song }) => {
    const of = R.filter((r) => r.variant === variant && r.song === song && r.seed === 0);
    const ids = of[0]?.today.sections.map((s) => s.sectionId) ?? [];
    return [song, ids.map((id) => {
      const secs = of.map((r) => r.today.sections.find((s) => s.sectionId === id)!);
      const generic = (r: string) => r.replace(/\bc\d{3}\b/g, 'cX').replace(/\d+\.\d+s/g, 'Ns').replace(/part \d+/g, 'part N').replace(/shot L\d+/g, 'shot LX').replace(/\(([a-z-]+)\) took/, '(piece) took');
      const tally: Record<string, number> = {};
      for (const s of secs.filter((x) => !x.planned)) for (const l of s.lines) tally[generic(l.reason)] = (tally[generic(l.reason)] ?? 0) + 1;
      return { sectionId: id, plannedWorlds: secs.filter((s) => s.planned).length, renderableWorlds: secs.filter((s) => s.renderable).length, missedWorlds: secs.filter((s) => !s.planned).length, lineReasonsInMissedWorlds: tally, example: secs.find((s) => !s.planned)?.why ?? secs[0]?.why };
    })];
  }));
}

const summary = Object.fromEntries(VARIANTS.map((v) => {
  const of = R.filter((r) => r.variant === v.id);
  const bySeed = Object.fromEntries(seeds.map((seed) => {
    const worlds = [...new Set(of.map((r) => r.world))];
    const both = worlds.map((w) => {
      const two = of.filter((r) => r.world === w && r.seed === seed);
      const sum = (f: (r: Row) => number) => two.reduce((s, r) => s + f(r), 0);
      return { world: w, sung: sum((r) => r.today.sungSections), today: sum((r) => r.today.plannedSections), todayRenderable: sum((r) => r.today.renderableSections), policy: sum((r) => r.policy.renderedScaleSections), edgeFit: sum((r) => r.policy.edgeFitSections) };
    });
    return [seed, {
      worlds: both.length,
      sungSections: both[0]?.sung,
      medianToday: median(both.map((b) => b.today)), maxToday: Math.max(...both.map((b) => b.today)),
      medianTodayRenderable: median(both.map((b) => b.todayRenderable)),
      medianPolicy: median(both.map((b) => b.policy)), minPolicy: Math.min(...both.map((b) => b.policy)), maxPolicy: Math.max(...both.map((b) => b.policy)),
      medianEdgeFit: median(both.map((b) => b.edgeFit)),
      worldsFullPolicy: both.filter((b) => b.policy === b.sung).length,
      perWorld: both,
    }];
  }));
  return [v.id, { note: v.note, rows: of.length, mismatches: of.reduce((s, r) => s + r.today.mismatches.length, 0), bySeed, diversity: diversity(v.id), todayMisses: todayMisses(v.id) }];
}));

const report = { note: 'plan-level only: no render, no video check; ratios are estimates (blockOf + estimated glyph widths); renderedScaleSections = planned (phase 1)', date: '2026-11-09', seeds, worlds: styles.length, songs: SONGS.map((s) => s.song), summary, rows };
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report));
}
for (const [v, s] of Object.entries(summary) as [string, { rows: number; mismatches: number; bySeed: Record<string, Record<string, unknown>>; diversity: { eligibleSections: number; diverseSections: number } }][]) {
  console.log(v, 'rows', s.rows, 'replay mismatches', s.mismatches, 'diversity', s.diversity.diverseSections, '/', s.diversity.eligibleSections);
  for (const [seed, x] of Object.entries(s.bySeed)) { const { perWorld: _p, ...rest } = x; console.log(' seed', seed, JSON.stringify(rest)); }
}
