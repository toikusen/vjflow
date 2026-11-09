// Score the frame check on the owner's labels (Codex 2026-11-10 phase 4 §5; docs/research/2026-11-10-frame-labelling.md).
// Reads the owner's filled 答題表.csv and key.json (label-samples.mts). Two steps, in this order:
//   calibrate  the 40 calibration samples only: search the detector's thresholds (zero false accepts first, then the
//              most agreement, then the more conservative), and write frozen-thresholds.json. Refused once the held-out
//              set was scored at other thresholds: changing them then demotes the held-out set to dev data (draw anew).
//   score      the 80 held-out samples at the frozen thresholds: repeat consistency, precision and recall overall and per
//              stratum, outline-only detections apart, the zero-false-accept and ≥ 90 % recall checks, the hard faults.
// 不確定 (unsure) never passes: it counts as "not a composition change". A detection is the detector's `seen` at the
// thresholds, re-judged from the stored numbers (frame-change.mts judge); an approved-not-drawn event is never one.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/label-score.mts calibrate|score --table <答題表.csv> [--dir out/research/labelling-1110]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { judge, SEEN } from './frame-change.mts';

export type Thresholds = typeof SEEN;
export interface Answer { q1: 'yes' | 'no' | 'unsure' | ''; q2: string[]; q3: string; note: string }
export interface KeySample { pool: string; repeatOf?: string; verdict: string; m?: Record<string, number | boolean>; strata: Record<string, string>; tags?: string[] }

const Q1: Record<string, Answer['q1']> = { 是: 'yes', yes: 'yes', y: 'yes', 否: 'no', no: 'no', n: 'no', 不確定: 'unsure', unsure: 'unsure', '?': 'unsure' };
/** One CSV line into fields (quotes and doubled quotes as Excel and Numbers write them). */
function fields(line: string): string[] {
  const out: string[] = [];
  let [cur, q] = ['', false];
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  return [...out, cur];
}
/** The filled table: sample id → answer (the header row and blank lines skipped). */
export function parseTable(csv: string): Record<string, Answer> {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim()).map(fields);
  return Object.fromEntries(rows.filter((r) => /^s\d{3}$/.test(r[0]?.trim())).map((r) => [r[0].trim(), { q1: Q1[(r[1] ?? '').trim().toLowerCase()] ?? '', q2: (r[2] ?? '').split(/[/／、,]/).map((x) => x.trim()).filter(Boolean), q3: (r[3] ?? '').trim(), note: (r[4] ?? '').trim() }]));
}

/** The owner's "this is a composition change": only a clear yes. */
export const ownerYes = (x: Answer | undefined) => x?.q1 === 'yes';
/** The detector's call on one sample at these thresholds. */
export function detected(s: KeySample, t: Thresholds): boolean {
  if (s.verdict === 'approvedNotDrawn' || !s.m) return false;
  return judge(s.m as never, t).seen;
}
/** Seen only through the carrier ring at these thresholds. */
export const outlineOnlyAt = (s: KeySample, t: Thresholds) => detected(s, t) && !detected(s, { ...t, outline: Infinity });

export interface Tally { n: number; tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null }
export function tally(pairs: { owner: boolean; det: boolean }[]): Tally {
  const c = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const p of pairs) c[p.det ? (p.owner ? 'tp' : 'fp') : p.owner ? 'fn' : 'tn']++;
  return { n: pairs.length, ...c, precision: c.tp + c.fp ? +(c.tp / (c.tp + c.fp)).toFixed(3) : null, recall: c.tp + c.fn ? +(c.tp / (c.tp + c.fn)).toFixed(3) : null };
}

/** The hidden repeats against their originals: the same Q1, and the same "counts as a change" (yes vs not yes). */
export function consistency(key: Record<string, KeySample>, table: Record<string, Answer>) {
  const pairs = Object.entries(key).filter(([, s]) => s.repeatOf).map(([id, s]) => ({ id, of: s.repeatOf!, a: table[s.repeatOf!]?.q1 ?? '', b: table[id]?.q1 ?? '' }));
  const flips = pairs.filter((p) => ownerYes({ q1: p.a } as Answer) !== ownerYes({ q1: p.b } as Answer));
  return { pairs: pairs.length, sameQ1: pairs.filter((p) => p.a === p.b).length, countFlips: flips.map((p) => `${p.of}/${p.id}: ${p.a || '空'} → ${p.b || '空'}`), ok: flips.length === 0, note: flips.length ? 'a repeat changed whether it counts: settle the definition with the owner and relabel before scoring (Codex §5)' : 'consistent' };
}

/** The threshold grid the calibration searches (q1-calib.mts's, with the carrier ring). */
export function grid(): Thresholds[] {
  const out: Thresholds[] = [];
  for (const shift of [0.04, 0.06, 0.08]) for (const scale of [1.4, 1.75, 1.9, 2.4]) for (const relation of [1.3, 1.6, 2, 9]) for (const page of [0.03, 0.04, 0.06, 0.08, 0.1, 0.15]) for (const onCarrier of [0.2, 0.5, 9]) for (const outline of [0.06, 0.08, 0.1, 0.12, Infinity]) out.push({ shift, scale, relation, page, onCarrier, outline });
  return out;
}
/** How conservative a set is (higher thresholds see less): ranks ties toward fewer detections. */
const strictness = (t: Thresholds) => t.shift / SEEN.shift + t.scale / SEEN.scale + t.relation / SEEN.relation + t.page / SEEN.page + Math.min(9, t.onCarrier) / SEEN.onCarrier + Math.min(1, t.outline) / SEEN.outline;

/**
 * Tune on the calibration samples (originals only): zero false accepts first, then the most agreement, then the
 * current SEEN, then the stricter. Samples the owner left blank are not used.
 */
export function calibrate(key: Record<string, KeySample>, table: Record<string, Answer>) {
  const cal = Object.entries(key).filter(([id, s]) => s.pool === 'calibration' && !s.repeatOf && table[id]?.q1);
  const rate = (t: Thresholds) => { const x = tally(cal.map(([id, s]) => ({ owner: ownerYes(table[id]), det: detected(s, t) }))); return { t, fa: x.fp, agree: x.tp + x.tn, tally: x }; };
  const same = (t: Thresholds) => (Object.keys(SEEN) as (keyof Thresholds)[]).every((k) => t[k] === SEEN[k]);
  const tries = grid().map(rate).sort((a, b) => a.fa - b.fa || b.agree - a.agree || Number(same(b.t)) - Number(same(a.t)) || strictness(b.t) - strictness(a.t));
  return { used: cal.length, best: tries[0], atSeen: rate(SEEN) };
}

export const hashOf = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);

/** The held-out report at the frozen thresholds. */
export function scoreHeldout(key: Record<string, KeySample>, table: Record<string, Answer>, t: Thresholds, o: { outlineShort?: boolean } = {}) {
  const held = Object.entries(key).filter(([, s]) => s.pool.startsWith('heldout') && !s.repeatOf);
  const missing = held.filter(([id]) => !table[id]?.q1).map(([id]) => id);
  const rows = held.filter(([id]) => table[id]?.q1).map(([id, s]) => ({ id, s, owner: ownerYes(table[id]), det: detected(s, t), outline: outlineOnlyAt(s, t), unsure: table[id].q1 === 'unsure' }));
  const all = tally(rows);
  const byStratum: Record<string, Record<string, Tally>> = {};
  for (const dim of ['worldGroup', 'tempo', 'lang', 'length', 'event'] as const) {
    const vals = [...new Set(rows.map((r) => r.s.strata[dim]))].sort();
    byStratum[dim] = Object.fromEntries(vals.map((v) => [v, tally(rows.filter((r) => r.s.strata[dim] === v))]));
  }
  byStratum['pool'] = Object.fromEntries(['heldout-random', 'heldout-hard'].map((p) => [p, tally(rows.filter((r) => r.s.pool === p))]));
  // (outline-only detections reported on their own, and the rest without them: never hidden in the overall number)
  const outline = tally(rows.filter((r) => r.outline));
  const withoutOutline = tally(rows.filter((r) => !r.outline));
  const falseAccepts = rows.filter((r) => r.det && !r.owner).map((r) => ({ id: r.id, ownerSaid: table[r.id].q1, outlineOnly: r.outline }));
  const recallOk = all.recall !== null && all.recall >= 0.9;
  const faults = Object.entries(table).filter(([id, x]) => key[id] && x.q3 && !/^(無|none|-)$/i.test(x.q3)).map(([id, x]) => ({ id, fault: x.q3 }));
  return {
    thresholds: { ...t, outline: Number.isFinite(t.outline) ? t.outline : 'off' }, scored: rows.length, missing, unsureCountedAsNo: rows.filter((r) => r.unsure).length,
    overall: all, byStratum, outlineOnly: { ...outline, branch: o.outlineShort ? 'fewer than 20 outline-only samples: this branch cannot auto-pass' : 'reported apart' }, withoutOutline,
    checks: { zeroFalseAccept: falseAccepts.length === 0, falseAccepts, recallAtLeast90: recallOk, complete: missing.length === 0 },
    pass: falseAccepts.length === 0 && recallOk && missing.length === 0,
    hardFaults: faults,
    note: 'pass covers counting only; hard faults go to the reading/carrier gate, and every outline-only, threshold-edge and unrealized event of a passing clip is still reviewed by hand (Codex §5)',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values: a, positionals } = parseArgs({ allowPositionals: true, options: { table: { type: 'string' }, dir: { type: 'string', default: 'out/research/labelling-1110' } } });
  const k = JSON.parse(readFileSync(join(a.dir!, 'key.json'), 'utf8')) as { samples: Record<string, KeySample>; outlineShort?: boolean };
  const table = parseTable(readFileSync(a.table!, 'utf8'));
  const frozenFile = join(a.dir!, 'frozen-thresholds.json');
  const scoredFile = join(a.dir!, 'heldout-score.json');
  const c = consistency(k.samples, table);
  if (positionals[0] === 'calibrate') {
    const r = calibrate(k.samples, table);
    const t = r.best.t;
    if (existsSync(scoredFile)) {
      const scored = JSON.parse(readFileSync(scoredFile, 'utf8'));
      if (scored.thresholdsHash !== hashOf(t)) throw new Error(`the held-out set was already scored at ${scored.thresholdsHash}; new thresholds demote it to dev data: draw a new held-out set (label-samples.mts --seed …) first`);
    }
    const calRows = Object.fromEntries(Object.entries(table).filter(([id]) => k.samples[id]?.pool === 'calibration'));
    writeFileSync(frozenFile, JSON.stringify({ frozen: new Date().toISOString(), thresholds: { ...t, outline: Number.isFinite(t.outline) ? t.outline : 'off' }, thresholdsHash: hashOf(t), tunedOn: r.used, calibrationTableHash: hashOf(calRows), calibration: r.best.tally, atCurrentSeen: r.atSeen.tally, repeats: c }, null, 1));
    console.log(JSON.stringify({ used: r.used, thresholds: t, calibration: r.best.tally, atSeen: r.atSeen.tally, repeats: c }, null, 1));
  } else if (positionals[0] === 'score') {
    if (!existsSync(frozenFile)) throw new Error('no frozen-thresholds.json: run calibrate on the 40 first');
    const f = JSON.parse(readFileSync(frozenFile, 'utf8'));
    const t = { ...f.thresholds, outline: f.thresholds.outline === 'off' ? Infinity : f.thresholds.outline } as Thresholds;
    const r = scoreHeldout(k.samples, table, t, { outlineShort: k.outlineShort });
    const out = { scoredAt: new Date().toISOString(), thresholdsHash: hashOf(t), frozenAt: f.frozen, repeats: c, ...r, pass: r.pass && c.ok };
    writeFileSync(scoredFile, JSON.stringify(out, null, 1));
    console.log(JSON.stringify({ pass: out.pass, overall: r.overall, outlineOnly: r.outlineOnly, checks: { ...r.checks, falseAccepts: r.checks.falseAccepts.length }, repeats: c.ok, missing: r.missing.length }, null, 1));
    if (!out.pass) process.exitCode = 1;
  } else throw new Error('calibrate | score');
}
