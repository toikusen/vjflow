// Q3 / Q5 phase 2 wiring (docs/research/2026-11-10-q3q5-phase2.md): the scale policy's seats and the moment policy's
// candidates as PolicyCandidates of planWorldEvents(), the scale composition as drawn (render/scale-pose.ts), the mini
// moments' region, and the default output untouched with the wiring off.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { MINI_MAIN } from './moment-policy';
import { miniRegion } from './mini-moments';
import { boxesMeet } from './render/seat-geometry';
import { momentCandidates, scaleCandidates } from './policy-candidates';
import { SCALE_HOLDS, scaleLayout, type LineScale } from './render/scale-pose';
import { estimateMeasure, FRAME, pickScaleContrasts, type ScaleLine } from './scale-policy';
import { DECLARED_SCALE_CAPS } from './scale-caps-draft';
import { planWorldEvents, type PolicyCandidate, type WorldEventInput, type WorldEventLine } from './world-events';
import { MINI_SHARE, momentsCapOf, scaleOf } from './world-shared';

const safe = { x0: FRAME.safeX, y0: FRAME.safeY, x1: FRAME.w - FRAME.safeX, y1: FRAME.h - FRAME.safeY };
const wline = (id: string, start: number, end: number, o: Partial<WorldEventLine> = {}): WorldEventLine => ({ id, show: start - 0.2, start, end, seats: [{ id: 'w/a' }], seat: 'w/a', pinned: 'composition capability off', ...o });
const offCaps = { worldId: 'w', kinds: [], seats: ['w/a'], carrierRole: 'ground' as const, source: 'declared-off' as const };
const input = (lines: WorldEventLine[], o: Partial<WorldEventInput> = {}): WorldEventInput => ({ lines, beats: [], sections: [{ start: 0, energy: 0.5 }], caps: offCaps, seed: 0, ...o });
const q3 = (lineId: string, show: number, group: string, rank: number, o: Partial<PolicyCandidate> = {}): PolicyCandidate => ({ source: 'Q3', id: `scale:${lineId}#${rank}`, group, rank, lineId, kind: 'layout-seat', at: show, from: show, to: show, seatAfter: `w/a+scale:bottom`, seat: { id: 'w/a+scale:bottom', box: { x0: 0.1, y0: 0.6, x1: 0.6, y1: 0.95 } }, holdsOk: SCALE_HOLDS, folds: ['line-grow'], reason: 'test', ...o });
const q5 = (lineId: string, at: number, rank: number, o: Partial<PolicyCandidate> = {}): PolicyCandidate => ({ source: 'Q5', id: `moment:${lineId}:shape/fall#${rank}`, group: `ref#moments[${rank}]`, rank, lineId, kind: 'signature-moment', at, from: at - 0.25, to: at + 0.8, changesLight: false, budget: { key: 'Q5', max: 2, apart: 30, section: String(Math.floor(at / 40)) }, meaningRef: `ref#moments[${rank}]`, variant: 'mini', reason: 'test', ...o });

describe('planWorldEvents: Q3 candidates', () => {
  it('approves at most one scale contrast a section, trying the next when one is refused', () => {
    const lines = [wline('a', 1, 4), wline('b', 5, 8), wline('c', 11, 14)];
    const plan = planWorldEvents(input(lines, { holds: [{ lineId: 'a', at: 2, from: 2, to: 2.3, kind: 'carrier-settle' }], candidates: [q3('a', 0.8, 'S0', 0), q3('b', 4.8, 'S0', 1), q3('c', 10.8, 'S1', 0)] }));
    const ok = plan.policy!.filter((d) => d.approved);
    expect(ok.map((d) => d.lineId)).toEqual(['b', 'c']);
    expect(plan.policy!.find((d) => d.lineId === 'a')!.reason).toMatch(/^collisionQ2hold/);
    expect(new Set(ok.map((d) => d.group)).size).toBe(ok.length);
    // one event each, its id the candidate's, the line's keep replaced (no second switch)
    for (const d of ok) expect(plan.events.filter((e) => e.lineIds.includes(d.lineId) && e.kind !== 'keep').map((e) => e.id)).toEqual([d.eventId]);
  });

  it('lets a glyph-level hold run, folds a line-grow into the scale event, and refuses a carrier hold', () => {
    const lines = [wline('a', 1, 4), wline('b', 5, 8), wline('c', 9, 12)];
    const holds = [{ lineId: 'a', at: 2, from: 2, to: 2.9, kind: 'ink-run' }, { lineId: 'b', at: 6, from: 6, to: 6.3, kind: 'line-grow' }, { lineId: 'c', at: 10, from: 10, to: 10.3, kind: 'panel-open' }];
    const plan = planWorldEvents(input(lines, { holds, candidates: [q3('a', 0.8, 'A', 0), q3('b', 4.8, 'B', 0), q3('c', 8.8, 'C', 0)] }));
    const by = (id: string) => plan.policy!.find((d) => d.lineId === id)!;
    expect(by('a').approved).toBe(true);
    expect(plan.holds.some((h) => h.lineId === 'a')).toBe(true);
    expect(by('b').approved).toBe(true);
    expect(plan.holds.some((h) => h.lineId === 'b')).toBe(false);
    expect(plan.events.find((e) => e.id === by('b').eventId)!.merged).toEqual(['hold:line-grow@b']);
    expect(by('c').approved).toBe(false);
  });

  it('shares the line\'s own Q1 switch: one event id, one window, one count', () => {
    // a pinned line whose composed seat differs from the one before is a fixed layout-seat event of Q1's
    const seats = (id: string) => [{ id, box: { x0: id === 'w/b' ? 0.5 : 0.05, y0: 0.1, x1: id === 'w/b' ? 0.95 : 0.45, y1: 0.3 } }];
    const lines = [wline('a', 1, 4, { seats: seats('w/a'), seat: 'w/a' }), wline('b', 5, 8, { seats: seats('w/b'), seat: 'w/b' })];
    const without = planWorldEvents(input(lines));
    const q1 = without.events.find((e) => e.lineIds.includes('b') && e.kind === 'layout-seat')!;
    expect(q1).toBeDefined();
    const plan = planWorldEvents(input(lines, { candidates: [q3('b', 4.8, 'S', 0)] }));
    const d = plan.policy![0];
    expect(d.approved && d.shared).toBe(true);
    expect(d.eventId).toBe(q1.id);
    expect(plan.events.length).toBe(without.events.length);
    expect(plan.events.find((e) => e.id === q1.id)!.policy).toEqual(['scale:b#0']);
  });

  it('refuses a line a Q4 handoff lays, a camera moves into, or a seat entering a protected region', () => {
    const lines = [wline('a', 1, 4), wline('b', 5, 8), wline('c', 9, 12), wline('d', 13, 16)];
    const plan = planWorldEvents(input(lines, {
      handoffs: [{ lineId: 'b', kind: 'link-x', dir: 1, seam: 4.8, dur: 0.6, prepare: 0.3 }],
      cams: [{ lineId: 'c', at: 8.8, sec: 0.5, kind: 'push' }],
      caps: { ...offCaps, protectedRegion: [{ x0: 0, y0: 0.9, x1: 1, y1: 1 }] },
      candidates: [q3('b', 4.8, 'B', 0), q3('c', 8.8, 'C', 0), q3('d', 12.8, 'D', 0)],
    }));
    expect(plan.policy!.map((d) => d.reason.split(':')[0])).toEqual(['collisionQ4', 'collisionCamera', 'protectedRegion']);
  });

  it('reads nothing when there are no candidates: the plan is exactly the plan without them', () => {
    const lines = [wline('a', 1, 4), wline('b', 5, 8)];
    expect(planWorldEvents(input(lines))).toEqual(planWorldEvents(input(lines, {})));
    expect(planWorldEvents(input(lines)).policy).toBeUndefined();
  });
});

describe('planWorldEvents: Q5 candidates', () => {
  it('keeps two a song, 30 s apart, one a section, by rank', () => {
    const lines = [wline('a', 1, 4), wline('b', 10, 13), wline('c', 45, 48), wline('d', 50, 53), wline('e', 90, 93)];
    const plan = planWorldEvents(input(lines, { candidates: [q5('a', 2, 0), q5('b', 11, 1), q5('d', 51, 2), q5('c', 46, 3), q5('e', 91, 4)] }));
    const ok = plan.policy!.filter((d) => d.approved);
    expect(ok.map((d) => d.lineId)).toEqual(['a', 'd']);
    expect(plan.policy!.find((d) => d.lineId === 'b')!.reason).toMatch(/^budget: within 30s/);
    expect(plan.policy!.find((d) => d.lineId === 'c')!.reason).toMatch(/^budget/);
    expect(plan.policy!.find((d) => d.lineId === 'e')!.reason).toMatch(/^budget: 2 already/);
    // never a composition event: the cut counts do not move
    expect(plan.events).toEqual(planWorldEvents(input(lines)).events);
  });

  it('passes a candidate colliding with a Q2 hold to the next one, never moving its onset', () => {
    const lines = [wline('a', 1, 4), wline('b', 40, 43)];
    const plan = planWorldEvents(input(lines, { holds: [{ lineId: 'a', at: 2.2, from: 2.2, to: 2.5, kind: 'ink-swap' }], candidates: [q5('a', 2, 0), q5('b', 41, 1)] }));
    const [a, b] = plan.policy!;
    expect(a.approved).toBe(false);
    expect(a.reason).toMatch(/^collisionQ2hold/);
    expect(a.at).toBe(2);
    expect(b.approved).toBe(true);
    expect(b.at).toBe(41);
  });

  it('tries a moment\'s mini when its big variant meets a change of light', () => {
    const lines = [wline('a', 1, 4)];
    const big = q5('a', 2, 0, { variant: 'big', changesLight: true, id: 'moment:a:big', from: 0.8, to: 5 });
    const mini = q5('a', 2, 1, { group: big.group, meaningRef: big.meaningRef, id: 'moment:a:mini' });
    const plan = planWorldEvents(input(lines, { lights: [{ at: 2.3, what: 'ground cut' }], candidates: [big, mini] }));
    expect(plan.policy!.map((d) => [d.id, d.approved])).toEqual([['moment:a:big', false], ['moment:a:mini', true]]);
  });
});

describe('scaleLayout (the scale composition as drawn)', () => {
  const plan = (o: Partial<LineScale> = {}): LineScale => ({ eventId: 'scale:c1', sectionId: 'S0', kind: 'edgeFit', source: 'meaning', ratio: 2.4, targetSize: 240, readingSize: 100, span: { from: 3, to: 7 }, edge: 'bottom', rows: ['天荒地老'], carrierRole: 'paper', carrierId: 'paper:riso', ...o });

  it('sets the ink box flush on the safe edge, runs the carrier off the frame, bleeds nothing and shrinks no other word', () => {
    const d = scaleLayout('我愛你天荒地老', plan(), 100, { track: 0.02 }, estimateMeasure);
    expect(d.kind).toBe('edgeFit');
    // (on the safe edge to a pixel: the seat's boxes are frame fractions to 3 decimals)
    expect(Math.abs(d.inkBox!.y1 - safe.y1)).toBeLessThan(1);
    expect(d.carrierBox!.y1).toBeGreaterThan(1);
    for (const g of d.glyphs) {
      expect(g.x - g.size / 2).toBeGreaterThanOrEqual(safe.x0 - 1);
      expect(g.x + g.size / 2).toBeLessThanOrEqual(safe.x1 + 1);
      expect(g.y - g.size / 2).toBeGreaterThanOrEqual(safe.y0 - 1);
      expect(g.y + g.size / 2).toBeLessThanOrEqual(safe.y1 + 1);
      expect(g.size).toBe(g.role === 'big' ? d.size : 100);
    }
    expect(d.glyphs.filter((g) => g.role === 'big').map((g) => g.i)).toEqual([3, 4, 5, 6]);
    expect(d.glyphs.filter((g) => g.role === 'before').map((g) => g.i)).toEqual([0, 1, 2]);
  });

  it('keeps the 1.6× floor, marks a smaller drawing unrealized, and calls 1.6–1.8× an ordinary contrast', () => {
    expect(scaleLayout('我愛你天荒地老', plan({ targetSize: 150 }), 100, {}, estimateMeasure).kind).toBe('miss');
    // drawn at a larger reading size than planned: the ratio falls under the plan's
    const d = scaleLayout('我愛你天荒地老', plan({ targetSize: 240 }), 140, {}, estimateMeasure);
    expect(d.ratio).toBeCloseTo(240 / 140, 2);
    expect(d.kind).toBe('scale');
    expect(d.unrealized).toBe(true);
    expect(scaleLayout('我愛你天荒地老', plan({ source: 'sectionScale', span: { from: 0, to: 7 }, rows: ['我愛你天荒地老'] }), 100, {}, estimateMeasure).kind).toBe('scale');
  });
});

describe('miniRegion (a mini moment\'s own area)', () => {
  it('takes 15–30 % of the frame beside the words, never meeting a line\'s box', () => {
    const avoid = [{ x0: 0.1, y0: 0.55, x1: 0.9, y1: 0.85 }];
    const r = miniRegion(avoid, [0.15, 0.3])!;
    const share = (r.x1 - r.x0) * (r.y1 - r.y0);
    expect(share).toBeGreaterThanOrEqual(0.15);
    expect(share).toBeLessThanOrEqual(0.3 + 1e-3);
    expect(avoid.some((a) => boxesMeet(a, r))).toBe(false);
    // (trimmed on the side away from the words: it stays next to them)
    expect(r.y1).toBeCloseTo(0.55, 2);
  });

  it('gives none when the words leave no band that large', () => {
    expect(miniRegion([{ x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.9 }], [0.15, 0.3])).toBeUndefined();
    expect(miniRegion([], [0.15, 0.3])).toBeUndefined();
  });
});

describe('world capabilities', () => {
  it('declares scale for riso and screentone only, and moments for the 45 offered worlds', () => {
    expect(Object.keys(DECLARED_SCALE_CAPS).sort()).toEqual(['riso', 'screentone']);
    expect(FREE_STYLES.filter((s) => scaleOf(s.id)).map((s) => s.id).sort()).toEqual(['riso', 'screentone']);
    expect(momentsCapOf('no-such-world')).toBeUndefined();
    expect(scaleOf('no-such-world')).toBeUndefined();
    expect(MINI_SHARE).toEqual([0.15, 0.3]);
    for (const s of FREE_STYLES) { const m = momentsCapOf(s.id); if (m) expect(m.mini).not.toContain('scene'); }
  });

  it('gives an undeclared world no Q3 / Q5 candidate', () => {
    const world = { ...FREE_STYLES.find((s) => s.id === 'riso')!.world, id: 'no-such-world' };
    const free = { job: { cues: [] }, plan: { shots: [] } } as never;
    expect(scaleCandidates(free, { cues: [], sections: [] } as never, world, { seed: 0, songId: 'x' })).toBeUndefined();
    expect(momentCandidates(free, { cues: [], sections: [] } as never, world, undefined, 'x')).toBeUndefined();
  });
});

describe('pickScaleContrasts ranked fallbacks', () => {
  it('lists the chosen seat first and every other legal one after it, one list a section', () => {
    const line = (id: string, text: string, start: number): ScaleLine => ({ id, text, show: start - 0.2, start, end: start + 3, readingSize: 100, seat: { id: `w/${id}` } });
    const p = pickScaleContrasts({ songId: 's', worldId: 'riso', seed: 0, lines: [line('a', '天荒地老', 1), line('b', '海枯石爛', 5)], sections: [{ id: 'S0', start: 0, end: 10 }], keys: [{ cue: 'a', phrase: '天荒地老' }], caps: DECLARED_SCALE_CAPS['riso'] });
    expect(p.ranked.length).toBe(1);
    expect(p.ranked[0][0].eventId).toBe(p.seats[0].eventId);
    expect(new Set(p.ranked[0].map((s) => s.eventId)).size).toBe(p.ranked[0].length);
    expect(p.ranked[0].length).toBeGreaterThanOrEqual(2);
  });
});

const SONGS = [
  { id: 'snow', db: 'out/db/yt_5i50aTB7JFo/song.json', meaning: 'out/research/instant/plans/snow/meaning.json' },
  { id: 'tsuzuki', db: 'out/db/yt_b3GCfyNKeLs/song.json', meaning: 'out/research/instant/plans/tsuzuki/meaning.json' },
];
const haveOut = SONGS.every((s) => existsSync(s.db) && existsSync(s.meaning));

describe.skipIf(!haveOut)('freeJob with the Q3 / Q5 wiring (三年後的大雪, 世界のつづき)', () => {
  const load = (s: (typeof SONGS)[number]) => ({ song: JSON.parse(readFileSync(s.db, 'utf8')), meaning: JSON.parse(readFileSync(s.meaning, 'utf8')) });
  const style = (id: string) => FREE_STYLES.find((s) => s.id === id)!;

  it('leaves the default output byte-identical with the wiring off', () => {
    const { song, meaning } = load(SONGS[0]);
    for (const id of ['riso', 'screentone', 'silk']) {
      const base = JSON.stringify(freeJob(song, { style: style(id), seed: 0, meaning }).job);
      expect(JSON.stringify(freeJob(song, { style: style(id), seed: 0, meaning, scaleContrast: false, meaningMoments: false }).job)).toBe(base);
      expect(base).not.toContain('"scale":{"eventId"');
      expect(base).not.toContain('miniMoments');
      expect(base).not.toContain('"policy"');
    }
  });

  it('is seeded: the same input gives the same plan', () => {
    const { song, meaning } = load(SONGS[0]);
    const run = () => JSON.stringify(freeJob(song, { style: style('screentone'), seed: 1, meaning, scaleContrast: true, meaningMoments: true }).job);
    expect(run()).toBe(run());
  });

  it('writes each approved scale composition onto its line, one a section, attributed to the section it starts in', () => {
    const { song, meaning } = load(SONGS[0]);
    const f = freeJob(song, { style: style('screentone'), seed: 0, meaning, scaleContrast: true });
    const scaled = (f.treatment.cues as { cueId: string; world?: { scale?: LineScale } }[]).filter((c) => c.world?.scale);
    expect(scaled.length).toBeGreaterThan(0);
    const sections = scaled.map((c) => c.world!.scale!.sectionId);
    expect(new Set(sections).size).toBe(sections.length);
    for (const c of scaled) {
      const cue = song.cues.find((x: { id: string }) => x.id === c.cueId);
      const s = f.policy!.scale!.sections.find((x) => x.sectionId === c.world!.scale!.sectionId)!;
      expect(cue.start).toBeGreaterThanOrEqual(s.start);
      expect(cue.start).toBeLessThan(s.end);
    }
    // an approved Q3 event is a table event (one count), every decision traceable to its section
    const ok = f.treatment.worldEvents!.policy!.filter((d) => d.source === 'Q3' && d.approved);
    expect(ok.length).toBe(scaled.length);
    for (const d of ok) expect(f.treatment.worldEvents!.events.some((e) => e.id === d.eventId && e.policy?.includes(d.id))).toBe(true);
  });

  it('turns approved moments into drawn ones traceable to the reading, minis in 15–30 % of the frame', () => {
    for (const s of SONGS) {
      const { song, meaning } = load(s);
      for (const id of ['riso', 'screentone', 'notebook']) {
        const f = freeJob(song, { style: style(id), seed: 0, meaning, worldEvents: true, meaningMoments: true, meaningRef: s.meaning });
        const t = f.treatment as { signature?: unknown[]; miniMoments?: { meaningRef: string; evidenceCueId: string; word: string; region: { x0: number; y0: number; x1: number; y1: number }; mainSec: number; at: number }[] };
        const n = (t.signature?.length ?? 0) + (t.miniMoments?.length ?? 0);
        expect(n).toBeLessThanOrEqual(2);
        for (const m of (t.miniMoments ?? []) as ((typeof t.miniMoments & object)[number] & { avoid: { x0: number; y0: number; x1: number; y1: number }[] })[]) {
          const share = (m.region.x1 - m.region.x0) * (m.region.y1 - m.region.y0);
          expect(m.avoid.some((a) => boxesMeet(a, m.region))).toBe(false);
          expect(share).toBeGreaterThanOrEqual(MINI_SHARE[0] - 0.01);
          expect(share).toBeLessThanOrEqual(MINI_SHARE[1] + 0.01);
          expect(m.region.x0).toBeGreaterThanOrEqual(0);
          expect(m.region.x1).toBeLessThanOrEqual(1);
          expect(m.mainSec).toBeGreaterThanOrEqual(MINI_MAIN[0]);
          expect(m.mainSec).toBeLessThanOrEqual(MINI_MAIN[1]);
          expect(m.meaningRef.startsWith(`${s.meaning}#moments[`)).toBe(true);
          const ask = meaning.moments[Number(m.meaningRef.match(/\[(\d+)\]$/)![1])];
          expect(ask.word.trim()).toBe(m.word);
          expect(ask.cues.at(-1)).toBe(m.evidenceCueId);
        }
      }
    }
  });

  it('with no reading: no moment, no API, a valid job', () => {
    const { song } = load(SONGS[0]);
    const f = freeJob(song, { style: style('riso'), seed: 0, scaleContrast: true, meaningMoments: true });
    expect(f.policy!.moments!.reason).toBe('noMeaningCandidate');
    expect((f.treatment as { miniMoments?: unknown[] }).miniMoments).toBeUndefined();
    expect(f.treatment.signature).toBeUndefined();
    expect(f.job.treatment.cues.length).toBeGreaterThan(0);
  });
});
