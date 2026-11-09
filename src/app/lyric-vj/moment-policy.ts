// The free tier's signature moments as a policy (Q5 phase 1, docs/research/2026-11-09-q3q5-codex.md §5–6): candidates come
// only from the song's stored reading (meaning.json `moments`); each passes named hard floors on its own, then the ones
// left are ranked, and at most two are proposed to planWorldEvents() as SCHEDULED candidates (not fixed). Pure: no DOM,
// no clock, no network, no randomness; the lyric is never scanned for trigger words (the sense lists only check the word
// a reading already gave). Phase 1: nothing renders from this yet (docs/research/2026-11-09-q5-phase1.md).
//
// checkMoments() (signature-moments.ts) is not called: it applies its spacing and count caps in song order inside the
// same loop that validates, so an earlier weaker ask can drop a later better one. Its checks are re-done here, one ask
// at a time, from the same exported primitives (wordIndex, notWholeWord, senseOf, hasCall, readingSec, lastSung…); the
// spec checks parity with checkMoments([ask]) on real lines.
import { familyCarries, type MomentFamily, type WorldMomentCaps } from './moment-caps-draft';
import { readingSec } from './render/reading-window';
import { hasCall, lastSung, mainOf, MAX_SUNG, MOMENT_FORMS, MOMENTS_APART, notWholeWord, PAIRED, scriptOf, senseOf, UNSUNG_HIDDEN, type MomentAsk, type MomentForm } from './signature-moments';
import { isSungChar, wordIndex } from './sung-times';
import { ACTION_GAP, LIGHT_GAP, type FrameBox } from './world-events';

/** The hard floors, in the order they are checked; a candidate's first failed floor is its elimination. */
export const MOMENT_FLOORS = ['source', 'legalCue', 'evidence', 'negated', 'why', 'timing', 'capability', 'reading', 'shout', 'collision'] as const;
export type MomentFloor = (typeof MOMENT_FLOORS)[number];
export type MomentVariant = 'big' | 'mini';

/** Big + mini together, per song. */
export const MOMENTS_PER_SONG = 2;
/** A mini's own area on the frame (Codex §5): a local action, not a full-screen effect shrunk into a corner. */
export const MINI_SHARE: [number, number] = [0.15, 0.3];
/** A mini's main action, s. */
export const MINI_MAIN: [number, number] = [0.35, 0.6];
/** The preparation before the semantic action (the only part that may snap to a beat), and how far it may move to one. */
export const PREPARE = 0.25;
const PREPARE_SNAP: [number, number] = [0.45, 0.1];
/** Exit and restore after the action: inside the occupied window (Codex §5). */
export const RESTORE = 0.3;
/** Forms that keep or close rather than burst: what an ochi section prefers. */
const SUSTAINED = new Set(['freeze/stop', 'echo/ghost', 'shape/fall', 'shape/rise', 'strike/wipe']);
export const WEIGHTS = { semanticSpecificity: 4, worldFit: 3, musicalFit: 2, readingSlack: 1 } as const;

export interface MomentCueIn { id: string; start: number; end: number; text: string; charStarts?: number[]; charTimed?: boolean }
export interface MomentSectionIn { start: number; end: number; type?: string; /** The song's 落ちサビ (structure.ts analyzeStructure). */ ochi?: boolean }
/** An approved event the moment must leave alone, its whole occupied window (exit and restore included). */
export interface ProtectedEvent { id: string; source: 'Q1' | 'Q2' | 'Q3' | 'Q4'; at?: number; from: number; to: number; changesLight?: boolean }

export interface MomentInput {
  /** The stored reading: only its `moments` are candidates. Undefined = no reading (the free flow works without one). */
  meaning?: { moments?: unknown[] };
  /** Where the reading came from (path or hash): every candidate traces back to `${meaningRef}#moments[i]`. */
  meaningRef: string;
  cues: MomentCueIn[];
  sections: MomentSectionIn[];
  beats: number[];
  downbeats?: number[];
  tempo?: number;
  caps: WorldMomentCaps;
  protected?: ProtectedEvent[];
  /** Each line's seat box on the frame (y down), for a mini's declared geometry. */
  seats?: Record<string, FrameBox>;
}

export interface MomentScore { total: number; semanticSpecificity: number; worldFit: number; musicalFit: number; readingSlack: number; repetitionPenalty: number }

/** What planWorldEvents() takes as a scheduled (not fixed) candidate (Codex §6): approved only once it arbitrates it. */
export interface ScheduledMomentCandidate {
  id: string;
  kind: 'signature-moment';
  at: number;
  from: number;
  to: number;
  cueIds: string[];
  meaningRef: string;
  variant: MomentVariant;
  score: number;
  changesLight: boolean;
  /** The frame area the moment occupies: no other event's seat may enter it inside [from, to]. */
  protectedRegion: FrameBox;
  render: { family: MomentFamily | 'overlay'; form: string; variant: string; word: string; prepareAt: number; mainSec: number; /** A mini keeps the normal lyric renderer (no ownCues takeover). */ ownsLines: boolean };
  fixed: false;
}

export interface MomentCandidateResult {
  index: number;
  meaningRef: string;
  ask?: MomentAsk;
  passed: MomentFloor[];
  failed?: { floor: MomentFloor; reason: string };
  timing?: 'charTimed' | 'cueBounds';
  /** The semantic action: the sense's own sung character, never moved. */
  at?: number;
  sectionIndex?: number;
  variant?: MomentVariant;
  family?: MomentFamily | 'overlay';
  prepareAt?: number;
  mainSec?: number;
  window?: { from: number; to: number };
  area?: { share: number; box: FrameBox };
  score?: MomentScore;
  /** Passed every floor but was not chosen: why. */
  notChosen?: string;
}

export interface MomentPlan {
  candidates: MomentCandidateResult[];
  chosen: (MomentCandidateResult & { scheduled: ScheduledMomentCandidate })[];
  /** Why the song gets none, when it gets none. */
  reason?: 'noMeaningCandidate' | 'noCandidatePassed';
  /** Candidates eliminated at each floor (their first failed floor). */
  eliminated: Record<MomentFloor, number>;
}

const r3 = (x: number) => +x.toFixed(3);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const spokenOf = (text: string) => [...mainOf(text)].filter(isSungChar).join('');
const isAsk = (x: unknown): x is MomentAsk => {
  const a = x as MomentAsk;
  return !!a && typeof a === 'object' && Array.isArray(a.cues) && a.cues.every((c) => typeof c === 'string') && typeof a.form === 'string' && typeof a.variant === 'string' && typeof a.word === 'string';
};
/** Per-character times the aligner trusted, matching the text and never running backwards. */
const trusted = (c: MomentCueIn) => !!c.charTimed && !!c.charStarts && c.charStarts.length === [...c.text].length && c.charStarts.every((t, i) => i === 0 || t >= c.charStarts![i - 1] - 1e-3);
const firstSungIndex = (text: string) => [...text].findIndex(isSungChar);

/** A box grown or shrunk about its centre to `share` of the frame, kept inside it. */
export function boxOfShare(seat: FrameBox | undefined, share: number): FrameBox {
  const b = seat ?? { x0: 0.25, y0: 0.3, x1: 0.75, y1: 0.7 };
  const [cx, cy] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const [w0, h0] = [Math.max(0.05, b.x1 - b.x0), Math.max(0.05, b.y1 - b.y0)];
  const k = Math.sqrt(share / (w0 * h0));
  const [w, h] = [Math.min(1, w0 * k), Math.min(1, h0 * k)];
  // (a side capped at the frame gives its share to the other)
  const [W, H] = w >= 1 ? [1, Math.min(1, share)] : h >= 1 ? [Math.min(1, share), 1] : [w, h];
  const x0 = Math.max(0, Math.min(1 - W, cx - W / 2));
  const y0 = Math.max(0, Math.min(1 - H, cy - H / 2));
  return { x0: r3(x0), y0: r3(y0), x1: r3(x0 + W), y1: r3(y0 + H) };
}
const shareOf = (b: FrameBox) => r3((b.x1 - b.x0) * (b.y1 - b.y0));

/**
 * The song's free signature moments: every candidate of the reading through the hard floors on its own, then ranked by
 * 4·semanticSpecificity + 3·worldFit + 2·musicalFit + readingSlack − repetitionPenalty (each 0–1), then at most
 * MOMENTS_PER_SONG chosen, MOMENTS_APART apart and one per section, the second preferring another form and word. Zero is a
 * normal answer; a song without a reading, or a reading without moments, is `noMeaningCandidate`.
 */
export function rankMoments(input: MomentInput): MomentPlan {
  const eliminated = Object.fromEntries(MOMENT_FLOORS.map((f) => [f, 0])) as Record<MomentFloor, number>;
  const raw = input.meaning?.moments ?? [];
  if (!raw.length) return { candidates: [], chosen: [], reason: 'noMeaningCandidate', eliminated };
  const cues = [...input.cues].sort((a, b) => a.start - b.start);
  const byId = new Map(cues.map((c, i) => [c.id, { c, i }]));
  const sections = [...input.sections].sort((a, b) => a.start - b.start);
  const sectionAt = (t: number) => sections.findIndex((s) => t >= s.start - 1e-6 && t < s.end);
  const beatSec = 60 / Math.max(40, input.tempo || 120);
  const nearDownbeat = (t: number) => (input.downbeats ?? []).some((d) => Math.abs(d - t) <= beatSec / 2);
  const caps = input.caps;

  const candidates = raw.map((x, index) => check(x, index));
  for (const c of candidates) if (c.failed) eliminated[c.failed.floor] += 1;

  function check(x: unknown, index: number): MomentCandidateResult {
    const res: MomentCandidateResult = { index, meaningRef: `${input.meaningRef}#moments[${index}]`, passed: [] };
    const fail = (floor: MomentFloor, reason: string) => ({ ...res, failed: { floor, reason } });
    const pass = (floor: MomentFloor) => void res.passed.push(floor);
    if (!isAsk(x)) return fail('source', 'not a moment of the reading (cues, form, variant, word)');
    const ask = x;
    res.ask = ask;
    pass('source');

    // legal cue: a drawn form and variant on one or two known lines, in the shape the form takes
    const variants = MOMENT_FORMS[ask.form as MomentForm];
    if (!variants) return fail('legalCue', `no such form: ${ask.form}`);
    if (!variants.includes(ask.variant)) return fail('legalCue', `${ask.form}/${ask.variant} is not drawn yet`);
    if (!ask.cues.length || ask.cues.length > 2 || ask.cues.some((id) => !byId.has(id))) return fail('legalCue', 'one or two known lines');
    const hits = ask.cues.map((id) => byId.get(id)!);
    const echo = ask.form === 'echo';
    if (echo) {
      if (hits.length !== 2) return fail('legalCue', 'an echo needs the earlier line and the line answering it');
      if (hits[0].c.end > hits[1].c.start) return fail('legalCue', 'the echoed line must be sung before the answering one');
      if (spokenOf(hits[0].c.text) === spokenOf(hits[1].c.text)) return fail('legalCue', 'the same line sung again is a repeat, not an echo');
    } else if (hits.length === 2) {
      if (hits[1].i !== hits[0].i + 1) return fail('legalCue', 'a struck line must be the line before the striking one');
      if (!PAIRED.has(`${ask.form}/${ask.variant}`)) return fail('legalCue', `${ask.form}/${ask.variant} takes one line`);
    }
    pass('legalCue');

    // evidence: the whole word, in the line, of the variant's sense; a negated word is not the thing happening
    const actor = hits[hits.length - 1].c;
    const word = ask.word.trim();
    const idx = wordIndex(actor.text, word);
    if (idx < 0) return fail('evidence', `the word 「${word}」 is not in the line`);
    const partial = notWholeWord(actor.text, word, idx, ask.form === 'strike' || ask.form === 'freeze');
    if (partial && /is negated here/.test(partial)) { pass('evidence'); return fail('negated', partial); }
    if (partial) return fail('evidence', partial);
    const sense = senseOf(ask.form as MomentForm, ask.variant, word, scriptOf(actor.text));
    if (!sense.ok) return fail('evidence', `「${word}」 is not a ${ask.form}/${ask.variant} word`);
    const most = MAX_SUNG[`${ask.form}/${ask.variant}`];
    if (most && spokenOf(actor.text).length > most) return fail('evidence', `「${actor.text}」 is too long for ${ask.form}/${ask.variant} (${most} characters at most)`);
    if (echo && wordIndex(hits[0].c.text, word) < 0) return fail('evidence', `「${word}」 is not in the earlier line`);
    if (echo && [...word].filter(isSungChar).length < (/^[\p{Script=Latin}\s]+$/u.test(word) ? 3 : 2)) return fail('evidence', `「${word}」 is too short to carry an echo`);
    pass('evidence');
    pass('negated');

    // why: the reading's own reason, traceable to the line (not empty, not the word or the variant repeated)
    const why = (ask.why ?? '').trim();
    if ([...why].length < 4 || why === word || why === ask.variant) return fail('why', 'no traceable reason from the reading');
    pass('why');

    // timing: the sense's own character as the aligner sang it; cue bounds alone only place the line's first sung word
    const senseAt = idx + sense.at;
    const timed = (echo ? hits.slice(1) : hits).every(({ c }) => trusted(c));
    let at: number;
    if (timed) {
      at = actor.charStarts![senseAt];
      res.timing = 'charTimed';
    } else if (senseAt === firstSungIndex(actor.text) && (echo || hits.length === 1)) {
      at = actor.start;
      res.timing = 'cueBounds';
    } else return fail('timing', `no trusted sung time for 「${word}」 (${timed ? '' : 'no per-character timing; '}cue bounds only place the line's first word)`);
    res.at = r3(at);
    res.sectionIndex = sectionAt(at);
    pass('timing');

    // capability: the world draws this form big, or has a mini family that honestly carries it
    const families = caps.mini.filter((f) => familyCarries(f, ask.form, ask.variant) && (f !== 'scene' || caps.pieces.some((p) => p.words?.test(word))));
    const section = sections[res.sectionIndex];
    const chorus = section?.type === 'chorus' && !section.ochi;
    const order: MomentVariant[] = (chorus ? ['big', 'mini'] : ['mini', 'big']).filter((v) => (v === 'big' ? caps.big : families.length > 0)) as MomentVariant[];
    if (!order.length) return fail('capability', `${caps.worldId} draws no ${ask.form}/${ask.variant} (big ${caps.big ? 'yes' : 'no'}; mini ${caps.mini.join('/') || 'none'})`);
    pass('capability');

    // reading: the struck line is read whole before the strike; the moment's line has time to be read whole
    const lastOf = (c: MomentCueIn) => (trusted(c) ? lastSung(c.text, c.charStarts!) : c.end);
    const object = !echo && hits.length === 2 ? hits[0].c : undefined;
    if (object && at - lastOf(object) < readingSec(mainOf(object.text), object.start, object.end) - 0.05) return fail('reading', `「${object.text}」 is struck before it can be read`);
    const after = cues[hits[hits.length - 1].i + 1];
    const repeat = after && spokenOf(after.text) === spokenOf(actor.text) && after.start - actor.end <= 0.5 && trusted(after) ? after : undefined;
    const next = cues[hits[hits.length - 1].i + (repeat ? 2 : 1)];
    const until = Math.min(next ? next.start : Infinity, (repeat ? repeat.start : lastOf(actor)) + 3);
    const readFrom = UNSUNG_HIDDEN.has(`${ask.form}/${ask.variant}`) ? lastOf(actor) : actor.start - 0.2;
    const need = readingSec(mainOf(actor.text), actor.start, actor.end);
    if (until - readFrom < need - 0.05) return fail('reading', `「${actor.text}」 has no time to be read whole`);
    pass('reading');

    // shout: a line with a call beside it is left alone (the moment would draw over the call)
    const called = [...(echo ? hits.slice(-1) : hits).map((h) => h.c), ...(repeat ? [repeat] : [])].find((c) => hasCall(c.text));
    if (called) return fail('shout', `「${called.text}」 has a call beside it`);
    pass('shout');

    // collision: the whole occupied window (preparation, action, exit and restore) clear of every protected event
    const snaps = input.beats.filter((b) => b >= at - PREPARE_SNAP[0] && b <= at - PREPARE_SNAP[1]).sort((a, b) => Math.abs(a - (at - PREPARE)) - Math.abs(b - (at - PREPARE)));
    const prepareAt = snaps[0] ?? at - PREPARE;
    const mainSec = Math.min(MINI_MAIN[1], Math.max(MINI_MAIN[0], beatSec));
    const windowOf = (v: MomentVariant) => (v === 'mini' ? { from: prepareAt, to: at + mainSec + RESTORE } : { from: Math.min(prepareAt, readFrom), to: Math.max(until, at + mainSec) + RESTORE });
    const clash = (v: MomentVariant) => {
      const w = windowOf(v);
      const light = v === 'big';
      for (const p of input.protected ?? []) {
        if (w.from < p.to + ACTION_GAP && p.from < w.to + ACTION_GAP) return `${v} window ${w.from.toFixed(2)}–${w.to.toFixed(2)} overlaps ${p.source} ${p.id} (${ACTION_GAP}s between actions)`;
        if (light && p.changesLight && Math.abs(at - (p.at ?? p.from)) < LIGHT_GAP) return `light change within ${LIGHT_GAP}s of ${p.source} ${p.id}`;
      }
      return '';
    };
    const fits = order.find((v) => !clash(v));
    if (!fits) return fail('collision', clash(order[0]));
    pass('collision');

    const variant = fits;
    const family: MomentFamily | 'overlay' = variant === 'big' ? 'overlay' : families[0];
    const w = windowOf(variant);
    const box = variant === 'big' ? { x0: 0, y0: 0, x1: 1, y1: 1 } : boxOfShare(input.seats?.[actor.id], Math.min(MINI_SHARE[1], Math.max(MINI_SHARE[0], (MINI_SHARE[0] + MINI_SHARE[1]) / 2)));

    // the score: evidence only, no model confidence invented
    const quotes = why.includes(word);
    const semanticSpecificity = clamp01(0.4 + (sense.at === 0 ? 0.3 : 0) + (quotes ? 0.2 : 0) + ([...word].filter(isSungChar).length >= (/^[a-z\s]+$/i.test(word) ? 4 : 2) ? 0.1 : 0));
    const worldFit = family === 'overlay' ? 0.7 : family === 'scene' ? 1 : family === 'page' ? 0.85 : 0.6;
    const isTurn = sections.some((s, k) => k > 0 && s.start <= actor.start + 0.25 && !cues.some((c) => c !== actor && c.start >= s.start - 0.25 && c.start < actor.start));
    const down = nearDownbeat(at);
    let musicalFit = section?.type === 'chorus' && down ? 1 : isTurn ? (down ? 0.8 : 0.7) : section?.type === 'chorus' ? 0.55 : down ? 0.45 : 0.3;
    if (section?.ochi) musicalFit = SUSTAINED.has(`${ask.form}/${ask.variant}`) ? clamp01(musicalFit + 0.2) : musicalFit * 0.5;
    const readingSlack = clamp01((until - readFrom - need) / 2);
    const total = WEIGHTS.semanticSpecificity * semanticSpecificity + WEIGHTS.worldFit * worldFit + WEIGHTS.musicalFit * musicalFit + WEIGHTS.readingSlack * readingSlack;
    return {
      ...res, variant, family, prepareAt: r3(prepareAt), mainSec: r3(mainSec), window: { from: r3(w.from), to: r3(w.to) }, area: { share: shareOf(box), box },
      score: { total: r3(total), semanticSpecificity: r3(semanticSpecificity), worldFit, musicalFit: r3(musicalFit), readingSlack: r3(readingSlack), repetitionPenalty: 0 },
    };
  }

  // rank only after every candidate stood on its own
  const pool = candidates.filter((c) => !c.failed).sort((a, b) => b.score!.total - a.score!.total || a.at! - b.at! || a.index - b.index);
  const chosen: MomentCandidateResult[] = [];
  const repetition = (c: MomentCandidateResult) => Math.max(0, ...chosen.map((k) => (k.ask!.form === c.ask!.form && k.ask!.variant === c.ask!.variant) || k.ask!.word.trim() === c.ask!.word.trim() ? 1 : k.ask!.form === c.ask!.form ? 0.6 : 0));
  const blocked = (c: MomentCandidateResult) => {
    const near = chosen.find((k) => Math.abs(k.at! - c.at!) < MOMENTS_APART);
    if (near) return `within ${MOMENTS_APART} s of ${near.meaningRef}`;
    const same = chosen.find((k) => k.sectionIndex === c.sectionIndex);
    if (same) return `same section as ${same.meaningRef}`;
    if (chosen.length >= MOMENTS_PER_SONG) return `the song already has ${MOMENTS_PER_SONG}`;
    return '';
  };
  while (chosen.length < MOMENTS_PER_SONG) {
    const open = pool.filter((c) => !chosen.includes(c) && !blocked(c));
    if (!open.length) break;
    const adjusted = open.map((c) => ({ c, rep: repetition(c) })).sort((a, b) => b.c.score!.total - b.rep - (a.c.score!.total - a.rep) || a.c.at! - b.c.at! || a.c.index - b.c.index);
    const best = adjusted[0];
    best.c.score = { ...best.c.score!, repetitionPenalty: best.rep, total: r3(best.c.score!.total - best.rep) };
    chosen.push(best.c);
  }
  for (const c of pool) if (!chosen.includes(c)) c.notChosen = blocked(c) || 'ranked below the chosen';
  chosen.sort((a, b) => a.at! - b.at!);
  return {
    candidates,
    chosen: chosen.map((c) => ({ ...c, scheduled: scheduledOf(c, byId.get(c.ask!.cues.at(-1)!)!.c) })),
    ...(chosen.length ? {} : { reason: 'noCandidatePassed' as const }),
    eliminated,
  };
}

function scheduledOf(c: MomentCandidateResult, actor: MomentCueIn): ScheduledMomentCandidate {
  const ask = c.ask!;
  return {
    id: `moment:${actor.id}:${ask.form}/${ask.variant}`,
    kind: 'signature-moment',
    at: c.at!,
    from: c.window!.from,
    to: c.window!.to,
    cueIds: [...ask.cues],
    meaningRef: c.meaningRef,
    variant: c.variant!,
    score: c.score!.total,
    changesLight: c.variant === 'big',
    protectedRegion: c.area!.box,
    render: { family: c.family!, form: ask.form, variant: ask.variant, word: ask.word.trim(), prepareAt: c.prepareAt!, mainSec: c.mainSec!, ownsLines: c.variant === 'big' },
    fixed: false,
  };
}
