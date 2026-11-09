import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { OFFERED_STYLES } from './free-styles';
import type { WorldMomentCaps } from './moment-caps-draft';
import { momentCapsOf } from './moment-caps-draft';
import { MINI_MAIN, MINI_SHARE, MOMENT_FLOORS, MOMENTS_PER_SONG, rankMoments, RESTORE, type MomentCueIn, type MomentInput } from './moment-policy';
import { momentInputOf, todayGate } from './moment-policy-adapter';
import { checkMoments, MOMENTS_APART, type MomentAsk } from './signature-moments';

/** A line sung evenly over 80 % of its span; `timed` false = cue bounds only. */
const cue = (id: string, start: number, end: number, text: string, timed = true): MomentCueIn => {
  const n = [...text].length;
  return { id, start, end, text, ...(timed ? { charTimed: true, charStarts: [...text].map((_, i) => +(start + ((end - start) * 0.8 * i) / n).toFixed(3)) } : {}) };
};
const CAPS: WorldMomentCaps = { worldId: 'w', big: true, mini: ['page', 'type-only'], pieces: [], source: 'derived', why: 'test' };
// verse 0–40, chorus 40–100, verse 100–140, chorus 140–200; 120 bpm, a bar every 2 s
const SECTIONS = [
  { start: 0, end: 40, type: 'verse' },
  { start: 40, end: 100, type: 'chorus' },
  { start: 100, end: 140, type: 'verse' },
  { start: 140, end: 200, type: 'chorus' },
];
const beats = Array.from({ length: 400 }, (_, i) => i * 0.5);
const downbeats = beats.filter((_, i) => i % 4 === 0);
const ask = (cues: string[], form: string, variant: string, word: string, why = `the line is about ${word}`): MomentAsk => ({ cues, form, variant, word, why });
const input = (cues: MomentCueIn[], moments: unknown[] | undefined, o: Partial<MomentInput> = {}): MomentInput => ({
  meaning: moments === undefined ? undefined : { moments }, meaningRef: 'test/meaning.json', cues, sections: SECTIONS, beats, downbeats, tempo: 120, caps: CAPS, ...o,
});
const failedAt = (p: ReturnType<typeof rankMoments>, i = 0) => p.candidates[i].failed?.floor;

// a chorus line whose 'burn' lands on the 52 s downbeat: 'I ' is two chars, line 51.5–53.5 → b at 51.5 + 2·0.8·2/13 ≈ 51.746
const L = {
  a: cue('a', 10, 13, 'I burn it all'),
  chorus: cue('c', 52, 55, 'burn it down'),
  b: cue('b', 70, 73, 'let it snow'),
  c: cue('d', 110, 113, 'time stop now'),
  d: cue('e', 150, 153, 'the moon is high'),
};
const LINES = Object.values(L);

describe('rankMoments: the hard floors', () => {
  it('no reading, or a reading without moments, is noMeaningCandidate', () => {
    expect(rankMoments(input(LINES, undefined)).reason).toBe('noMeaningCandidate');
    expect(rankMoments(input(LINES, [])).reason).toBe('noMeaningCandidate');
  });
  it('never scans the lyric: a line full of trigger words and no candidate gives 0', () => {
    const lines = [cue('x', 52, 55, 'burn burn burn'), cue('y', 60, 63, 'break the chain, rain and snow, stop')];
    const p = rankMoments(input(lines, []));
    expect(p.chosen).toEqual([]);
    expect(p.candidates).toEqual([]);
    expect(p.reason).toBe('noMeaningCandidate');
  });
  it('source: an entry that is not a reading moment', () => {
    expect(failedAt(rankMoments(input(LINES, [{ cue: 'c', effect: 'burn' }])))).toBe('source');
  });
  it('legalCue: an undrawn form, an undrawn variant, an unknown line', () => {
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'spin', 'burn', 'burn')])))).toBe('legalCue');
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'explode', 'burn')])))).toBe('legalCue');
    expect(failedAt(rankMoments(input(LINES, [ask(['zz'], 'strike', 'burn', 'burn')])))).toBe('legalCue');
  });
  it('evidence: a word not in the line, or not of the sense', () => {
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'fire')])))).toBe('evidence');
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'down')])))).toBe('evidence');
  });
  it('negated: a negated word is not the thing happening', () => {
    const p = rankMoments(input([cue('n', 52, 55, 'I never burn')], [ask(['n'], 'strike', 'burn', 'burn')]));
    expect(failedAt(p)).toBe('negated');
    expect(p.candidates[0].failed!.reason).toContain('negated');
  });
  it('why: no traceable reason', () => {
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn', '')])))).toBe('why');
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn', 'burn')])))).toBe('why');
  });
  it('timing: cue bounds alone only place the first sung word', () => {
    const p = rankMoments(input([cue('u', 52, 55, 'I burn it all', false)], [ask(['u'], 'strike', 'burn', 'burn')]));
    expect(failedAt(p)).toBe('timing');
    const q = rankMoments(input([cue('u', 52, 55, 'burn it down', false)], [ask(['u'], 'strike', 'burn', 'burn')]));
    expect(q.candidates[0].failed).toBeUndefined();
    expect(q.candidates[0].timing).toBe('cueBounds');
    expect(q.candidates[0].at).toBe(52);
  });
  it('capability: a world with no big and no family for the form refuses it; a scene needs a piece about the word', () => {
    const typeOnly: WorldMomentCaps = { ...CAPS, big: false, mini: ['type-only'] };
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn')], { caps: typeOnly })))).toBe('capability');
    const scene: WorldMomentCaps = { ...CAPS, big: false, mini: ['scene'], pieces: [{ id: 'flare', words: /burn|fire/ }] };
    const p = rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn')], { caps: scene }));
    expect(p.chosen[0].family).toBe('scene');
    const off: WorldMomentCaps = { ...scene, pieces: [{ id: 'rain', words: /rain/ }] };
    expect(failedAt(rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn')], { caps: off })))).toBe('capability');
  });
  it('reading: a line with no time to be read whole', () => {
    const lines = [cue('r', 50, 50.5, 'I burn everything down tonight'), cue('s', 50.5, 52, 'and then')];
    expect(failedAt(rankMoments(input(lines, [ask(['r'], 'strike', 'burn', 'burn')])))).toBe('reading');
  });
  it('shout: a line with a call beside it is left alone', () => {
    const p = rankMoments(input([cue('h', 52, 55, 'I burn (hey)')], [ask(['h'], 'strike', 'burn', 'burn')]));
    expect(failedAt(p)).toBe('shout');
  });
  it('collision: the window includes the exit and restore', () => {
    const base = rankMoments(input(LINES, [ask(['b'], 'shape', 'fall', 'snow')], { caps: { ...CAPS, big: false } }));
    const m = base.chosen[0];
    expect(m.variant).toBe('mini');
    const end = m.at! + m.mainSec!;
    // a hold starting inside the restore collides; one starting after it (and the action gap) does not
    const inRestore = rankMoments(input(LINES, [ask(['b'], 'shape', 'fall', 'snow')], { caps: { ...CAPS, big: false }, protected: [{ id: 'h', source: 'Q2', from: end + RESTORE - 0.05, to: end + 1 }] }));
    expect(failedAt(inRestore)).toBe('collision');
    const after = rankMoments(input(LINES, [ask(['b'], 'shape', 'fall', 'snow')], { caps: { ...CAPS, big: false }, protected: [{ id: 'h', source: 'Q4', from: end + RESTORE + 0.15, to: end + 2 }] }));
    expect(after.chosen).toHaveLength(1);
  });
  it('a big moment that collides falls back to a mini, never moves its word', () => {
    const free = rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn')]));
    expect(free.chosen[0].variant).toBe('big');
    const at = free.chosen[0].at!;
    // a Q4 handoff into the next line, inside the big window (the line is held until then) but after the mini's
    const blocked = rankMoments(input(LINES, [ask(['c'], 'strike', 'burn', 'burn')], { protected: [{ id: 'q4', source: 'Q4', at: at + 2.5, from: at + 2.2, to: at + 2.8, changesLight: true }] }));
    expect(blocked.chosen[0].variant).toBe('mini');
    expect(blocked.chosen[0].at).toBe(at);
  });
  it('counts each candidate once, at its first failed floor', () => {
    const p = rankMoments(input(LINES, [{}, ask(['zz'], 'strike', 'burn', 'burn'), ask(['c'], 'strike', 'burn', 'fire'), ask(['c'], 'strike', 'burn', 'burn')]));
    expect(Object.keys(p.eliminated)).toEqual([...MOMENT_FLOORS]);
    expect(p.eliminated).toMatchObject({ source: 1, legalCue: 1, evidence: 1 });
    expect(Object.values(p.eliminated).reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe('rankMoments: ranking, budget, form', () => {
  it('is order independent: a better later candidate wins over an earlier one within 30 s (checkMoments keeps the earlier)', () => {
    const early = cue('v', 25, 28, 'I burn it all'); // verse, off the downbeat
    const late = cue('w', 42, 45, 'burn it down'); // chorus first line, 42 s downbeat
    const asks = [ask(['v'], 'strike', 'burn', 'burn'), ask(['w'], 'strike', 'burn', 'burn', 'the line is about burn: the song sets it alight')];
    const p = rankMoments(input([early, late], asks));
    expect(p.chosen.map((c) => c.ask!.cues[0])).toEqual(['w']);
    expect(p.candidates.find((c) => c.ask?.cues[0] === 'v')!.notChosen).toContain(`${MOMENTS_APART} s`);
    const q = rankMoments(input([early, late], [...asks].reverse()));
    expect(q.chosen.map((c) => c.scheduled.id)).toEqual(p.chosen.map((c) => c.scheduled.id));
    const sungOf = (id: string) => { const c = [early, late].find((x) => x.id === id)!; return { times: c.charStarts!, source: 'line' }; };
    expect(checkMoments(asks, [early, late], sungOf).kept.map((k) => k.cues[0])).toEqual(['v']);
  });
  it('keeps at most two, 30 s apart, one per section, and prefers another form for the second', () => {
    const lines = [cue('p', 52, 55, 'burn it down'), cue('q', 60, 63, 'I burn it all'), cue('r', 90, 93, 'let it snow'), cue('s', 142, 145, 'burn it down'), cue('t', 170, 173, 'time stop now')];
    const asks = [ask(['p'], 'strike', 'burn', 'burn'), ask(['q'], 'strike', 'burn', 'burn'), ask(['r'], 'shape', 'fall', 'snow'), ask(['s'], 'strike', 'burn', 'burn'), ask(['t'], 'freeze', 'stop', 'stop')];
    const p = rankMoments(input(lines, asks));
    expect(p.chosen.length).toBeLessThanOrEqual(MOMENTS_PER_SONG);
    expect(p.chosen).toHaveLength(2);
    const [a, b] = p.chosen;
    expect(Math.abs(a.at! - b.at!)).toBeGreaterThanOrEqual(MOMENTS_APART);
    expect(a.sectionIndex).not.toBe(b.sectionIndex);
    expect(`${a.ask!.form}/${a.ask!.variant}`).not.toBe(`${b.ask!.form}/${b.ask!.variant}`);
    // p (chorus downbeat) first; s scores the same but repeats strike/burn, so the freeze t comes second
    expect(p.chosen.map((c) => c.ask!.cues[0])).toEqual(['p', 't']);
    const why = (id: string) => p.candidates.find((c) => c.ask?.cues[0] === id)!.notChosen;
    expect(why('q')).toContain(`within ${MOMENTS_APART} s`);
    // r (91.5 s) is ≥ 30 s from p but in the same chorus section
    expect(why('r')).toContain('same section');
    expect(why('s')).toContain(`within ${MOMENTS_APART} s`);
    expect(p.chosen[1].score!.repetitionPenalty).toBe(0);
  });
  it('a legal candidate outside any chorus or downbeat is not eliminated', () => {
    const p = rankMoments(input([cue('v', 25.3, 28, 'I burn it all')], [ask(['v'], 'strike', 'burn', 'burn')]));
    expect(p.chosen).toHaveLength(1);
    expect(p.chosen[0].score!.musicalFit).toBeLessThan(0.6);
  });
  it('musicalFit: chorus downbeat above a section turn above another onset', () => {
    const fit = (c: MomentCueIn) => rankMoments(input([cue('z0', 1, 3, 'la la'), c], [ask([c.id], 'strike', 'burn', 'burn')])).candidates[0].score!.musicalFit;
    const onDown = fit(cue('k', 60, 63, 'burn it down')); // chorus, 60 s downbeat, not its first line? (z0 is in the verse)
    const turn = fit(cue('k', 100.3, 103, 'burn it down')); // first line of the verse at 100
    const other = fit(cue('k', 25.3, 28, 'burn it down'));
    expect(onDown).toBeGreaterThan(turn);
    expect(turn).toBeGreaterThan(other);
  });
  it('ochi prefers a sustained form to a strike', () => {
    const sections = SECTIONS.map((s, i) => (i === 2 ? { ...s, ochi: true } : s));
    const strike = rankMoments(input([cue('o', 110, 113, 'burn it down')], [ask(['o'], 'strike', 'burn', 'burn')], { sections })).candidates[0];
    const keep = rankMoments(input([cue('o', 110, 113, 'stop it now')], [ask(['o'], 'freeze', 'stop', 'stop')], { sections })).candidates[0];
    expect(keep.score!.musicalFit).toBeGreaterThan(strike.score!.musicalFit);
    expect(keep.variant).toBe('mini');
  });
  it('writes the score components and a scheduled candidate traced to the reading', () => {
    const p = rankMoments(input(LINES, [ask(['b'], 'shape', 'fall', 'snow')]));
    const m = p.chosen[0];
    const s = m.score!;
    for (const k of ['semanticSpecificity', 'worldFit', 'musicalFit', 'readingSlack', 'repetitionPenalty'] as const) { expect(s[k]).toBeGreaterThanOrEqual(0); expect(s[k]).toBeLessThanOrEqual(1); }
    expect(s.total).toBeCloseTo(4 * s.semanticSpecificity + 3 * s.worldFit + 2 * s.musicalFit + s.readingSlack - s.repetitionPenalty, 2);
    expect(m.scheduled).toMatchObject({ kind: 'signature-moment', fixed: false, meaningRef: 'test/meaning.json#moments[0]', cueIds: ['b'], at: m.at, from: m.window!.from, to: m.window!.to });
  });
  it('a mini: 15–30 % of the frame, a 0.35–0.6 s action at the word, only the preparation on a beat', () => {
    const p = rankMoments(input(LINES, [ask(['b'], 'shape', 'fall', 'snow')], { caps: { ...CAPS, big: false }, seats: { b: { x0: 0.1, y0: 0.4, x1: 0.5, y1: 0.5 } } }));
    const m = p.chosen[0];
    expect(m.variant).toBe('mini');
    expect(m.area!.share).toBeGreaterThanOrEqual(MINI_SHARE[0] - 1e-3);
    expect(m.area!.share).toBeLessThanOrEqual(MINI_SHARE[1] + 1e-3);
    expect(m.mainSec!).toBeGreaterThanOrEqual(MINI_MAIN[0]);
    expect(m.mainSec!).toBeLessThanOrEqual(MINI_MAIN[1]);
    expect(m.at).toBe(L.b.charStarts![7]);
    // (no beat 0.1–0.45 s before 71.527: the preparation stays at the word − 0.25)
    expect(m.prepareAt).toBeCloseTo(m.at! - 0.25, 3);
    expect(m.scheduled.render.ownsLines).toBe(false);
    // shifted so a beat (71.5) sits in reach: the preparation takes it, the word does not move
    const shifted = cue('b', 70.2, 73.2, 'let it snow');
    const q = rankMoments(input([shifted], [ask(['b'], 'shape', 'fall', 'snow')], { caps: { ...CAPS, big: false } })).chosen[0];
    expect(q.at).toBe(shifted.charStarts![7]);
    expect(beats).toContain(q.prepareAt);
  });
  it('is deterministic', () => {
    const asks = [ask(['c'], 'strike', 'burn', 'burn'), ask(['b'], 'shape', 'fall', 'snow'), ask(['e'], 'shape', 'circle', 'moon')];
    expect(rankMoments(input(LINES, asks))).toEqual(rankMoments(input(LINES, asks)));
  });
  it('agrees with checkMoments on each single ask (same guards, no caps)', () => {
    const lines = [...LINES, cue('n', 120, 123, 'I never burn'), cue('h', 160, 163, 'I burn (hey)'), cue('r', 180, 180.5, 'I burn everything down tonight'), cue('r2', 180.5, 182, 'and then')];
    const asks = [ask(['c'], 'strike', 'burn', 'burn'), ask(['b'], 'shape', 'fall', 'snow'), ask(['n'], 'strike', 'burn', 'burn'), ask(['h'], 'strike', 'burn', 'burn'), ask(['r'], 'strike', 'burn', 'burn'), ask(['c'], 'strike', 'burn', 'fire'), ask(['d'], 'freeze', 'stop', 'stop')];
    const sungOf = (id: string) => { const c = lines.find((x) => x.id === id); return c?.charStarts ? { times: c.charStarts, source: 'line' } : undefined; };
    for (const a of asks) {
      const kept = checkMoments([a], lines, sungOf).kept.length > 0;
      const f = rankMoments(input(lines, [a])).candidates[0].failed?.floor;
      const guards = !f || !['source', 'legalCue', 'evidence', 'negated', 'timing', 'reading', 'shout'].includes(f);
      expect(guards, `${a.cues[0]} ${a.word}`).toBe(kept);
    }
  });
});

describe('momentCapsOf (draft, derived)', () => {
  it('derives caps for every offered world, marked derived', () => {
    for (const s of OFFERED_STYLES) {
      const c = momentCapsOf(s.world);
      expect(c.source).toBe('derived');
      expect(c.mini).toContain('type-only');
    }
    expect(momentCapsOf(OFFERED_STYLES.find((s) => s.id === 'document')!.world).big).toBe(false);
  });
});

const SONGS: Record<string, string> = { nun: 'yt_w_fCuUR3lEs', snow: 'yt_5i50aTB7JFo', tsuzuki: 'yt_b3GCfyNKeLs', choroin: 'yt_hCCskTJwvuc', tenmon: 'yt_iwYXfOhcsYI' };
const files = Object.entries(SONGS).map(([k, id]) => ({ k, song: `out/db/${id}/song.json`, meaning: `out/research/instant/plans/${k}/meaning.json` }));
describe.skipIf(!files.every((f) => existsSync(f.song) && existsSync(f.meaning)))('the five songs with readings (freeJob, seed 0)', () => {
  const load = (f: (typeof files)[number]) => ({ song: JSON.parse(readFileSync(f.song, 'utf8')), meaning: JSON.parse(readFileSync(f.meaning, 'utf8')) });
  const worlds = ['silk', 'document', 'notebook', 'dark-glitch', 'ukiyoe'].map((id) => OFFERED_STYLES.find((s) => s.id === id)!);
  it('0–2 moments per song × world; with no `moments` in the reading the reason is noMeaningCandidate, today and here', () => {
    for (const f of files) {
      const { song, meaning } = load(f);
      expect(todayGate(song, meaning).kept).toBeLessThanOrEqual(2);
      for (const style of worlds) {
        const free = freeJob(song, { style, seed: 0, meaning });
        const p = rankMoments(momentInputOf(free, song, style.world, meaning, f.meaning));
        expect(p.chosen.length).toBeLessThanOrEqual(2);
        if (!meaning.moments?.length) { expect(p.reason).toBe('noMeaningCandidate'); expect(todayGate(song, meaning).reason).toBe('noMeaningCandidate'); }
        for (const c of p.chosen) expect(c.scheduled.meaningRef.startsWith(f.meaning)).toBe(true);
      }
    }
  });
  it('a hypothetical (test-only) reading candidate on a real line passes on real timing and protected events', () => {
    const { song, meaning } = load(files[1]);
    const style = OFFERED_STYLES.find((s) => s.id === 'silk')!;
    const free = freeJob(song, { style, seed: 0, meaning });
    // 三年後的大雪 c008 夜晚的橋邊在飄雪: the snow falling is what the line says
    const m = { moments: [ask(['c008'], 'shape', 'fall', '飄雪', '飄雪：雪正在落下')] };
    const p = rankMoments(momentInputOf(free, song, style.world, m, 'fixture'));
    const c = p.candidates[0];
    expect(c.passed.slice(0, 6)).toEqual(['source', 'legalCue', 'evidence', 'negated', 'why', 'timing']);
    expect(c.timing).toBe('charTimed');
    const cueRow = free.job.cues.find((x) => x.id === 'c008')!;
    expect(c.at).toBe(+cueRow.charStarts![[...cueRow.text].indexOf('雪', 6)].toFixed(3));
  });
});
