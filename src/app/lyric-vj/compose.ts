// Composition pass (program, after the director): the gap analysis found nearly every frame centred and every
// chorus laid out the same. This moves centred shots off-centre so two centred frames never follow each other, and
// makes the choruses escalate (the keyword grows chorus by chorus). Bleed is switched off: every review read the
// cropped keyword as a layout overflow.
import { uses } from './design';
import { quietSpans } from './moments';
import type { Shot, TreatmentV3 } from './treatment';

type Anchor = 'L' | 'C' | 'R';

/** Shots the chorus skeleton never overwrites. */
const FIXED = new Set(['title-card', 'quiet']);

/** The song's hook as sung: the title without its bracketed reading or subtitle (第六感（THE SIXTH SENSE） → 第六感). */
export const titleHook = (title: string) => title.replace(/[（(［\[].*?[）)］\]]/g, '').trim();

/** Character ranges [from, to) where the hook appears in a line (case-insensitive for Latin titles). */
export function hookRanges(text: string, hook: string): [number, number][] {
  const chars = [...text.toLowerCase()];
  const h = [...hook.toLowerCase()];
  if (h.length < 2) return [];
  const out: [number, number][] = [];
  for (let i = 0; i + h.length <= chars.length; i++) if (h.every((c, k) => chars[i + k] === c)) out.push([i, (i += h.length - 1) + 1]);
  return out;
}

/** Per template: the param that places it horizontally and its values by anchor (absent = fixed composition). */
const PLACEMENT: Record<string, { param: string; values: Partial<Record<Anchor, string>> }> = {
  punch: { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  'frame-split': { param: 'align', values: { L: 'left', C: 'center', R: 'right' } },
  typewriter: { param: 'position', values: { L: 'left', C: 'center' } },
  vertical: { param: 'position', values: { L: 'left', C: 'center', R: 'right' } },
  handwrite: { param: 'position', values: { L: 'left', C: 'center' } },
};

/** Where a shot sits: diagonal and per-word templates read as off-centre already. */
export function anchorOf(s: Shot): Anchor | undefined {
  if (['scatter', 'beat-cut', 'stair', 'quiet'].includes(s.template)) return undefined;
  const p = PLACEMENT[s.template];
  if (!p) return 'C';
  const v = s.params[p.param];
  if (s.template === 'punch' && s.params['bleed']) return 'C';
  return (Object.entries(p.values).find(([, x]) => x === v)?.[0] as Anchor) ?? 'C';
}

/**
 * Moves every second centred shot in a run to the side (alternating left/right, away from the previous shot's side)
 * and sets the choruses' keyword size from restrained (first) to full width (last). Returns the repairs made.
 */
export function varyComposition(t: TreatmentV3, choruses: { start: number; end: number }[]): string[] {
  const fixes: string[] = [];
  let prev: Anchor | undefined;
  let side: Anchor = 'R';
  for (const s of t.shots) {
    const a = anchorOf(s);
    const place = PLACEMENT[s.template];
    if (a === 'C' && prev === 'C' && place && !s.params['bleed']) {
      side = side === 'R' ? 'L' : 'R';
      const want = place.values[side] ?? place.values.L ?? place.values.R;
      if (want) {
        s.params[place.param] = want;
        fixes.push(`${s.id} 改為偏${want === 'left' ? '左' : '右'}，避免連續置中`);
        prev = want === 'left' ? 'L' : 'R';
        continue;
      }
    }
    if (a === 'L' || a === 'R') side = a;
    prev = a ?? prev;
  }
  // every chorus keeps the first chorus's skeleton (same templates in the same order); only the escalation below and
  // the drops' growing strength change, so a returning chorus reads as the same section turned up
  const inChorus = (c: { start: number; end: number }) => t.shots.filter((x) => x.start >= c.start - 0.5 && x.start < c.end && !FIXED.has(x.template));
  const skeleton = choruses.length ? inChorus(choruses[0]) : [];
  if (uses(t.design, 'skeleton')) choruses.slice(1).forEach((c) => {
    inChorus(c).forEach((s, i) => {
      const src = skeleton[Math.min(i, skeleton.length - 1)];
      if (!src || src.template === s.template) return;
      s.template = src.template;
      s.params = { ...structuredClone(src.params), dim: s.params['dim'] ?? src.params['dim'] };
      fixes.push(`${s.id} 沿用第一次副歌的版型 ${src.template}`);
    });
  });
  // chorus lines carry a large outlined echo of their keyword behind them (except where the type is already huge)
  // ponytail: only the chorus's first 12 s — an echo on every line becomes the next template look
  if (uses(t.design, 'echo')) for (const c of choruses) for (const s of inChorus(c)) if (s.template !== 'beat-cut' && s.start < c.start + 12) s.params['echo'] = true;
  // choruses escalate: keyword width rises chorus by chorus
  choruses.forEach((c, k) => {
    const last = k === choruses.length - 1;
    const width = choruses.length > 1 ? 0.62 + (0.3 * k) / (choruses.length - 1) : 0.8;
    for (const s of t.shots.filter((x) => x.template === 'punch' && x.start < c.end && x.end > c.start)) {
      s.params['keywordWidth'] = +width.toFixed(2);
      s.params['bleed'] = false;
      if (last) s.params['align'] = 'center';
    }
  });
  // quiet spans (breaks) drop the type down a register: thin mincho, small, still, left or centred
  let left = false;
  for (const q of uses(t.design, 'quiet') ? quietSpans(t.moments ?? []) : []) {
    for (const s of t.shots.filter((x) => x.template !== 'title-card' && Math.min(x.end, q.end) - Math.max(x.start, q.start) > 0.6 * (x.end - x.start))) {
      s.template = 'quiet';
      s.params = { position: left ? 'left' : 'center', dim: 0.7 };
      left = !left;
      fixes.push(`${s.id} 安靜段改用 quiet 版型`);
    }
  }
  // leaving a chorus, the next picture opens through the motif's shape (the engine's iris on 'wipe'): the motif
  // does a job instead of floating over the frame as a watermark
  for (const c of choruses) {
    const next = t.shots.find((s) => Math.abs(s.start - c.end) < 1.5 && s.start > c.start);
    if (next && next.transitionIn !== 'wipe') {
      next.transitionIn = 'wipe';
      fixes.push(`${next.id} 用主題物件形狀轉場離開副歌`);
    }
  }
  return fixes;
}
