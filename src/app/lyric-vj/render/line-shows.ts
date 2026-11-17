// When each line of a job really shows, and which linked page moves its world lays: the engine's own steps (render/engine.ts),
// taken out so the plan (world-events-adapter.ts, Q1 phase 2) reads the very times the renderer uses instead of
// estimating them. It moves a shot's first cut forward (picture-lead.ts) and lays the linked moves (world-handoff.ts) on
// the sections it is given: the engine hands it the job's own, the plan a copy. Numbers only, no drawing.
import type { TimelineCue } from '../timeline';
import type { CueStyle, Shot } from '../treatment';
import { pageCutBefore } from './cover';
import { isLineMotion } from './motion-transition';
import { pullPictures } from './picture-lead';
import { readingSec, setTogether } from './reading-window';
import { foldRepeats } from './repeats';
import { mustShare } from './sung-tail';
import { enterSec as lineEnterSec } from './enter-sec';
import { lastSungOf, leadOf, showTime } from './show-time';
import { linkGrounds } from './world-handoff';

/** A line as the engine sets it: its treatment style and its sung cue (two lines set together are one). */
export interface ShownLine { style: CueStyle; cue: TimelineCue }
export interface Section { start: number; transition?: { kind: string; dur?: number; dir?: number; seam?: number }; layers: { kind: string; own?: boolean; t0?: number }[] }

/** Vertical presentation forms (︕︖︙) set as their horizontal marks, one for one so character timings keep their indexes. */
export function horizontalPunct<T extends { text: string }>(c: T): T {
  return c && /[︕︖︐]/.test(c.text) ? { ...c, text: c.text.replace(/︕/g, '！').replace(/︖/g, '？').replace(/︐/g, '、') } : c;
}
/** A thread sends each line as its own message, on the first sung syllable. */
export const threadShot = (s?: { template: string }) => s?.template === 'chat' || s?.template === 'reply-thread';
/** Laid out in frame px or sending from a fixed place: nothing can carry them across a handoff. */
export const NO_HANDOFF = new Set(['world-set', 'world-pair', 'contrast-split', 'lanes', 'singalong', 'scroll', 'chat', 'reply-thread', 'title-card', 'counterweight', 'panel-route']);

/** The page handoffs a treatment's one event plan approved (world-events.ts), by the line handed into; undefined without a plan. */
/** The most characters two lines set together to share the frame may have (two rows a viewer still reads). */
export const SHARE_CHARS = 40;

export const approvedOf = (t: { worldEvents?: { events: { kind: string; fixed?: boolean; lineIds: string[] }[] } }) => (t.worldEvents ? new Set(t.worldEvents.events.filter((e) => e.kind === 'page-handoff' && e.fixed).map((e) => e.lineIds[e.lineIds.length - 1])) : undefined);

/**
 * The lines a job shows and when (the engine's order of steps): repeats folded, two lines too quick to read set
 * together, each line's show time (show-time.ts, after any page it waits for), handoffs gated on the times the lines
 * really got, a shot's first cut pulled to its line, then the world's linked page moves laid on `sections`, only those
 * `approved` names when it is given (Q1: the scheduler's table; a boundary it did not approve keeps its plain cut).
 */
export function lineShows(treatment: { cues: CueStyle[]; shots: Shot[]; graphics?: { sections: Section[] } }, cues: TimelineCue[], tempo: number | undefined, sections: Section[] = treatment.graphics?.sections ?? [], approved?: Set<string>) {
  const all = treatment.cues
    .map((style) => ({ style, cue: horizontalPunct(cues.find((c) => c.id === style.cueId)!) }))
    .filter((x) => x.cue)
    .sort((a, b) => a.cue.start - b.cue.start);
  const shouts = all.filter((x) => x.style.shout);
  const sceneShots = new Set(treatment.shots.filter((s) => s.template === 'scene').map((s) => s.id));
  const sorted = all.filter((x) => !x.style.shout && !sceneShots.has(x.style.shot));
  const shotOf = (id: string) => treatment.shots.find((s) => s.id === id);
  // a line sung again straight away stays up as one line that pulses on each repeat (repeats.ts); a chat keeps every
  // message: the earlier ones stay up in the thread, and sending it three times is the point
  const { lines: styled, repeats } = foldRepeats<ShownLine>(sorted, (x) => !!threadShot(shotOf(x.style.shot)));
  // two lines sung back to back faster than either can be read are set together as one two-row line: the first
  // stays up while the second is sung (word reveal follows the voice across both)
  for (let i = 0; i + 1 < styled.length; i++) {
    const a = styled[i].cue;
    const b = styled[i + 1].cue;
    // a chat sends each line as its own message: the thread keeps both up anyway
    const inChat = threadShot(shotOf(styled[i].style.shot));
    // the composer's pair of lines in one shot is that same idea with each keeping its own line
    // (the composer plans these itself, as pairs, so a recipe is chosen knowing the line's real length)
    // (and two whose handover cannot be clean — same start, a duet's overlap, the next sung before this one may leave —
    // share the frame in their own rows rather than one hiding the other, sung-tail.ts mustShare)
    const ns = styled[i + 1].style;
    const onset = ns.reveal === 'sung' && ns.sung?.length === [...b.text].length ? ns.sung[0] : (b.charStarts?.[0] ?? b.start);
    const share = mustShare(a, b, onset) && [...`${a.text}${b.text}`.replace(/\s/g, '')].length <= SHARE_CHARS;
    if (inChat || styled[i].style.budget || !(setTogether(a, b) || share) || repeats.has(a.id) || repeats.has(b.id)) continue;
    const aLen = [...a.text].length;
    styled[i] = {
      style: { ...styled[i].style, rows: [aLen + 1], reveal: 'word' },
      cue: { ...a, text: `${a.text} ${b.text}`, end: Math.max(a.end, b.end), charStarts: a.charStarts && b.charStarts ? [...a.charStarts, a.end, ...b.charStarts] : undefined, charTimed: !!(a.charTimed && b.charTimed) },
    };
    styled.splice(i + 1, 1);
  }
  // slow songs show each line a little before the voice (breathing timing); fast songs stay on the beat
  const lead = leadOf(tempo);
  // a line shows ahead of its voice, but never while the previous line's last word is still being sung
  const lastSung = styled.map(({ cue }) => lastSungOf(cue));
  // a line laid on a page (a cut-out page or a director's drawing, a painted frame) comes with its page's cut, not
  // ahead of it: ahead, it stood on the page before, whose figures were placed clear of another line (cover.ts)
  const pages = sections.filter((s) => s.layers.some((l) => l.kind === 'code' || (l.kind === 'photo' && l.own))).map((s) => s.start);
  const showAt = styled.map(({ cue, style }, i) => {
    // a message is sent on the line's first sung syllable, not ahead of it (the database's chat videos: the bubble
    // lands on the beat the voice comes in)
    if (threadShot(shotOf(style.shot))) return cue.start;
    return pageCutBefore(pages, showTime(cue, style.enter, lead, lastSung[i - 1]), cue.start);
  });
  // a handoff only runs where it costs neither line any reading: gated here on the times the lines really got
  for (const [i, { cue, style }] of styled.entries()) {
    const h = style.handoff;
    if (!h) continue;
    const prev = styled[i - 1];
    const layout = (s: { shot: string }) => shotOf(s.shot)?.template ?? '';
    const paceOf = (c: TimelineCue) => Math.min(1, Math.max(0.35, (c.end - c.start) / 2));
    const read = !!prev && h.from - showAt[i - 1] >= lineEnterSec(prev.style.enter, paceOf(prev.cue)) + readingSec(prev.cue.text, prev.cue.start, prev.cue.end) - 0.05 && (showAt[i + 1] ?? Infinity) - h.to >= readingSec(cue.text, cue.start, cue.end) - 0.05;
    if (!read || NO_HANDOFF.has(layout(style)) || NO_HANDOFF.has(layout(prev.style))) {
      styled[i] = { cue, style: { ...style, handoff: undefined } };
      // the picture stays with the line: a backdrop pushed off under a line that stays put reads as a mistake
      const sec = sections.find((s) => s.transition && isLineMotion(s.transition.kind) && Math.abs(s.start - h.from) < 0.06);
      if (sec) delete sec.transition;
    } else showAt[i] = h.kind === 'relay' ? h.from + 0.4 * (h.to - h.from) : h.from;
  }
  // a line never comes in on the picture before its own: its shot and the shot's first cut come forward to its entrance
  // (picture-lead.ts); where they cannot, the line waits for its picture
  const { late } = pullPictures(treatment.shots, sections, styled.map(({ style }, i) => ({ shot: style.shot, show: showAt[i] })));
  for (const [i, { style }] of styled.entries()) if (late.has(style.shot) && styled.findIndex((x) => x.style.shot === style.shot) === i) showAt[i] = Math.max(showAt[i], late.get(style.shot)!);
  // a world's linked ways in and out run on its page across the boundary between two lines (world-handoff.ts)
  const laid = linkGrounds(sections, styled.map(({ cue, style }, i) => ({ id: cue.id, show: showAt[i], start: cue.start, shot: style.shot, world: style.world, handoff: !!style.handoff })), approved);
  return { styled, repeats, shouts, showAt, laid };
}
