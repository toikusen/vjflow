// The subject-video tier's script (scripts/lyric-vj/subject-script.mts): what the director answers for a window of a
// song, and the check that keeps only what the song and the language really have.

export type CastKind = 'person' | 'object' | 'animal' | 'phenomenon';
/**
 * One of the song's subjects or props, as many as the story needs (no cap; the director states the cost and
 * consistency trade-off): what it is, what it stands for, the parts the shots rely on. `main` is a recurring subject
 * the buyer picks a sheet for; `prop` is drawn straight in the style from its look, like the story tier's props.
 * `id` and `look` are the story tier's (keyframes.mts Board.people, props.mts) so phase 2 can hand them on.
 */
export interface CastMember {
  id: string;
  kind: CastKind;
  tier: 'main' | 'prop';
  what: string;
  /** The English drawing description; a main member's comes from the picked candidate, a prop's from the director. */
  look: string;
  role: string;
  /** The parts of the subject the shots rely on: every candidate sheet shows them all. */
  features: string[];
  why: string;
  /** Decided already (the buyer picked its sheet): its look is kept as given and no candidates are drawn for it. */
  fixed?: boolean;
}
/** A decided member as the brief gets it: its look, scheme and the sheet the buyer picked. */
/** `refs`: single-view crops of the sheet for drawing shots (a whole sheet as reference made the model copy the sheet). */
export interface FixedMember extends CastMember { scheme: string; sheet: string; refs?: string[] }

export interface SubjectShot {
  id: string;
  /** STILL: one drawn frame moved by the renderer's camera; VIDEO: a generated clip, its cleanest second(s) used. */
  kind: 'still' | 'video';
  /** cutout: the subject alone on a plain ground, keyed and printed over a code-drawn ground; scene: a full picture. */
  frame: 'cutout' | 'scene';
  /** The cast members in the shot (ids); empty for a place with nobody in it. */
  cast: string[];
  size: 'wide' | 'medium' | 'close';
  /** The subjects' pose (still) or contained motion (video); hands and feet hidden where a subject has them. */
  subject: string;
  /** For a scene shot: the place, and why a real place is needed here. */
  place?: string;
  /** A correction for the drawing after a failed try (what the picture must or must not have), appended to its prompt. */
  note?: string;
  /** The side the subjects take; the lyric goes on the other. */
  side: 'left' | 'right' | 'center';
  /** The subjects' height as a share of the frame. */
  height: number;
  /** Still shots: the renderer's camera. */
  camera: 'static' | 'push' | 'pan' | 'parallax';
  /** Video shots: big motion is step-printed so missing in-betweens read as style. */
  step: boolean;
  why: string;
}
/** A line's shots in order, and what the code draws under them: the language's ground and, where the line means it, a kinetic move. */
export interface ScriptLine { cue: string; shots: string[]; /** A hold in beats when the line needs other than the rule gives: one for the line, or one per shot in order. */ beats?: number | number[]; ground: string; fx: string; fxWhy: string }
/** A line's text motion; `word` is the one emphasised (a word of the line), '' when nothing is. */
export interface LineText { cue: string; template: string; enter: string; exit: string; idle: string; emphasis: string; word: string; why: string }
/** A design for one undecided main member; `together` says how its combined view shows it with the decided members. */
export interface Candidate { for: string; letter: string; idea: string; look: string; scheme: string; together: string }
export interface SubjectScript {
  cast: CastMember[];
  /** Subjects considered and not taken, and why (3 lines when nothing is added to a decided cast). */
  alternatives: string;
  /** What the cast costs in drawings, clips and consistency risk, in the director's words. */
  tradeoffs: string;
  story: string;
  world: string;
  peak: string;
  shots: SubjectShot[];
  lines: ScriptLine[];
  text: LineText[];
  candidates: Candidate[];
  sameness: string;
}

/** What the song and the language offer the director: the names a script may use. */
export interface ScriptVocabulary {
  cues: { id: string; text: string }[];
  grounds: string[];
  fx: string[];
  templates: string[];
  enters: string[];
  exits: string[];
  idles: string[];
  emphases: string[];
  schemes: string[];
  /** Members decided before this call: kept as given, first in the cast, no candidates. */
  fixed?: FixedMember[];
}

export const MAX_CANDIDATES = 6;

/**
 * Only what the song and the language have survives: the decided members as given (first, their own fields), members
 * with distinct ids (a main one without candidates and a prop without a look are warned); cues in the window; grounds
 * and moves of the language on the lines; text motions on offer (a stranger falls back to the plainest); an emphasis
 * only on a word the line sings; candidates only for undecided main members, lettered per member, at most six each.
 * A line left with no shot is an error: the edit would have nothing to show over it. A line whose shots put the
 * subjects on different sides, a cut-out with nobody in it, and a shot naming an unknown member are warned.
 */
export function cleanScript(made: SubjectScript, v: ScriptVocabulary, warn: (msg: string) => void = () => {}): SubjectScript {
  const fixed = v.fixed ?? [];
  const given = (made.cast ?? []).map((m) => ({ ...m, tier: m.tier === 'prop' ? 'prop' as const : 'main' as const, look: m.look ?? '', features: m.features ?? [] }));
  const cast: CastMember[] = fixed.map((f) => {
    const own = given.find((m) => m.id === f.id);
    return { id: f.id, kind: f.kind, tier: 'main', what: f.what, look: f.look, role: own?.role || f.role, features: f.features, why: own?.why || f.why, fixed: true };
  });
  for (const m of given) {
    if (cast.some((x) => x.id === m.id)) continue;
    if (m.tier === 'prop' && !m.look) warn(`cast: prop ${m.id} has no look to draw it from`);
    cast.push({ ...m, fixed: false });
  }
  const ids = new Set(cast.map((m) => m.id));
  const cues = new Map(v.cues.map((c) => [c.id, c.text]));
  const grounds = new Set(v.grounds);
  const fx = new Set(v.fx);
  const shots = made.shots.map((s) => {
    const who = (s.cast ?? []).filter((id) => ids.has(id) || (warn(`${s.id}: unknown cast member ${id}, dropped`), false));
    if (s.frame === 'cutout' && !who.length) warn(`${s.id}: a cut-out with nobody in it`);
    return { ...s, cast: who, height: Math.min(1.6, Math.max(0.15, Number(s.height) || 0.4)) };
  });
  const byId = new Map(shots.map((s) => [s.id, s]));
  const lines = made.lines.filter((l) => cues.has(l.cue)).map((l) => {
    const next = { ...l, shots: l.shots.filter((id) => byId.has(id)), fxWhy: l.fxWhy ?? '' };
    if (next.ground && !grounds.has(next.ground)) { warn(`${l.cue}: unknown ground ${next.ground}, cleared`); next.ground = ''; }
    if (next.fx && !fx.has(next.fx)) { warn(`${l.cue}: unknown fx ${next.fx}, cleared`); next.fx = ''; next.fxWhy = ''; }
    const sides = new Set(next.shots.map((id) => byId.get(id)!.side).filter((s) => s !== 'center'));
    if (sides.size > 1) warn(`${l.cue}: subject on ${[...sides].join(' and ')} within one line (${next.shots.join(' ')}); the lyric would jump`);
    return next;
  });
  for (const c of v.cues) if (!lines.some((l) => l.cue === c.id && l.shots.length)) throw new Error(`script: line ${c.id} has no shots`);
  const pick = (x: string, offered: string[], plain: string) => (offered.includes(x) ? x : plain);
  const text = made.text.filter((t) => cues.has(t.cue)).map((t) => {
    const word = t.word ?? '';
    const sung = !!word && (cues.get(t.cue) ?? '').includes(word);
    if (t.emphasis && !sung) warn(`${t.cue}: emphasis ${t.emphasis} on "${word}", not a word of the line; dropped`);
    return {
      ...t,
      template: pick(t.template, v.templates, 'stair'),
      enter: pick(t.enter, v.enters, 'cut'),
      exit: pick(t.exit, v.exits, 'cut'),
      idle: pick(t.idle, v.idles, 'still'),
      emphasis: sung && v.emphases.includes(t.emphasis) ? t.emphasis : '',
      word: sung ? word : '',
    };
  });
  const open = cast.filter((m) => !m.fixed && m.tier === 'main').map((m) => m.id);
  const candidates = open.flatMap((id) => (made.candidates ?? []).filter((c) => c.for === id).slice(0, MAX_CANDIDATES).map((c, i) => ({
    ...c, letter: String.fromCharCode(65 + i), scheme: v.schemes.includes(c.scheme) ? c.scheme : v.schemes[0], together: c.together ?? '',
  })));
  for (const c of made.candidates ?? []) if (!open.includes(c.for)) warn(`candidate for ${c.for}: not an undecided main member; dropped`);
  for (const id of open) if (!candidates.some((c) => c.for === id)) warn(`cast: main member ${id} has no candidates to pick from`);
  return { ...made, cast, alternatives: made.alternatives ?? '', tradeoffs: made.tradeoffs ?? '', shots, lines, text, candidates };
}
