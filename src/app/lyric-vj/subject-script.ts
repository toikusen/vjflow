// The subject-video tier's script (scripts/lyric-vj/subject-script.mts): what the director answers for a window of a
// song, and the check that keeps only what the song and the language really have.

export interface SubjectShot {
  id: string;
  /** STILL: one drawn frame moved by the renderer's camera; VIDEO: a generated clip, its cleanest second(s) used. */
  kind: 'still' | 'video';
  /** cutout: the subject alone on a plain ground, keyed and printed over a code-drawn ground; scene: a full picture. */
  frame: 'cutout' | 'scene';
  size: 'wide' | 'medium' | 'close';
  /** The subject's pose (still) or its contained motion (video); hands and feet hidden where the subject has them. */
  subject: string;
  /** For a scene shot: the place, and why a real place is needed here. */
  place?: string;
  /** The side the subject takes; the lyric goes on the other. */
  side: 'left' | 'right' | 'center';
  /** The subject's height as a share of the frame. */
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
export interface Candidate { letter: string; idea: string; look: string; scheme: string }
export interface SubjectScript {
  subject: { kind: 'person' | 'object' | 'animal' | 'phenomenon'; what: string; why: string; alternatives: string; /** The parts of the subject the shots rely on: every candidate sheet shows them all. */ features: string[] };
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
}

export const MAX_CANDIDATES = 6;

/**
 * Only what the song and the language have survives: cues in the window, grounds and moves of the language on the
 * lines, text motions on offer (a stranger falls back to the plainest), an emphasis only on a word the line sings, at
 * most six candidates lettered in order. A line left with no shot is an error: the edit would have nothing to show
 * over it. A line whose shots put the subject on different sides is warned: its lyric would have to jump.
 */
export function cleanScript(made: SubjectScript, v: ScriptVocabulary, warn: (msg: string) => void = () => {}): SubjectScript {
  const cues = new Map(v.cues.map((c) => [c.id, c.text]));
  const grounds = new Set(v.grounds);
  const fx = new Set(v.fx);
  const shots = made.shots.map((s) => ({ ...s, height: Math.min(1.6, Math.max(0.15, Number(s.height) || 0.4)) }));
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
  const candidates = made.candidates.slice(0, MAX_CANDIDATES).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i), scheme: v.schemes.includes(c.scheme) ? c.scheme : v.schemes[0] }));
  return { ...made, subject: { ...made.subject, features: made.subject.features ?? [] }, shots, lines, text, candidates };
}
