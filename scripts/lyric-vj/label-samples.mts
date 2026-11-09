// The owner-labelling sample set of the frame check (Codex 2026-11-10 phase 4 §5; docs/research/2026-11-10-frame-labelling.md).
// From the latest frame measurements (scheduler on: the 13 declared worlds' phase-4b round-2 run, the other 32 worlds
// of the 45-world phase-4a run, the Japanese pair over all 45, and riso with the Q3 scale policy on), build the pool of
// planned events with the detector's verdict and their strata, then draw, with one fixed seed:
//   calibration    40, random over the events as they occur;
//   heldout-random 40, the same way, from what is left;
//   heldout-hard   40, on purpose: every outline-only detection up to 20 (fewer: all, and the outline branch cannot
//                  pass on its own), then threshold-edge cases on both sides, approved-not-drawn, lyric-only and
//                  ground-only (ink, texture) changes, micro-moves, scale relations, hold-level beats;
//   12 hidden repeats of samples already drawn, given their own ids and shuffled in.
// Every event of one world, song and line (any seed, font or version, and the old 28 Claude-labelled events, dev data
// only) is one group: a group goes to one pool or none. The owner gets anonymous ids only (manifest.json); which event,
// world, version and verdict an id is goes to key.json, which the owner never sees.
//   npx tsx --tsconfig tsconfig.json scripts/lyric-vj/label-samples.mts [--seed 20261110] [--out out/research/labelling-1110]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { SEEN } from './frame-change.mts';
import { GROUPS, THIRTEEN } from './phase4-groups.mts';

export const SONGS: Record<string, { db: string; tempo: 'fast' | 'calm' }> = {
  nun: { db: 'yt_w_fCuUR3lEs', tempo: 'fast' }, snow: { db: 'yt_5i50aTB7JFo', tempo: 'calm' },
  tenmon: { db: 'yt_iwYXfOhcsYI', tempo: 'fast' }, tsuzuki: { db: 'yt_b3GCfyNKeLs', tempo: 'calm' },
};
/** The measurements the pool is read from, latest first; `only` keeps a source's rows or frames. */
export const SOURCES: { file: string; version: string; env?: Record<string, string>; only?: (row: Row, f: Frame) => boolean }[] = [
  { file: 'out/research/q1-1109/phase4b-r2-frames-s0.json', version: '4b-r2' },
  { file: 'out/research/q1-1109/phase4a.json', version: '4a', only: (r) => r.seed === 0 && !THIRTEEN.includes(r.world) },
  { file: 'out/research/labelling-1110/measure-ja-s0.json', version: 'ja' },
  { file: 'out/research/labelling-1110/measure-scale-riso-s0.json', version: 'scale', env: { VJ_SCALE: '1' }, only: (_r, f) => !!f.policy?.some((p) => p.startsWith('scale')) },
];
const CALIB = 'out/research/q1-1109/calib/index.json';

export interface Frame { at: number; kind: string; scope: string; lineIds: string[]; material?: string; holdLevel?: boolean; unreliableBoundary?: boolean; outlineOnly?: boolean; policy?: string[]; absorbed?: string; realized: boolean; why: string; t?: [number, number]; m?: Record<string, number | boolean> }
export interface Row { world: string; window: string; song: string; seed: number; range: [number, number]; wired: { unlaid: number[]; frames?: Frame[] } }
export type Verdict = 'realized' | 'outlineOnly' | 'unrealized' | 'approvedNotDrawn';
export interface PoolEvent {
  group: string; world: string; song: string; window: string; version: string; commit: string; env?: Record<string, string>;
  at: number; kind: string; scope: string; lineIds: string[]; text: string; t?: [number, number]; m?: Record<string, number | boolean>;
  verdict: Verdict; why: string; noReadingTime: boolean;
  strata: { worldGroup: 'five' | 'eight' | 'other'; tempo: 'fast' | 'calm'; lang: 'ja' | 'zh' | 'en'; length: 'short' | 'mid' | 'long'; event: 'seat' | 'scale' | 'carrier' | 'reframe' | 'hold' };
  tags: string[];
}

/** A small seeded generator (mulberry32): the same seed, the same draw. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const shuffle = <T,>(xs: T[], r: () => number): T[] => { const out = [...xs]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

const langOf = (text: string): 'ja' | 'zh' | 'en' => {
  if (/[぀-ヿ]/.test(text)) return 'ja';
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  return latin > cjk ? 'en' : 'zh';
};
const lengthOf = (text: string) => { const n = [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length; return n <= 6 ? 'short' : n <= 12 ? 'mid' : 'long'; };
const eventOf = (f: Frame): PoolEvent['strata']['event'] => (f.holdLevel ? 'hold' : f.policy?.some((p) => p.startsWith('scale')) ? 'scale' : f.kind === 'camera-reframe' ? 'reframe' : f.kind === 'page-handoff' || f.kind === 'carrier-swap' ? 'carrier' : 'seat');

/**
 * The hard-case tags of one event, off its numbers against SEEN: each threshold's ratio (scale and relation on their
 * excess over 1). Edge: the deciding ratio within 0.8–1.25 of its threshold (above: seen, below: not). Micro: not seen
 * and a small move. Lyric-only: not seen and nothing else near a threshold. Ground-only: not seen and the ground or ring
 * near one (an ink, texture or plate change), or an absorbed ink hold.
 */
export function tagsOf(f: Frame, verdict: Verdict): string[] {
  const tags: string[] = [];
  if (verdict === 'outlineOnly') tags.push('outlineOnly');
  if (verdict === 'approvedNotDrawn') tags.push('approvedNotDrawn');
  if (eventOf(f) === 'scale') tags.push('scale');
  if (f.holdLevel) tags.push('hold');
  if (f.absorbed) tags.push('groundOnly');
  const m = f.m as Record<string, number> | undefined;
  if (!m) return tags;
  const r = { shift: m['shift'] / SEEN.shift, scale: (m['scale'] - 1) / (SEEN.scale - 1), relation: (m['relation'] - 1) / (SEEN.relation - 1), page: m['page'] / SEEN.page, onCarrier: m['onCarrier'] / SEEN.onCarrier, outline: m['outline'] / SEEN.outline };
  const top = Math.max(...Object.values(r));
  if (f.realized && top < 1.25) tags.push('edgeAbove');
  if (!f.realized && top >= 0.8 && !m['turned']) tags.push('edgeBelow');
  if (!f.realized && m['shift'] >= 0.015 && m['shift'] < SEEN.shift) tags.push('micro');
  if (!f.realized && top < 0.4) tags.push('lyricOnly');
  if (!f.realized && Math.max(r.page, r.outline) >= 0.4 && Math.max(r.shift, r.scale, r.relation) < 0.8) tags.push('groundOnly');
  return [...new Set(tags)];
}

/** The pool: every planned event of the sources, one version each (the first source that has it), with its group. */
export function buildPool(sources: { version: string; commit: string; env?: Record<string, string>; rows: Row[]; only?: (r: Row, f: Frame) => boolean }[], texts: (song: string, id: string) => string, excluded: Set<string>): { pool: PoolEvent[]; excludedEvents: number } {
  const seen = new Set<string>();
  const pool: PoolEvent[] = [];
  let excludedEvents = 0;
  for (const s of sources) for (const r of s.rows) for (const f of r.wired.frames ?? []) {
    if (s.only && !s.only(r, f)) continue;
    const line = f.lineIds.at(-1)!;
    const group = `${r.world}|${r.song}|${line}`;
    const same = `${group}|${f.kind}|${f.scope}|${Math.round(f.at * 10)}|${eventOf(f)}`;
    if (seen.has(same)) continue;
    seen.add(same);
    if (excluded.has(group)) { excludedEvents++; continue; }
    const verdict: Verdict = r.wired.unlaid.some((t) => Math.abs(t - f.at) < 0.05) ? 'approvedNotDrawn' : f.outlineOnly ? 'outlineOnly' : f.realized ? 'realized' : 'unrealized';
    const text = f.lineIds.map((id) => texts(r.song, id)).join(' / ');
    pool.push({
      group, world: r.world, song: r.song, window: r.window, version: s.version, commit: s.commit, ...(s.env ? { env: s.env } : {}),
      at: f.at, kind: f.kind, scope: f.scope, lineIds: f.lineIds, text, ...(f.t ? { t: f.t } : {}), ...(f.m ? { m: f.m } : {}),
      verdict, why: f.why, noReadingTime: !f.t,
      strata: { worldGroup: (GROUPS.five as readonly string[]).includes(r.world) ? 'five' : (GROUPS.eight as readonly string[]).includes(r.world) ? 'eight' : 'other', tempo: SONGS[r.song].tempo, lang: langOf(texts(r.song, line)), length: lengthOf(texts(r.song, line)), event: eventOf(f) },
      tags: tagsOf(f, verdict),
    });
  }
  return { pool, excludedEvents };
}

export type PoolName = 'calibration' | 'heldout-random' | 'heldout-hard';
export interface Drawn { pool: PoolName; event: PoolEvent; reason?: string }
/** The order hard cases are drawn in after the outline-only ones (one of each in turn). */
export const HARD_ORDER = ['edgeAbove', 'edgeBelow', 'approvedNotDrawn', 'lyricOnly', 'groundOnly', 'micro', 'scale', 'hold'] as const;

/**
 * Draw the three pools: hard first (so the rare cases are not used up by chance), then the random held-out, then the
 * calibration set. A group drawn once is closed to every later draw. Events without stable reading frames are left out
 * (nothing to show the owner as stable); the counts say how many.
 */
export function draw(pool: PoolEvent[], seed: number, n = { calibration: 40, random: 40, hard: 40, outline: 20 }): { drawn: Drawn[]; outlineAvailable: number; outlineShort: boolean } {
  const r = rng(seed);
  const used = new Set<string>();
  const usable = pool.filter((e) => !e.noReadingTime);
  const drawn: Drawn[] = [];
  const take = (e: PoolEvent, p: PoolName, reason?: string) => { used.add(e.group); drawn.push({ pool: p, event: e, ...(reason ? { reason } : {}) }); };
  const free = (xs: PoolEvent[]) => xs.filter((e) => !used.has(e.group));
  const outline = shuffle(usable.filter((e) => e.verdict === 'outlineOnly'), r);
  let hard = 0;
  for (const e of outline) { if (hard >= Math.min(n.outline, n.hard)) break; if (used.has(e.group)) continue; take(e, 'heldout-hard', 'outlineOnly'); hard++; }
  const outlineAvailable = new Set(outline.map((e) => e.group)).size;
  const buckets = HARD_ORDER.map((tag) => ({ tag, xs: shuffle(usable.filter((e) => e.tags.includes(tag)), r) }));
  // (then the rest of the outline-only, if there were more than 20, as one more bucket)
  buckets.push({ tag: 'outlineOnly' as never, xs: outline });
  while (hard < n.hard) {
    let got = false;
    for (const b of buckets) {
      if (hard >= n.hard) break;
      const e = free(b.xs)[0];
      if (!e) continue;
      take(e, 'heldout-hard', b.tag);
      hard++;
      got = true;
    }
    if (!got) break;
  }
  // (hard cases used up: the rest of the 40 at random, marked, so the shortfall shows in the key)
  for (const e of shuffle(usable, r)) { if (hard >= n.hard) break; if (used.has(e.group)) continue; take(e, 'heldout-hard', 'fill: no hard case left'); hard++; }
  for (const [p, k] of [['heldout-random', n.random], ['calibration', n.calibration]] as const) {
    let c = 0;
    for (const e of shuffle(usable, r)) { if (c >= k) break; if (used.has(e.group)) continue; take(e, p); c++; }
  }
  return { drawn, outlineAvailable, outlineShort: outlineAvailable < n.outline };
}

/** Anonymous ids over the drawn samples and their hidden repeats, all shuffled together: s001, s002, … */
export function anonymise(drawn: Drawn[], seed: number, repeats = 12): { id: string; of: number; repeatOf?: string }[] {
  const r = rng(seed ^ 0x5eed);
  const rep = shuffle(drawn.map((_, i) => i), r).slice(0, repeats);
  const items = shuffle([...drawn.map((_, i) => ({ of: i, repeat: false })), ...rep.map((i) => ({ of: i, repeat: true }))], r);
  const ids = items.map((x, k) => ({ ...x, id: `s${String(k + 1).padStart(3, '0')}` }));
  return ids.map((x) => ({ id: x.id, of: x.of, ...(x.repeat ? { repeatOf: ids.find((y) => y.of === x.of && !y.repeat)!.id } : {}) }));
}

const count = (xs: PoolEvent[], f: (e: PoolEvent) => string) => xs.reduce<Record<string, number>>((m, e) => ({ ...m, [f(e)]: (m[f(e)] ?? 0) + 1 }), {});

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values: a } = parseArgs({ options: { seed: { type: 'string', default: '20261110' }, out: { type: 'string', default: 'out/research/labelling-1110' } } });
  const seed = Number(a.seed);
  const songs = Object.fromEntries(Object.entries(SONGS).map(([k, s]) => [k, JSON.parse(readFileSync(`out/db/${s.db}/song.json`, 'utf8')) as { cues: { id: string; text: string; start: number; end: number }[] }]));
  const texts = (song: string, id: string) => songs[song].cues.find((c) => c.id === id)?.text ?? '';
  const missing = SOURCES.filter((s) => !existsSync(s.file)).map((s) => s.file);
  if (missing.length) console.error('missing sources (left out):', missing);
  const sources = SOURCES.filter((s) => existsSync(s.file)).map((s) => { const j = JSON.parse(readFileSync(s.file, 'utf8')); return { ...s, commit: String(j.commit), rows: (j.rows as Row[]).filter((r) => r.wired.frames) }; });
  // (the 28 Claude-labelled calibration events of phase 3a: dev data only, their groups closed)
  const calib = JSON.parse(readFileSync(CALIB, 'utf8')).events as Record<string, { world: string; clip: 'fast' | 'calm'; lineIds: string[] }>;
  const excluded = new Set(Object.values(calib).map((e) => `${e.world}|${e.clip === 'fast' ? 'nun' : 'snow'}|${e.lineIds.at(-1)}`));
  const { pool, excludedEvents } = buildPool(sources, texts, excluded);
  const { drawn, outlineAvailable, outlineShort } = draw(pool, seed);
  const ids = anonymise(drawn, seed);
  const clipOf = (e: PoolEvent) => { const [b, f] = e.t ?? [e.at - 0.5, e.at + 0.5]; const from = Math.max(0, Math.min(e.at - 1.5, b - 0.4)); const to = Math.max(e.at + 1.5, f + 0.4); return { from: +from.toFixed(2), to: +Math.min(to, from + 7).toFixed(2), stills: [b, f] }; };
  const key = Object.fromEntries(ids.map((x) => { const d = drawn[x.of]; return [x.id, { pool: d.pool, ...(d.reason ? { drawnAs: d.reason } : {}), ...(x.repeatOf ? { repeatOf: x.repeatOf } : {}), clip: clipOf(d.event), ...d.event }]; }));
  const strata = (xs: PoolEvent[]) => ({ events: xs.length, groups: new Set(xs.map((e) => e.group)).size, verdict: count(xs, (e) => e.verdict), worldGroup: count(xs, (e) => e.strata.worldGroup), tempo: count(xs, (e) => e.strata.tempo), lang: count(xs, (e) => e.strata.lang), length: count(xs, (e) => e.strata.length), event: count(xs, (e) => e.strata.event), tags: xs.reduce<Record<string, number>>((m, e) => { for (const t of e.tags) m[t] = (m[t] ?? 0) + 1; return m; }, {}), noReadingTime: xs.filter((e) => e.noReadingTime).length, worlds: new Set(xs.map((e) => e.world)).size });
  const byPool = Object.fromEntries((['calibration', 'heldout-random', 'heldout-hard'] as const).map((p) => [p, strata(drawn.filter((d) => d.pool === p).map((d) => d.event))]));
  const commit = execSync('git rev-parse --short HEAD').toString().trim();
  mkdirSync(a.out!, { recursive: true });
  const manifest = { seed, commit, date: new Date().toISOString().slice(0, 10), note: 'anonymous sample ids for the owner; what each id is lives in key.json (never shown to the owner)', samples: ids.map((x) => ({ id: x.id, clip: `${x.id}.mp4`, stills: [`${x.id}_1.png`, `${x.id}_2.png`] })) };
  const keyOut = { seed, commit, sources: sources.map((s) => ({ file: s.file, version: s.version, commit: s.commit, ...(s.env ? { env: s.env } : {}) })), excludedDev: { calibEvents: Object.keys(calib).length, poolEventsInThoseGroups: excludedEvents }, outlineAvailable, outlineShort, ...(outlineShort ? { outlineBranch: 'fewer than 20 outline-only detections: all taken; the outline branch cannot auto-pass' } : {}), pool: strata(pool), byPool, samples: key };
  writeFileSync(join(a.out!, 'manifest.json'), JSON.stringify(manifest, null, 1));
  writeFileSync(join(a.out!, 'key.json'), JSON.stringify(keyOut, null, 1));
  console.log(JSON.stringify({ pool: strata(pool), outlineAvailable, outlineShort, drawn: Object.fromEntries(Object.entries(byPool).map(([k, v]) => [k, v.events])), repeats: ids.filter((x) => x.repeatOf).length, total: ids.length }, null, 1));
}
