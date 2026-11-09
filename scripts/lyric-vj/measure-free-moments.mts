// Free signature moments, PLAN-LEVEL ONLY (Q5 phase 1, docs/research/2026-11-09-q5-phase1.md): counted from the policy's
// chosen candidates (moment-policy.ts rankMoments), nothing rendered, nothing wired into the plan, so `realizedMoments`
// here means PLANNED. Per song × world (5 songs with stored readings × 45 OFFERED_STYLES, seed 0):
//   today  — free-plan.ts freeMoments taken apart stage by stage (moment-policy-adapter.ts todayGate): world-independent;
//   policy — rankMoments on the same plan: realizedMoments 0–2, eliminations per floor, the reason when 0.
// No API calls by construction: the script imports only node:fs / node:path / node:util / node:crypto and this repo's
// pure modules; the reading is the meaning.json on disk (its sha256 is written into the report).
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/measure-free-moments.mts [--world silk] [--out out/research/q5-1109/moments.json]
//     [--meaning-suffix haiku-1109]  (reads meaning.<suffix>.json beside each cached meaning.json instead)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { freeJob } from '../../src/app/lyric-vj/free-plan';
import { OFFERED_STYLES } from '../../src/app/lyric-vj/free-styles';
import { momentCapsOf } from '../../src/app/lyric-vj/moment-caps-draft';
import { MOMENT_FLOORS, rankMoments } from '../../src/app/lyric-vj/moment-policy';
import { momentInputOf, todayGate } from '../../src/app/lyric-vj/moment-policy-adapter';

const SONGS = [
  { song: 'nun', db: 'yt_w_fCuUR3lEs' },
  { song: 'snow', db: 'yt_5i50aTB7JFo' },
  { song: 'tsuzuki', db: 'yt_b3GCfyNKeLs' },
  { song: 'choroin', db: 'yt_hCCskTJwvuc' },
  { song: 'tenmon', db: 'yt_iwYXfOhcsYI' },
];
const { values: a } = parseArgs({ options: { world: { type: 'string' }, seed: { type: 'string', default: '0' }, out: { type: 'string' }, 'meaning-suffix': { type: 'string' }, phase: { type: 'string', default: '1' } } });
const seed = Number(a.seed);
const styles = OFFERED_STYLES.filter((s) => !a.world || s.id === a.world);
if (a.phase === '2') { phase2(); process.exit(0); }

/**
 * Phase 2 (2026-11-10, docs/research/2026-11-10-q3q5-phase2.md): the wiring on (meaningMoments, scaleContrast, and the
 * scheduler on: worldEvents true, the five single-page worlds as today). Per song × world: every candidate's fate — its
 * first failed floor, or the scheduler's decision (approved, collisionQ2hold, collisionOther, budget, not needed) — and
 * `realizedMoments`: the approved ones the plan turned into a drawn moment (a big one through the paid guards, a mini with
 * its region), 0–2. Plan-level: only the owner clips are rendered. Then the no-key / no-cache run: no reading at all,
 * moments 0, the job still validates. API calls 0 by construction (fs, path, util, crypto and this repo's pure modules).
 */
function phase2() {
  const songs = SONGS.map((s) => {
    const path = `out/research/instant/plans/${s.song}/meaning${a['meaning-suffix'] ? `.${a['meaning-suffix']}` : ''}.json`;
    const text = readFileSync(path, 'utf8');
    return { ...s, path, sha256: createHash('sha256').update(text).digest('hex'), meaning: JSON.parse(text), timeline: JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8')) };
  });
  const rows = songs.flatMap((s) => styles.map((style) => {
    const f = freeJob(s.timeline, { style, seed, meaning: s.meaning, worldEvents: true, scaleContrast: true, meaningMoments: true, meaningRef: s.path });
    const p = f.policy;
    const plan = p?.moments;
    const t = f.treatment as { signature?: { cues: string[]; form: string; variant: string; word: string }[]; miniMoments?: { id: string; meaningRef: string; evidenceCueId: string; word: string; family: string; at: number; region: { x0: number; y0: number; x1: number; y1: number } }[] };
    const decisions = (p?.decisions ?? []).filter((d) => d.source === 'Q5');
    const fate = (ref: string) => {
      const c = plan?.candidates.find((x) => x.meaningRef === ref);
      // (the collision floor is the policy's own check against the fixed Q2 holds and Q4 handoffs, before ranking)
      if (c?.failed?.floor === 'collision') return { outcome: / Q2 /.test(c.failed.reason) ? 'collisionQ2hold' : 'collisionOther', floor: 'collision', reason: c.failed.reason };
      if (c?.failed) return { outcome: 'floor', floor: c.failed.floor, reason: c.failed.reason };
      const d = decisions.find((x) => x.meaningRef === ref);
      const room = (p?.refused ?? []).find((x) => x.id === ref);
      if (!d) return room ? { outcome: 'noRegion', reason: room.why } : { outcome: 'none', reason: 'no decision' };
      if (d.approved) return { outcome: 'chosen', variant: d.variant, at: d.at, window: [d.from, d.to] };
      return { outcome: /^collisionQ2hold/.test(d.reason) ? 'collisionQ2hold' : /^collision/.test(d.reason) ? 'collisionOther' : /^budget/.test(d.reason) ? 'budget' : /^not needed/.test(d.reason) ? 'notNeeded' : 'other', variant: d.variant, reason: d.reason };
    };
    const realized = [...(t.signature ?? []).map((m) => ({ variant: 'big', id: `moment:${m.cues.at(-1)}:${m.form}/${m.variant}`, word: m.word, evidenceCueId: m.cues.at(-1) })), ...(t.miniMoments ?? []).map((m) => ({ variant: 'mini', id: m.id, word: m.word, evidenceCueId: m.evidenceCueId, meaningRef: m.meaningRef, family: m.family, at: m.at, regionShare: +((m.region.x1 - m.region.x0) * (m.region.y1 - m.region.y0)).toFixed(3) }))];
    return {
      song: s.song, world: style.id, seed, declared: !!plan, candidates: plan?.candidates.length ?? 0, realizedMoments: realized.length, realized,
      perCandidate: (plan?.candidates ?? []).map((c) => ({ meaningRef: c.meaningRef, word: c.ask?.word, ...fate(c.meaningRef) })),
      refused: p?.refused ?? [], ...(plan?.reason ? { reason: plan.reason } : {}),
    };
  }));
  const bySong = Object.fromEntries(songs.map((s) => {
    const of = rows.filter((r) => r.song === s.song);
    const tally = of.flatMap((r) => r.perCandidate).reduce<Record<string, number>>((m, c) => { const k = c.outcome === 'floor' ? `floor:${(c as { floor?: string }).floor}` : c.outcome; m[k] = (m[k] ?? 0) + 1; return m; }, {});
    return [s.song, { meaning: s.path, sha256: s.sha256, candidates: s.meaning.moments?.length ?? 0, worlds: of.length, worldsWithMoment: of.filter((r) => r.realizedMoments >= 1).length, realizedTotal: of.reduce((n, r) => n + r.realizedMoments, 0), maxPerWorld: Math.max(...of.map((r) => r.realizedMoments)), outcomes: tally }];
  }));
  // no key, no cache: the free flow with no reading at all
  const bare = songs.map((s) => {
    const f = freeJob(s.timeline, { style: styles.find((x) => x.id === 'riso') ?? styles[0], seed, worldEvents: true, scaleContrast: true, meaningMoments: true });
    const t = f.treatment as { signature?: unknown[]; miniMoments?: unknown[] };
    return { song: s.song, moments: (t.signature?.length ?? 0) + (t.miniMoments?.length ?? 0), cues: f.job.treatment.cues.length, reason: f.policy?.moments?.reason ?? null };
  });
  const report = {
    note: 'phase 2: wiring on; realizedMoments = approved by the scheduler and translated into a drawn moment (plan-level; only the owner clips are rendered); songsReaching36of45 is a diagnostic, not a target met by tuning',
    date: '2026-11-10', seed, apiCalls: 0,
    summary: { rows: rows.length, songsReaching36of45: Object.values(bySong).filter((x) => x.worldsWithMoment >= 36).length, bySong, noKeyNoCache: { apiCalls: 0, runs: bare } },
    rows,
  };
  if (a.out) { mkdirSync(dirname(a.out), { recursive: true }); writeFileSync(a.out, JSON.stringify(report, null, 1)); }
  console.log(JSON.stringify(report.summary));
}
const sum = (rs: Record<string, number>[]) => rs.reduce<Record<string, number>>((m, r) => { for (const [k, v] of Object.entries(r)) m[k] = (m[k] ?? 0) + v; return m; }, {});

const songs = SONGS.map((s) => {
  const path = `out/research/instant/plans/${s.song}/meaning${a['meaning-suffix'] ? `.${a['meaning-suffix']}` : ''}.json`;
  const text = readFileSync(path, 'utf8');
  const meaning = JSON.parse(text);
  const timeline = JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8'));
  return { ...s, path, sha256: createHash('sha256').update(text).digest('hex'), meaning, timeline, candidates: meaning.moments?.length ?? 0, today: todayGate(timeline, meaning) };
});

const rows = songs.flatMap((s) => styles.map((style) => {
  const free = freeJob(s.timeline, { style, seed, meaning: s.meaning });
  const plan = rankMoments(momentInputOf(free, s.timeline, style.world, s.meaning, s.path));
  const caps = momentCapsOf(style.world);
  return {
    song: s.song, world: style.id, seed,
    caps: { big: caps.big, mini: caps.mini, source: caps.source },
    candidates: plan.candidates.length,
    realizedMoments: plan.chosen.length,
    realizedMeans: 'planned (plan-level, not rendered)',
    eliminated: plan.eliminated,
    ...(plan.reason ? { reason: plan.reason } : {}),
    chosen: plan.chosen.map((c) => ({ id: c.scheduled.id, at: c.at, variant: c.variant, family: c.family, window: c.window, area: c.area, score: c.score, meaningRef: c.meaningRef })),
    notChosen: plan.candidates.filter((c) => c.notChosen).map((c) => ({ meaningRef: c.meaningRef, why: c.notChosen })),
    failed: plan.candidates.filter((c) => c.failed).map((c) => ({ meaningRef: c.meaningRef, ...c.failed })),
  };
}));

const bySong = Object.fromEntries(songs.map((s) => {
  const of = rows.filter((r) => r.song === s.song);
  const reasons = of.reduce<Record<string, number>>((m, r) => (r.realizedMoments ? m : { ...m, [r.reason ?? 'none']: (m[r.reason ?? 'none'] ?? 0) + 1 }), {});
  return [s.song, { meaning: s.path, sha256: s.sha256, candidates: s.candidates, today: s.today, worlds: of.length, worldsWithMoment: of.filter((r) => r.realizedMoments >= 1).length, policyEliminated: sum(of.map((r) => r.eliminated)), zeroReasons: reasons }];
}));
const reach = Object.values(bySong).filter((x) => x.worldsWithMoment >= 36).length;
const report = {
  note: 'plan-level only; realizedMoments = planned by rankMoments, not rendered or wired (phase 1); 0 API calls by construction',
  date: '2026-11-09', seed, floors: MOMENT_FLOORS, apiCalls: 0,
  summary: { rows: rows.length, songsReaching36of45: reach, target: 'at least 3 songs with ≥1 moment on ≥36/45 worlds (Codex §7)', bySong },
  rows,
};
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, JSON.stringify(report, null, 1));
}
console.log(JSON.stringify(report.summary, null, 1));
