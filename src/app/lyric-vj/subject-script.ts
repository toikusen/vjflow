// The subject-video tier's script (scripts/lyric-vj/subject-script.mts): what the director answers for a window of a
// song, and the check that keeps only what the song and the language really have.

export interface SubjectShot {
  id: string;
  /** STILL: one drawn frame moved by the renderer's camera; VIDEO: a generated clip, its cleanest second(s) used. */
  kind: 'still' | 'video';
  /** cutout: the subject alone on a plain ground, keyed and printed over a code-drawn ground; scene: a full picture. */
  frame: 'cutout' | 'scene';
  cues: string[];
  size: 'wide' | 'medium' | 'close';
  /** The subject's pose (still) or its contained motion (video); hands and feet hidden where the subject has them. */
  subject: string;
  /** For a scene shot: the place, and why a real place is needed here. */
  place?: string;
  /** The language's code-drawn ground under a cut-out, by id. */
  ground?: string;
  /** A kinetic move of ours under or around the subject, only where the line means it; '' for none. */
  fx: string;
  fxWhy: string;
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
export interface LineText { cue: string; template: string; enter: string; exit: string; idle: string; emphasis: string; why: string }
export interface Candidate { letter: string; idea: string; look: string; scheme: string }
export interface SubjectScript {
  subject: { kind: 'person' | 'object' | 'animal' | 'phenomenon'; what: string; why: string; alternatives: string };
  story: string;
  world: string;
  peak: string;
  shots: SubjectShot[];
  lines: { cue: string; shots: string[]; beats?: number }[];
  text: LineText[];
  candidates: Candidate[];
  sameness: string;
}

/** What the song and the language offer the director: the names a script may use. */
export interface ScriptVocabulary {
  cues: string[];
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
 * Only what the song and the language have survives: cues in the window, grounds and moves of the language, text
 * motions on offer (a stranger falls back to the plainest), at most six candidates lettered in order. A line left
 * with no shot is an error: the edit would have nothing to show over it.
 */
export function cleanScript(made: SubjectScript, v: ScriptVocabulary, warn: (msg: string) => void = () => {}): SubjectScript {
  const cues = new Set(v.cues);
  const grounds = new Set(v.grounds);
  const fx = new Set(v.fx);
  const shots = made.shots.map((s) => {
    const next = { ...s, cues: s.cues.filter((c) => cues.has(c)), height: Math.min(1.6, Math.max(0.15, Number(s.height) || 0.4)) };
    if (next.frame === 'cutout' && next.ground && !grounds.has(next.ground)) { warn(`${s.id}: unknown ground ${next.ground}, cleared`); next.ground = ''; }
    if (next.fx && !fx.has(next.fx)) { warn(`${s.id}: unknown fx ${next.fx}, cleared`); next.fx = ''; next.fxWhy = ''; }
    return next;
  });
  const shotIds = new Set(shots.map((s) => s.id));
  const lines = made.lines.filter((l) => cues.has(l.cue)).map((l) => ({ ...l, shots: l.shots.filter((id) => shotIds.has(id)) }));
  for (const c of v.cues) if (!lines.some((l) => l.cue === c && l.shots.length)) throw new Error(`script: line ${c} has no shots`);
  const pick = (x: string, offered: string[], plain: string) => (offered.includes(x) ? x : plain);
  const text = made.text.filter((t) => cues.has(t.cue)).map((t) => ({
    ...t,
    template: pick(t.template, v.templates, 'stair'),
    enter: pick(t.enter, v.enters, 'cut'),
    exit: pick(t.exit, v.exits, 'cut'),
    idle: pick(t.idle, v.idles, 'still'),
    emphasis: t.emphasis && v.emphases.includes(t.emphasis) ? t.emphasis : '',
  }));
  const candidates = made.candidates.slice(0, MAX_CANDIDATES).map((c, i) => ({ ...c, letter: String.fromCharCode(65 + i), scheme: v.schemes.includes(c.scheme) ? c.scheme : v.schemes[0] }));
  return { ...made, shots, lines, text, candidates };
}
