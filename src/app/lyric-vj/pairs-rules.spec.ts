// The pairs rulings of 2026-11-10 (Codex out/research/q1-1109/codex-pairs.md C; card 2026-11-10-pairs-holds-first-colour):
// an ink-swap only for a traceable reason, on the phrase that reason is about, at that phrase's sung time; never the hold
// kind of the sung line before; at most SWAP_CAP ink-swaps a music section over the whole song. The rule B half (no reseat
// inside a line) is in world-events*.spec.ts.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freeJob } from './free-plan';
import { FREE_STYLES } from './free-styles';
import { holdCandidatesOf, SECTION_ENERGY_STEP, swapCausesOf, swapSpan, SWAP_SNAP, type Cue, type HoldLine } from './lineplan-core';
import { planWorldEvents, sectionAt, SWAP_CAP, type JointHold, type SeatCandidate, type WorldEventInput, type WorldEventLine } from './world-events';
import { colourChangeSeen, holdSequenceChecks } from './world-events-adapter';

// (two whole phrases of half the line each: a swap takes a whole phrase, never a run that cuts one, review 2026-11-10)
const text = '我們一起走過 那條長長的街';
const n = [...text].length;
const timed = (start: number, end: number, o: Partial<Cue> = {}): Cue => ({ id: 'x', start, end, text, charTimed: true, charStarts: [...text].map((_, k) => +(start + ((end - start) * 0.9 * k) / n).toFixed(3)), ...o });
const swapOnly = { 'ink-swap': 1 };
const line = (o: Partial<HoldLine> = {}): HoldLine => ({ enterSec: 0.3, swapOk: true, ...o });
const section: HoldLine['swapWhy'] = [{ kind: 'section', source: 'section:2' }];

describe('pairs C: the reasons an ink-swap may have (swapCausesOf)', () => {
  const cues: Cue[] = [
    { id: 'a', start: 1, end: 3, text: '快使用雙截棍' },
    { id: 'b', start: 4, end: 6, text: '哼哼哈兮' },
    { id: 'c', start: 11, end: 13, text: '快使用雙截棍' },
    { id: 'd', start: 14, end: 16, text: '(哈!) 快使用雙截棍' },
    { id: 'e', start: 21, end: 23, text: '習武之人切記' },
  ];
  const sections = [{ start: 0, end: 10, type: 'chorus', energy: 0.8 }, { start: 10, end: 20, type: 'chorus', energy: 0.8 - SECTION_ENERGY_STEP / 2 }, { start: 20, end: 30, type: 'chorus', energy: 0.8 - SECTION_ENERGY_STEP * 2 }];

  it('a meaning key or a moment only on the line that sings its phrase, the phrase as the cover; a key elsewhere is no reason', () => {
    const got = swapCausesOf(cues, [], { keys: [{ cue: 'b', phrase: '哈兮' }, { cue: 'e', phrase: '不在這行' }], moments: [{ cues: ['a', 'c'], form: 'echo', variant: 'ghost', word: '雙截棍', why: '', evidenceCueId: 'c' }, { cues: ['a'], form: 'strike', variant: 'tear', word: '使用', why: '' }] });
    expect(got.get('b')).toEqual([{ kind: 'meaning', source: 'key:b', cover: { from: 2, to: 4 } }]);
    expect(got.get('c')?.filter((x) => x.kind === 'meaning')).toEqual([{ kind: 'meaning', source: 'moment:0', cover: { from: 3, to: 6 } }]);
    // (a moment with no line its word is sung in has no concrete time: none; a key whose phrase the line does not sing: none)
    expect(got.get('a')).toBeUndefined();
    expect(got.get('e')).toBeUndefined();
  });

  it('the first sung line of a section whose type changed or whose energy moved by SECTION_ENERGY_STEP; a small drift is none', () => {
    const got = swapCausesOf(cues, sections, { keys: [] });
    expect(got.get('e')).toEqual([{ kind: 'section', source: 'section:2' }]);
    expect([...got.values()].flat().filter((x) => x.kind === 'section')).toHaveLength(1);
    const typed = swapCausesOf(cues, [sections[0], { ...sections[1], type: 'verse' }], { keys: [] });
    expect(typed.get('c')).toContainEqual({ kind: 'section', source: 'section:1' });
  });

  it('the second time a line\'s words come back, once a group (calls off): the third is nothing', () => {
    const got = swapCausesOf(cues, [], { keys: [] });
    expect(got.get('c')).toEqual([{ kind: 'repeat', source: 'repeat:a' }]);
    expect(got.get('d')).toBeUndefined();
    expect(got.get('a')).toBeUndefined();
  });

  it('a song with no sections is one section: the cap is shared', () => {
    expect(sectionAt([], 50)).toBe(0);
    expect(sectionAt(sections, 15)).toBe(1);
    expect(sectionAt(sections, 0)).toBe(0);
  });
});

describe('pairs C: an ink-swap candidate (holdCandidatesOf)', () => {
  it('no reason, no ink-swap: refused as no-reason; a reason makes it a candidate with its why on the hold', () => {
    const none = holdCandidatesOf(timed(1, 4), [], [], [], '', 0, line(), swapOnly, true);
    expect('skip' in none && none.rejects).toEqual([{ kind: 'ink-swap', reason: 'no-reason' }]);
    expect('skip' in none && none.why).toContain('reason');
    const got = holdCandidatesOf(timed(1, 4), [], [], [], '', 0, line({ swapWhy: section }), swapOnly, true);
    expect(Array.isArray(got)).toBe(true);
    if (!Array.isArray(got)) return;
    expect(got[0].plan).toMatchObject({ kind: 'ink-swap', stays: true, why: { kind: 'section', source: 'section:2' } });
    expect(got[0].plan.why!.span).toEqual(got[0].plan.span);
    expect(got[0].plan.why!.at).toBe(got[0].plan.at);
  });

  it('the swap lands at the phrase\'s sung start, or a beat inside the phrase that near it; never the entrance plus so many seconds', () => {
    const c = timed(1, 4);
    const plan = (beats: number[]) => { const got = holdCandidatesOf(c, [], beats, [], '', 0, line({ swapWhy: section }), swapOnly, true); return Array.isArray(got) ? got[0].plan : undefined; };
    const bare = plan([])!;
    const start = c.charStarts![bare.span!.from];
    expect(bare.at).toBe(start);
    // (a beat just inside the phrase is taken; one just before it, or past the snap, is not)
    expect(plan([start + SWAP_SNAP / 2])!.at).toBe(+(start + SWAP_SNAP / 2).toFixed(3));
    expect(plan([start - 0.05])!.at).toBe(start);
    expect(plan([start + SWAP_SNAP + 0.05])!.at).toBe(start);
    // (no trusted per-character times: no swap, timing is why)
    const loose = holdCandidatesOf({ ...c, charTimed: false }, [], [0.5, 1, 1.5, 2, 2.5, 3], [], '', 0, line({ swapWhy: section }), swapOnly, true);
    expect('skip' in loose && loose.rejects).toEqual([{ kind: 'ink-swap', reason: 'timing' }]);
  });

  it('a meaning reason swaps its own phrase (or a run holding it whole), never the run apart from it', () => {
    const key = '長長的街';
    const cover = { from: 9, to: 13 };
    expect(swapSpan(text, key)).not.toEqual(expect.objectContaining({ to: 13 }));
    const sp = swapSpan(text, key, cover)!;
    expect(sp.from).toBeLessThanOrEqual(9);
    expect(sp.to).toBeGreaterThanOrEqual(13);
    const got = holdCandidatesOf(timed(1, 4), [], [], [], '', 0, line({ key, swapWhy: [{ kind: 'meaning', source: 'key:x', cover }] }), swapOnly, true);
    expect(Array.isArray(got) && got[0].plan.span).toEqual(sp);
  });

  it('a section that spent its swaps refuses another (section-cap); the kind of the sung line before is never taken again (repeat-kind)', () => {
    const capped = holdCandidatesOf(timed(1, 4), [], [], [], '', 0, line({ swapWhy: section, swapCapped: true }), swapOnly, true);
    expect('skip' in capped && capped.rejects).toEqual([{ kind: 'ink-swap', reason: 'section-cap' }]);
    // (the whole line's ink, for the same reason, at the first beat after the entrance: a section reason names no phrase)
    const again = holdCandidatesOf(timed(1, 4), [], [2, 2.5, 3], [], 'ink-swap', 0, line({ swapWhy: section, inkSettle: true }), swapOnly, true);
    expect(Array.isArray(again) && again.map((x) => x.plan.kind)).toEqual(['line-ink-settle']);
    expect(Array.isArray(again) && again[0].plan.rejects).toContainEqual({ kind: 'ink-swap', reason: 'repeat-kind' });
    expect(Array.isArray(again) && again[0].plan).toMatchObject({ at: 2, why: { kind: 'section', source: 'section:2' } });
  });

  it('the whole line\'s ink is a colour change too (the owner\'s 顏色變換要合理): no reason, the line keeps; the section\'s budget is shared; a meaning reason times it at its phrase', () => {
    const none = holdCandidatesOf(timed(1, 4), [], [2, 2.5, 3], [], '', 0, line({ inkSettle: true, plain: true }), swapOnly, true);
    expect(none).toMatchObject({ rejects: [{ kind: 'line-ink-settle', reason: 'no-reason' }] });
    const capped = holdCandidatesOf(timed(1, 4), [], [2, 2.5, 3], [], '', 0, line({ inkSettle: true, plain: true, swapWhy: section, swapCapped: true }), swapOnly, true);
    expect('skip' in capped && capped.rejects).toContainEqual({ kind: 'line-ink-settle', reason: 'section-cap' });
    const c = timed(1, 4);
    // (the phrase is sung from 2.869: the beat at 2.9 lies inside it within SWAP_SNAP, so the change lands on the beat)
    expect(c.charStarts![9]).toBe(2.869);
    const meant = holdCandidatesOf(c, [], [2, 2.5, 2.9], [], '', 0, line({ inkSettle: true, plain: true, swapWhy: [{ kind: 'meaning', source: 'key:x', cover: { from: 9, to: 13 } }] }), swapOnly, true);
    expect(Array.isArray(meant) && meant[0].plan).toMatchObject({ kind: 'line-ink-settle', at: 2.9, why: { source: 'key:x', span: { from: 9, to: 13 } } });
  });
});

describe('pairs C: the joint selector never commits the kind the sung line before committed, nor a third ink-swap a section', () => {
  const S: SeatCandidate = { id: 'w/s', box: { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.3 }, size: 100 };
  const hc = (lineId: string, at: number, kind: string, rank = 0): JointHold => ({ seat: S.id, hold: { lineId, at, from: at, to: +(at + 0.3).toFixed(3), kind }, rank, slack: 0.5 });
  const l = (id: string, start: number, cands: JointHold[]): WorldEventLine => ({ id, show: start - 0.2, start, end: start + 3, seats: [S], seat: S.id, settled: start, holdCands: cands });
  const input = (lines: WorldEventLine[], sections = [{ start: 0, energy: 0.2 }]): WorldEventInput => ({ lines, beats: [], sections, caps: { worldId: 'w', kinds: ['layout-seat'], seats: [], carrierRole: 'ground' }, joint: true, seed: 0 });

  it('two lines that both rank ink-swap first: the second takes its next kind; with none, it keeps; a keep between lifts it', () => {
    const plan = planWorldEvents(input([l('a', 1, [hc('a', 2, 'ink-swap')]), l('b', 5, [hc('b', 6, 'ink-swap'), hc('b', 6.5, 'roll', 1)])]));
    expect(plan.holds.map((h) => h.kind)).toEqual(['ink-swap', 'roll']);
    expect(plan.outcomes!.find((o) => o.lineId === 'b')!.holdRejects).toEqual([{ kind: 'ink-swap', reason: 'repeat-kind' }]);
    const only = planWorldEvents(input([l('a', 1, [hc('a', 2, 'ink-swap')]), l('b', 5, [hc('b', 6, 'ink-swap')])]));
    expect(only.holds.map((h) => h.lineId)).toEqual(['a']);
    expect(only.outcomes!.find((o) => o.lineId === 'b')!.outcome).toBe('keep');
    const lifted = planWorldEvents(input([l('a', 1, [hc('a', 2, 'ink-swap')]), l('k', 5, []), l('b', 9, [hc('b', 10, 'ink-swap')])]));
    expect(lifted.holds.map((h) => h.lineId)).toEqual(['a', 'b']);
  });

  it(`at most ${SWAP_CAP} ink-swaps a section over the song; the next section has its own`, () => {
    const lines = [1, 5, 9, 13, 17].map((t, k) => l(`l${k}`, t, k % 2 ? [hc(`l${k}`, t + 1, 'roll')] : [hc(`l${k}`, t + 1, 'ink-swap')]));
    // (l0, l2, l4 offer an ink-swap, l1, l3 a roll between them: no repeat, only the cap is in play)
    const one = planWorldEvents(input(lines));
    expect(one.holds.filter((h) => h.kind === 'ink-swap').map((h) => h.lineId)).toEqual(['l0', 'l2']);
    expect(one.outcomes!.find((o) => o.lineId === 'l4')!.holdRejects).toEqual([{ kind: 'ink-swap', reason: 'section-cap' }]);
    const two = planWorldEvents(input(lines, [{ start: 0, energy: 0.2 }, { start: 16, energy: 0.9 }]));
    expect(two.holds.filter((h) => h.kind === 'ink-swap').map((h) => h.lineId)).toEqual(['l0', 'l2', 'l4']);
  });
});

const NUN = 'out/db/yt_w_fCuUR3lEs/song.json';
const have = existsSync(NUN) && existsSync('out/research/instant/plans/nun/meaning.json');
type DrawnCue = { cueId: string; world?: { beat?: { kind: string; at: number; span?: { from: number; to: number }; why?: { kind: string; source: string; span: { from: number; to: number }; at: number } } } };
describe.skipIf(!have)('pairs C on 雙截棍 (file, the world the owner called 隨便換)', () => {
  const song = JSON.parse(readFileSync(NUN, 'utf8'));
  const meaning = JSON.parse(readFileSync('out/research/instant/plans/nun/meaning.json', 'utf8'));
  const style = FREE_STYLES.find((s) => s.id === 'file')!;
  for (const [name, o] of [['default (scheduler off)', {}], ['holds-first (scheduler on)', { worldEvents: true }], ['joint', { worldEvents: true, jointHolds: true }]] as const)
    it(`${name}: every ink-swap has its reason and its phrase's time; no two sung lines in a row share a hold kind; ${SWAP_CAP} swaps a section at most`, () => {
      const f = freeJob(song, { style, seed: 0, meaning, ...o });
      const cues = (f.job.treatment.cues as DrawnCue[]).map((c) => ({ c, s: song.cues.find((x: { id: string }) => x.id === c.cueId) })).filter((x) => x.s).sort((a, b) => a.s.start - b.s.start);
      const perSection = new Map<number, number>();
      cues.forEach(({ c, s }, k) => {
        const b = c.world?.beat;
        const prev = cues[k - 1]?.c.world?.beat;
        if (b && prev) expect(b.kind, `${cues[k - 1].c.cueId} > ${c.cueId}`).not.toBe(prev.kind);
        // (every colour change is seen on the drawn ink: review 2026-11-10, a swap into the row's own accent drew nothing)
        if (b && ['ink-swap', 'line-ink-settle'].includes(b.kind)) expect(colourChangeSeen(f.job, c.cueId, b).seen, c.cueId).toBe(true);
        if (b?.kind !== 'ink-swap') return;
        expect(b.why?.source, c.cueId).toMatch(/^(key|moment|section|repeat):/);
        expect(b.why!.span).toEqual(b.span);
        // (its time: the phrase's sung start, or a beat inside the phrase within SWAP_SNAP of it)
        const start = s.charStarts[b.span!.from];
        expect(b.at - start, c.cueId).toBeGreaterThanOrEqual(-1e-6);
        expect(b.at - start, c.cueId).toBeLessThanOrEqual(SWAP_SNAP + 1e-6);
        const sec = sectionAt(song.sections, s.start);
        perSection.set(sec, (perSection.get(sec) ?? 0) + 1);
      });
      for (const [sec, k] of perSection) expect(k, `section ${sec}`).toBeLessThanOrEqual(SWAP_CAP);
      expect(f.treatment.worldEvents?.warnings.filter((w) => w.reason.startsWith('final check')) ?? []).toEqual([]);
      expect(holdSequenceChecks(f.job)).toEqual([]);
    });

  it('a colour change the drawn ink would not show is taken off its line (file case: the second row is printed in the accent the swap would lay); kept, with the refusal on record', () => {
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const cues = f.job.treatment.cues as (DrawnCue & { world?: { beatSkip?: string; beatRejects?: { kind: string; reason: string }[] } })[];
    const hidden = cues.filter((c) => c.world?.beatRejects?.some((r) => r.reason === 'invisible'));
    expect(hidden.length).toBeGreaterThan(0);
    for (const c of hidden) { expect(c.world!.beat).toBeUndefined(); expect(c.world!.beatSkip).toMatch(/not visible on the drawn ink/); }
    // (planted back: c028's second row 從小就耳濡目染 already stands in the accent the swap would lay; the final check names it)
    const j = structuredClone(f.job);
    const back = (j.treatment.cues as DrawnCue[]).find((c) => c.cueId === 'c028')!;
    const at = 97.84;
    back.world!.beat = { kind: 'ink-swap', at, span: { from: 8, to: 15 }, why: { kind: 'section', source: 'section:6', span: { from: 8, to: 15 }, at } };
    expect(colourChangeSeen(j, 'c028', back.world!.beat!)).toMatchObject({ seen: false });
    expect(holdSequenceChecks(j).some((w) => w.inputs[0] === 'hold:ink-swap@c028' && /planned colour change not visible/.test(w.reason))).toBe(true);
  });

  it('the final check reads the drawing: a hold kind drawn twice in a row, an ink-swap with no reason or off its phrase\'s time, each named', () => {
    const f = freeJob(song, { style, seed: 0, meaning, worldEvents: true });
    const sorted = (cues: DrawnCue[]) => cues.map((c) => ({ c, s: song.cues.find((x: { id: string }) => x.id === c.cueId) })).filter((x) => x.s).sort((a, b) => a.s.start - b.s.start).map((x) => x.c);
    const tamper = (edit: (cues: DrawnCue[]) => void) => { const j = structuredClone(f.job); edit(sorted(j.treatment.cues as DrawnCue[])); return holdSequenceChecks(j).map((w) => w.reason); };
    const k = sorted(f.job.treatment.cues as DrawnCue[]).findIndex((c, i, xs) => c.world?.beat && i > 0 && xs[i - 1].world?.beat);
    const swap = sorted(f.job.treatment.cues as DrawnCue[]).findIndex((c) => c.world?.beat?.kind === 'ink-swap');
    expect(k).toBeGreaterThan(0);
    expect(swap).toBeGreaterThanOrEqual(0);
    expect(tamper((cs) => { cs[k].world!.beat!.kind = cs[k - 1].world!.beat!.kind; }).some((r) => /straight after/.test(r))).toBe(true);
    expect(tamper((cs) => { delete cs[swap].world!.beat!.why; }).some((r) => /carries no reason/.test(r))).toBe(true);
    expect(tamper((cs) => { cs[swap].world!.beat!.at += 0.5; }).some((r) => /not at its phrase's sung start/.test(r))).toBe(true);
  });
});
