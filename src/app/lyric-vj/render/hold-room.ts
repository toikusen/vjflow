// The room a settling hold event has (world-beats.ts, Q2 of docs/research/2026-11-09-rhythm-gaps-codex.md), worked out
// the same way by the plan (lineplan-core beatOfLine, on a rough measure of the line) and by the renderer (world-layout,
// on the glyphs as set): an event the plan places is one the renderer can draw, never a silent one (2026-11-09 review:
// 128 carrier events had planned on objects that are not carriers and drew nothing). Numbers only, no drawing.
import { contrast } from '../contrast';
import { keyInk } from './key-ink';
import { GROW, OPEN, SETTLE } from './world-beats';
import type { Slots } from './world-objects';
import type { Block, SetSpec } from './world-sets';
import { gapOf, LINE_CLEAR, toPx } from './carrier-fit';

/** Every ink a line is read in reads at least this on what is under it (WCAG AA). */
export const READ_MIN = 4.5;
/** A key on a carrier of the set's own reads at this, the carrier's colour being all there is under it. */
const READ_ON_CARRIER = 6;

/**
 * Objects that are opaque and hold the whole line: words on one read on the object alone, so the ground and a set piece
 * draw under it as they are, with no room of plain paper cut round the words (a paper block wider than the banner or
 * the note stood beside it as a bare shape, 2026-11-04 audit: papercut, crayon, led-board, gothic-lolita).
 */
export const CARRIERS = new Set<string>(['pad-sheet', 'cut-banner', 'cut-panel', 'book-leaf', 'book-page', 'transcript-tape', 'mend-patch', 'tenugui', 'led-module', 'led-pillar', 'led-strip', 'sign-box', 'sign-blade', 'lit-paper', 'caption-band', 'card-corner', 'title-card', 'tty-pane', 'colour-plate']);
/** The carriers that are a panel or a window of their world's page: they may open past an edge. */
export const PANEL_OBJECTS = new Set(['tty-pane', 'title-card', 'caption-band', 'card-corner', 'book-page', 'cut-panel', 'sign-box', 'colour-plate']);

/** A grown block keeps this far inside the frame, px; a carrier keeps at least this margin past the words, px. */
export const GROW_EDGE = 24;
export const SETTLE_MARGIN = 28;

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * How far a line's room may grow from the side its set is anchored on, staying inside the frame's safe edge (an edge a
 * bleed set already leaves past it may stay there but go no further) and clear of its page's graphics: the largest step
 * from the want down to the least, else 1 (no event).
 */
export function growRoom(r: Rect, spec: Pick<SetSpec, 'ax' | 'ay' | 'clear' | 'bands'>, want = GROW.want, least = GROW.least): number {
  const at = (k: number): Rect => {
    const [w, h] = [(r.x1 - r.x0) * k, (r.y1 - r.y0) * k];
    const x0 = spec.ax < 0 ? r.x0 : spec.ax > 0 ? r.x1 - w : (r.x0 + r.x1 - w) / 2;
    const y0 = spec.ay < 0 ? r.y0 : spec.ay > 0 ? r.y1 - h : (r.y0 + r.y1 - h) / 2;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  };
  const clear = (spec.clear ?? []).map(([a, b, c, d]) => ({ x0: a * 1920, y0: b * 1080, x1: c * 1920, y1: d * 1080 }));
  const meets = (q: Rect, c: Rect) => q.x0 < c.x1 && q.x1 > c.x0 && q.y0 < c.y1 && q.y1 > c.y0;
  const inside = (q: Rect) => q.x0 >= Math.min(GROW_EDGE, r.x0) && q.x1 <= Math.max(1920 - GROW_EDGE, r.x1) && q.y0 >= Math.min(GROW_EDGE, r.y0) && q.y1 <= Math.max(1080 - GROW_EDGE, r.y1);
  // (a line on a band its page prints at a fixed place grows only inside one band, clear of its lines: render/carrier-fit)
  const onBand = (q: Rect) => !spec.bands?.length || spec.bands.some((b) => { const p = toPx(b.box); return q.x0 >= p.x0 && q.x1 <= p.x1 && q.y0 >= p.y0 && q.y1 <= p.y1 && (b.lines ?? []).every((l) => gapOf(q, toPx(l)) >= LINE_CLEAR); });
  for (let k = want; k >= least - 1e-9; k -= 0.01) { const q = at(k); if (inside(q) && onBand(q) && clear.every((c) => meets(r, c) || !meets(q, c))) return +k.toFixed(2); }
  return 1;
}

/**
 * The carrier a set draws under its line: its size and where it stands against the block's centre, px (y up). It takes at
 * least its share of the frame and stays in the frame, as far as it can stay centred on the words; a split line's object
 * holds its hero part only.
 */
export function carrierBox(spec: Pick<SetSpec, 'object' | 'pad' | 'fill'>, block: Pick<Block, 'cx' | 'cy' | 'w' | 'h' | 'hero'>) {
  if (!spec.object) return undefined;
  const [px, py] = spec.pad ?? [0, 0];
  const hero = block.hero ?? { cx: 0, cy: 0, w: block.w, h: block.h };
  // (a carrier grows to its share only as far as it can stay centred on the words: pushed back into the frame, a big card
  // left its line at its top edge and the rest of it empty, silent-film's corner card, 2026-11-04 audit ①)
  const centred = (c: number, frame: number) => (CARRIERS.has(spec.object!) ? Math.max(0, 2 * (frame - Math.abs(c))) : Infinity);
  const [ow, oh] = [Math.max(hero.w + px * 2, Math.min(centred(block.cx + hero.cx, 960), (spec.fill?.[0] ?? 0) * 1920)), Math.max(hero.h + py * 2, Math.min(centred(block.cy + hero.cy, 540), (spec.fill?.[1] ?? 0) * 1080))];
  const inside = (c: number, half: number, frame: number) => (half >= frame ? -c : Math.min(frame - half, Math.max(half - frame, c)) - c);
  return { ow, oh, x: hero.cx + inside(block.cx + hero.cx, ow / 2, 960), y: hero.cy + inside(block.cy + hero.cy, oh / 2, 540) };
}

/** How a carrier settles (slides along its slack round the words) or opens (past its edge with frame beyond it), px; undefined when it has no room or is no carrier. */
export function carrierRoom(kind: 'carrier-settle' | 'panel-open', spec: Pick<SetSpec, 'object' | 'pad' | 'fill'>, block: Pick<Block, 'cx' | 'cy' | 'w' | 'h' | 'hero'>, seed = 0, offset: [number, number] = [0, 0]) {
  if (!spec.object || !CARRIERS.has(spec.object) || (kind === 'panel-open' && !PANEL_OBJECTS.has(spec.object))) return undefined;
  const box = carrierBox(spec, block)!;
  const at = [block.cx + offset[0] + box.x, block.cy + offset[1] + box.y];
  if (kind === 'panel-open') {
    // (it opens toward the frame's wider side, and only as far as the frame shows it)
    const side = at[0] > 0 ? -1 : 1;
    const e = Math.min(OPEN.share * box.ow, 960 - GROW_EDGE - Math.abs(at[0] + (side * box.ow) / 2));
    return e >= OPEN.least ? { dx: 0, dy: 0, ox: (side * e) / 2, sx: e / box.ow } : undefined;
  }
  const [pw, ph] = spec.pad ?? [0, 0];
  const slackX = (box.ow - block.w) / 2 - Math.abs(box.x) - Math.max(SETTLE_MARGIN, pw * 0.5);
  const slackY = (box.oh - block.h) / 2 - Math.abs(box.y) - Math.max(SETTLE_MARGIN, ph * 0.5);
  const towards = (c: number) => (Math.abs(c) > 4 ? -Math.sign(c) : seed % 2 ? 1 : -1);
  const dx = Math.min(slackX, SETTLE.share * 1920);
  if (dx >= SETTLE.least) return { dx: dx * towards(at[0]), dy: 0, ox: 0, sx: 0 };
  const dy = Math.min(slackY, SETTLE.share * 1920);
  return dy >= SETTLE.least ? { dx: 0, dy: dy * towards(at[1]), ox: 0, sx: 0 } : undefined;
}

/** Two inks far enough apart for a change of the whole line to be seen: one channel moves at least this much of 255. */
export const SETTLE_APART = 48;
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/**
 * The second ink a whole line settles into (line-ink-settle): the first of the candidates apart enough from the line's own
 * ink that reads at 4.5:1 on every ground really under the words; undefined when the scheme has none.
 */
export function settleInk(base: string, candidates: (string | undefined)[], grounds: string[]): string | undefined {
  const hex = (c?: string): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);
  const gs = grounds.filter(hex);
  if (!hex(base) || !gs.length) return undefined;
  const [b] = [channels(base)];
  return candidates.filter(hex).find((c) => c.toLowerCase() !== base.toLowerCase() && Math.max(...channels(c).map((v, i) => Math.abs(v - b[i]))) >= SETTLE_APART && gs.every((g) => contrast(c, g) >= READ_MIN));
}

/** A phrase may swap to the key ink and keep it only when both inks read at 4.5:1 on what the words stand on. */
export const swapReads = (base: string, key: string, back: string | undefined, under: string[] = []) => !!back && [base, key, back].every((c) => /^#[0-9a-f]{6}$/i.test(c)) && contrast(key, back) >= READ_MIN && contrast(base, back) >= READ_MIN && key.toLowerCase() !== base.toLowerCase() && under.filter((g) => /^#[0-9a-f]{6}$/i.test(g)).every((g) => contrast(key, g) >= READ_MIN);

/** What the renderer sees under a line that the plan does not: the background it is shown on, what the picture puts under it, the song's accent. */
export interface Seen { background?: string; under?: string[]; accent?: string }
const hex = (c?: string): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);
/** The slots a set's words stand on when it draws (or its page draws) a carrier under them; undefined off a carrier. */
export const carrierSlots = (spec: Pick<SetSpec, 'on' | 'object' | 'ink' | 'under'>): (keyof Slots)[] | undefined => spec.on ?? (spec.object || (spec.ink === 'plateInk' && !spec.under) ? ['plate'] : undefined);
/**
 * Every ground under a set's words: its carrier, else the background, what the picture puts there, and the plate and
 * ground colours the page may lay under the words where nothing measured it (terminal's windows, silk's bands).
 */
export function groundsUnder(spec: Pick<SetSpec, 'on' | 'object' | 'ink' | 'under'>, slots: Slots, seen: Seen = {}): string[] {
  const on = carrierSlots(spec);
  return (on ? on.map((k) => slots[k]) : [seen.background ?? slots.ground, ...(seen.under ?? []), slots.plate, slots.ground]).filter(hex);
}
/**
 * A set's key ink, as the renderer marks a key word (world-layout keyOf): the set's own key or the accent, moved until it
 * reads on what the words stand on and stays apart from the body ink; a one-ink set's key is its ink.
 */
export function keyFor(spec: SetSpec, slots: Slots, body: string, seen: Seen = {}): string {
  if (spec.plain) return body;
  const on = carrierSlots(spec);
  const accent = seen.accent ?? slots.accent;
  // (off a carrier, the key reads on the background and on what the picture really puts under the line; it stays apart
  // from the body ink: a key pushed to read until it was the body's black marked nothing, brutalist's red on 世界のつづき)
  const grounds = on ? on.map((k) => slots[k]) : [seen.background ?? slots.ground, ...(seen.under ?? [])];
  return keyInk(spec.key ? slots[spec.key] : accent, [slots.accent, slots.ink2, accent], body, grounds, on && (spec.object || spec.on) ? READ_ON_CARRIER : READ_MIN);
}
/**
 * What a line on this set may do with its inks, worked out the same by the plan (palette only) and the renderer (with
 * what it sees): a key-ink pulse (keyOk), a phrase swap (swapOk), and the second ink a whole line settles into (settle).
 * Each new ink reads at READ_MIN on every ground under the words (groundsUnder).
 */
export function inkChecks(spec: SetSpec, slots: Slots, body: string, seen: Seen = {}) {
  const grounds = groundsUnder(spec, slots, seen);
  const key = keyFor(spec, slots, body, seen);
  const back = [seen.background ?? slots.ground, slots.plate, slots.ground].filter(hex).sort((x, y) => contrast(body, y) - contrast(body, x))[0];
  const reads = (c: string) => hex(c) && grounds.every((g) => contrast(c, g) >= READ_MIN);
  return {
    key,
    keyOk: hex(body) && key.toLowerCase() !== body.toLowerCase() && reads(key),
    swapOk: swapReads(body, key, back, grounds),
    settle: settleInk(body, [spec.plain ? undefined : key, slots.ink2, slots.accent, slots.plateInk, slots.ink, seen.accent], grounds),
  };
}

/** `a` blended toward `b` by k, per sRGB channel. */
const blend = (a: string, b: string, k: number) => `#${channels(a).map((v, i) => Math.round(v + (channels(b)[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
/** The blends of the line's ink toward its held ink that the reading check samples (the ends included). */
export const ABSORB_BLENDS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Whether an ink-only hold keeps its settled ink through a material move that changes what the same words stand on (Q1
 * phase 4a, absorption; Codex 2026-11-10 §3): the hold's new ink (the whole line's settle ink, or a swapped phrase's key),
 * the line's own ink, every blend between the two and the split part's own ink each read at READ_MIN on every ground
 * under the words on the old seat, on the new seat and on each ground the move lays under them meanwhile (`under`); and
 * the new seat gives the hold the very ink the old one did (the settled state is kept, never re-picked). The plan asks it
 * on the palette alone, as it asks inkChecks; the renderer reads the same sets' inks per pose (world-layout settleBy).
 */
export function absorbInk(kind: string, from: SetSpec, to: SetSpec, slots: Slots, body: string, under: (keyof Slots)[] = [], seen: Seen = {}): { ok: true; ink: string } | { ok: false; why: string } {
  const [a, b] = [inkChecks(from, slots, body, seen), inkChecks(to, slots, body, seen)];
  const held = (x: typeof a) => (kind === 'line-ink-settle' ? x.settle : kind === 'ink-swap' && x.swapOk ? x.key : undefined);
  const ink = held(a);
  if (kind !== 'line-ink-settle' && kind !== 'ink-swap') return { ok: false, why: `${kind} is not an ink-only hold` };
  if (!ink || !hex(ink) || !hex(body)) return { ok: false, why: `${kind}: no held ink on the old seat` };
  const kept = held(b);
  if (!kept || kept.toLowerCase() !== ink.toLowerCase()) return { ok: false, why: `${kind}: the new seat holds ${kept ?? 'no ink'}, not ${ink}` };
  const grounds = [...new Set([...groundsUnder(from, slots, seen), ...groundsUnder(to, slots, seen), ...under.map((k) => slots[k]).filter(hex)])];
  const split = [from.split?.ink, to.split?.ink].flatMap((k) => (k && hex(slots[k as keyof Slots]) ? [slots[k as keyof Slots]] : []));
  const inks = [...ABSORB_BLENDS.map((k) => blend(body, ink, k)), ...split];
  for (const g of grounds) for (const c of inks) if (contrast(c, g) < READ_MIN) return { ok: false, why: `${kind}: ink ${c} reads ${contrast(c, g).toFixed(2)}:1 on ${g} (< ${READ_MIN})` };
  return { ok: true, ink };
}
