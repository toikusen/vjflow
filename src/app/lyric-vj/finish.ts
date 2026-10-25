// The passes that finish a director's design, in one order for the director and for the tests: the composition and
// clean-up passes work on the director's own look, the song signature goes on after them, and the lyric sides are
// planned last, against the look as it will be drawn.
import { planSides, stackRushed, varyComposition } from './compose';
import { keepOwnMotifs, LANGUAGES, type LanguageId } from './languages';
import { buildOnRise, dropEmptyFrames, dropNestedBlobs, dropTitleStamps } from './look';
import type { GraphicsLook } from './render/graphics';
import { stripSignature } from './signature';
import { TEMPLATES } from './templates';
import { signLook, type TreatmentV3 } from './treatment';

export interface FinishOptions {
  language: LanguageId;
  /** The song's chorus stretches (structure.ts chorusSpans). */
  choruses: { start: number; end: number }[];
  cues: { id: string; start: number; end: number; text: string }[];
  duration: number;
  /** The song's music sections (song.json), for a look that builds with the music; none, no split. */
  music?: { start: number; energy: number }[];
  /** The window's start (validateLook's). */
  start: number;
  /** Keeps the texture apart from recent songs (direct.mts); none in tests. */
  apart?: (t: TreatmentV3, fixes: string[]) => void;
  /** A story to keep instead of the one just written (--keep-story: its props are already drawn), put in before every
   * other pass so the layout and the checks run on the story that is delivered. */
  story?: Pick<GraphicsLook, 'story' | 'storyProps'>;
  /** The song's title (artist - title), idle text for a calls board. */
  title?: string;
}

/**
 * Finishes a validated design in place. Returns the repairs made and the errors of signing the look. Signing last means
 * the clean-up passes never see (or drop) the signature's own layers, and a treatment saved and validated again signs
 * the same look the same way.
 */
export function finishDesign(t: TreatmentV3, o: FinishOptions): { fixes: string[]; errors: string[] } {
  const fixes: string[] = [];
  if (t.graphics) t.graphics = stripSignature(t.graphics);
  if (o.story && t.graphics) {
    t.graphics = { ...t.graphics, story: structuredClone(o.story.story), storyProps: structuredClone(o.story.storyProps) };
    fixes.push('沿用原本的故事與道具');
  }
  // a language with no story props drops the story the director wrote (it would hang props beside the interface)
  if (LANGUAGES[o.language]?.story === false && (t.graphics?.story?.length || t.graphics?.storyProps?.length)) {
    // the props a chat sends as stickers are kept (drawn by props.mts), every story item goes
    const sent = new Set(t.shots.flatMap((s) => (s.params['attachKind'] === 'sticker' && typeof s.params['attach'] === 'string' ? [String(s.params['attach']).replace(/^spr:/, '')] : [])));
    const had = t.graphics!.story?.length ?? 0;
    t.graphics = { ...t.graphics!, story: [], storyProps: (t.graphics!.storyProps ?? []).filter((p) => sent.has(p.id)) };
    if (had) fixes.push(`「${LANGUAGES[o.language].name}」不用故事物件（貼圖只在訊息裡），已移除`);
  }
  // a language printed in one medium (a phone screen is clean glass) keeps it
  const forced = LANGUAGES[o.language]?.medium;
  if (forced && t.design && t.design.medium !== forced) {
    fixes.push(`「${LANGUAGES[o.language].name}」用 ${forced} 媒材`);
    t.design.medium = forced as never;
  }
  // an interface's lines are messages: their template moves them (sent, pushed up, typed), so the lyric effects meant
  // for captions go — 天文対話's focus entrance and scale emphasis blew a message up into huge blurred black glyphs
  fixes.push(...interfaceText(t, o.language));
  // a storyboard says where its calls go (an LED wall part, a badge): no stock board on top
  if (!t.storyboard?.length) fixes.push(...callBoard(t, o.language, o.title));
  // storyboard shots are locked: the passes below reflow, merge and re-side lines, so they never see them
  const sceneIds = new Set(t.shots.filter((s) => s.template === 'scene').map((s) => s.id));
  const lockedShots = t.shots.filter((s) => sceneIds.has(s.id));
  const lockedCues = t.cues.filter((c) => sceneIds.has(c.shot));
  if (sceneIds.size) {
    t.shots = t.shots.filter((s) => !sceneIds.has(s.id));
    t.cues = t.cues.filter((c) => !sceneIds.has(c.shot));
    fixes.push(`${sceneIds.size} 個分鏡鏡頭（${lockedCues.length} 句）鎖定，不經過構圖變化、快句疊放、左右排版`);
  }
  // grain is texture, not a filter: a heavy one greys every frame (LOVE YOU KILL YOU at 0.45); new designs keep it light
  if (t.design && t.design.grain > 0.25) {
    fixes.push(`顆粒 ${t.design.grain} 太重，調為 0.25`);
    t.design.grain = 0.25;
  }
  // the chorus skeleton and echo follow the techniques this pass just chose (run before it, an unset list meant "all"
  // and a skeleton the director then dropped stayed applied)
  fixes.push(...varyComposition(t, o.choruses));
  fixes.push(...keepOwnMotifs(t as never, o.language));
  o.apart?.(t, fixes);
  fixes.push(...dropEmptyFrames(t.graphics, o.cues, o.duration));
  fixes.push(...dropTitleStamps(t.graphics, t.shots, o.duration));
  fixes.push(...dropNestedBlobs(t.graphics));
  fixes.push(...buildOnRise(t.graphics, o.music ?? [], o.cues, o.duration));
  // lines sung faster than they read stay up while the next lands (fast idol songs and rap lost half their lines)
  fixes.push(...stackRushed(t, o.cues));
  t.shots = [...t.shots, ...lockedShots].sort((a, b) => a.start - b.start);
  t.cues = [...t.cues, ...lockedCues];
  const errors = signLook(t, o.start);
  // last: the lines take the side the design leaves free (readability outranks the off-centre variety pass)
  fixes.push(...planSides(t));
  return { fixes, errors };
}

/** Strips caption effects (entrances, exits, emphasis other than colour, beat accents) from the lines in an interface
 * language's own templates. Returns the repairs made. */
export function interfaceText(t: TreatmentV3, language: LanguageId): string[] {
  const own = LANGUAGES[language]?.layout;
  if (!own) return [];
  const shots = new Map(t.shots.map((s) => [s.id, s.template]));
  let n = 0;
  for (const c of t.cues) {
    const tpl = shots.get(c.shot);
    if (!tpl || !own.lyrics.includes(tpl)) continue;
    const spec = TEMPLATES[tpl];
    const keep = (c.emphasis ?? []).filter((e) => e.method === 'color');
    if (c.enter !== spec.defaultEnter || c.exit !== spec.defaultExit || (c.emphasis?.length ?? 0) !== keep.length || c.accents?.length || c.reveal === 'word') n++;
    c.enter = spec.defaultEnter;
    c.exit = spec.defaultExit;
    c.reveal = 'line';
    c.emphasis = keep.length ? keep : undefined;
    delete c.accents;
  }
  return n ? [`${n} 句介面訊息拿掉字幕特效（進出場、放大、空心、踩拍），由訊息版型自己演`] : [];
}

/** Keeps a calls board in every section of a language that shouts its calls on one (idol Live): a section without an
 * LED board gets one in its accent, and its boards show the calls. Returns the repairs made. */
export function callBoard(t: TreatmentV3, language: LanguageId, title = ''): string[] {
  if (!LANGUAGES[language]?.callBoard || !t.graphics) return [];
  let added = 0;
  for (const sec of t.graphics.sections) {
    const boards = sec.layers.filter((l) => l.kind === 'led');
    for (const l of boards) if (l.kind === 'led') l.calls = true;
    if (boards.length) continue;
    // the lights-out beat before a chorus keeps its board too: dark, it still reads as the same stage
    sec.layers.push({ kind: 'led', calls: true, color: sec.accent ?? t.styleAnchor.palette.accent, text: title || '★', y: -0.84 });
    added++;
  }
  return added ? [`${added} 個段落補上 Call 看板（LED，Call 在喊的那一拍打上去）`] : [];
}
