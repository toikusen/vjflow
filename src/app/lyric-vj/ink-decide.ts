// M3, analytic first (docs/research/2026-11-13-ink-table-gate-design.md §2): a flat ink and a flat ground carried through
// the final pass as intervals (finalBounds), the least contrast two intervals can show (minContrast), and the ink a part
// of a line takes so that it reads on every ground it stands on through every final effect it meets (decideInk): its own
// ink, else its own hue moved a little, else the world's ink that reads best, chosen at INK_AIM and judged at INK_MIN.
// Pure and DOM-free: the plan and the renderer call it on the same inputs and get the same answer.
import { INK_AIM, INK_MIN, lumOf } from './measured-ink';
import { inkDistance, readableHue } from './render/key-ink';
import { contrast } from './contrast';

/**
 * The final pass's effects a line meets over its time on screen, as ranges (FINAL_SHADER): exposure flicker ± share,
 * the deepest vignette factor taken off at the line's reach (0..1), film grain's full amplitude (uGrain; ± half of it),
 * and the ink halo (grain and the other noise are off round a reading glyph: then grain does not reach the ink's own
 * rim, ruling 2026-11-13 §2).
 */
export interface FxBox {
  flicker: number; vignette: number; grain: number; halo: boolean;
  /** The paper texture's strength (uPaper): fibres darken a pixel by up to PAPER_DEPTH × it, pixel by pixel. */ paper?: number;
  /** A glowing material's own light on the ground round the face, as a share of the way from the ground to the ink (linear luminance): a tube's. */ glow?: number;
}
export const FX_NONE: FxBox = { flicker: 0, vignette: 0, grain: 0, halo: false };
/** How far the final pass's paper texture darkens a pixel at most, per unit of uPaper (FINAL_SHADER: 0.07 fibre + 0.05 blot). */
export const PAPER_DEPTH = 0.12;

const ch = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * A flat colour's WCAG luminance range on the final composite (FINAL_SHADER order, display values 0..1 per channel):
 * the vignette multiplies, grain adds ± half its amplitude (none within the halo when `rim`: the ground right round a
 * glyph, or the glyph's own ink), flicker multiplies; every channel clamped, its two ends taken.
 */
export function finalBounds(hex: string, fx: FxBox, rim = false): [number, number] {
  const g = fx.halo && rim ? 0 : fx.grain / 2;
  const lo = ch(hex).map((c) => clamp((c * (1 - fx.vignette) - g) * (1 - fx.flicker)));
  const hi = ch(hex).map((c) => clamp((c + g) * (1 + fx.flicker)));
  const lum = (v: number[]) => lumOf(...(v.map((x) => Math.round(x * 255)) as [number, number, number]));
  return [lum(lo), lum(hi)];
}

/** The least contrast an ink in [i0, i1] can show on a ground in [g0, g1] (overlapping ranges can meet: 1). */
export const minContrast = ([i0, i1]: [number, number], [g0, g1]: [number, number]) => (i0 > g1 ? (i0 + 0.05) / (g1 + 0.05) : g0 > i1 ? (g0 + 0.05) / (i1 + 0.05) : 1);

/**
 * The final effects a world's lines meet, from its frame stack alone (the same numbers the plan and the renderer have):
 * its flicker, the deepest vignette at a line's reach (d² ≤ 0.15 in the safe area) and, with no halo, its raster; the
 * design grain (free-plan sets it from the stack). `halo`: the ink halo is on (every job, INK_HALO).
 */
export function fxOfFrame(frame: { flicker: number; vignette: number; scan: number; grain: number; paper?: number }, halo = true): FxBox {
  // (the vignette's base is the frame's where a job carries it, else the engine's own 0.55: the deeper of the two, so a
  // decision holds on either; a free job carries none, 2026-11-15)
  const vig = 1.6 * 0.15 * Math.max(frame.vignette, VIG_BASE);
  return { flicker: frame.flicker, grain: 0.02 + 0.1 * frame.grain, vignette: 1 - (1 - vig) * (1 - (halo ? 0 : frame.scan)), halo, ...(frame.paper ? { paper: frame.paper } : {}) };
}

/** The final pass's vignette base when a job's design names no world frame (engine: uVigBase). */
export const VIG_BASE = 0.55;

/** What decideInk chose: the ink, where it came from, and the least it reads on every ground through every effect. */
export interface InkDecision { ink: string; from: 'own' | 'moved' | 'world' | 'none'; min: number }

/** How far (OKLab) an ink's own hue may be moved before the world's own ink is taken instead (measured-ink HUE_MOVE). */
const MOVE = 0.12;

/**
 * The ink a part of a line takes on `grounds` through `fx` (ruling: phrase-level and stable: one ink for the whole part,
 * never chased frame by frame; its own first, then a small lightness move, then the world's inks). The pick aims at
 * INK_AIM; `from: 'none'` when nothing reaches INK_MIN (the caller keeps `own` and the gate reports the line).
 */
export function decideInk(own: string, grounds: string[], fx: FxBox, world: string[] = [], drawn: (ink: string) => string[] = (x) => [x]): InkDecision {
  const gs = grounds.filter((g) => /^#[0-9a-f]{6}$/i.test(g));
  // (`drawn`: an ink as its surface draws it at its darkest and lightest parts, ink-tones: judged as it is drawn)
  const least = (ink: string) => Math.min(Infinity, ...gs.map((g) => pairLeast(ink, g, fx, drawn)));
  const at = least(own);
  if (!gs.length || at >= INK_AIM) return { ink: own, from: 'own', min: at };
  // (its own hue, lightness moved against the ground it reads worst on, a step at a time)
  let c = own;
  for (let k = 0; k < 6 && least(c) < INK_AIM; k++) {
    const worst = [...gs].sort((a, b) => pairLeast(c, a, fx, drawn) - pairLeast(c, b, fx, drawn))[0];
    // (the flat contrast to aim at: what this ink reads flat, raised by the share the effects and its surface take off it
    // as drawn, plus a step: a flat contrast already over the aim is no reason to stop, embroidery's satin highlights)
    // (and never short of the step it took before (INK_AIM raised 8 % a step): a glowing tube's ink must clear the light
    // its own glow lays round it, which no bound here models; the smaller step left neon-stage's pink at 5.1 analytic,
    // 3.9 as drawn, 2026-11-16)
    // (the drawn reading's own aim only where the ink's material shades it (a satin, a gilt: `drawn` differs from the ink);
    // elsewhere the flat step: a minimal move to an analytic 5:1 put brutalist's red key and neon-stage's pink where the
    // drawn page reads 3.9, where the flat step had kept the world's cream, 2026-11-16)
    const shaded = drawn(c).some((x) => x.toLowerCase() !== c.toLowerCase());
    const aim = Math.min(21, Math.max(INK_AIM * (1 + 0.08 * (k + 1)), shaded ? contrast(c, worst) * (INK_AIM / Math.max(1, pairLeast(c, worst, fx, drawn))) * (1 + 0.04 * (k + 1)) : 0));
    const m = readableHue(c, worst, aim);
    if (!m || m === c) break;
    c = m;
  }
  const near = inkDistance(own, c) <= MOVE;
  if (least(c) >= INK_AIM && near) return { ink: c, from: 'moved', min: least(c) };
  const best = [...new Set(world.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map((x) => x.toLowerCase()))].sort((a, b) => least(b) - least(a))[0];
  if (best && least(best) >= INK_AIM) return { ink: best, from: 'world', min: least(best) };
  // (nothing reaches the aim: the best that reads at all, its own first, then its own hue moved, then the world's; never
  // its own kept where a short move reads better: the default's wider effects left c059's amber at 4.1 where a move
  // read, 2026-11-15)
  if (at >= INK_MIN) return { ink: own, from: 'own', min: at };
  // (and its own hue taken to the end of its lightness, black or white, where that is a short move: a near-black ink one
  // step from black on a mid ground, spy's red plate, 2026-11-16)
  const toward = (pole: string) => { let best = own; for (let k = 0.05; k <= 1.0001; k += 0.05) { const m = `#${[1, 3, 5].map((i) => Math.round(parseInt(own.slice(i, i + 2), 16) * (1 - k) + parseInt(pole.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`; if (inkDistance(own, m) > MOVE) break; best = m; } return best; };
  const poles = [toward('#000000'), toward('#ffffff')].filter((x) => x !== own && x !== c);
  const tries: InkDecision[] = [...(near && c !== own ? [{ ink: c, from: 'moved' as const, min: least(c) }] : []), ...poles.map((x) => ({ ink: x, from: 'moved' as const, min: least(x) })), ...(best ? [{ ink: best, from: 'world' as const, min: least(best) }] : [])];
  // (the pole only where nothing else reads: a red key run to the end of its lightness at 4.6 analytic took the place of
  // the world's cream that read, brutalist c001, 2026-11-16)
  const reads = (xs: InkDecision[]) => xs.filter((x) => x.min >= INK_MIN).sort((x, y) => (x.from === 'moved' ? 0 : 1) - (y.from === 'moved' ? 0 : 1))[0];
  const read = reads(tries.filter((x) => !poles.includes(x.ink))) ?? reads(tries);
  if (read) return read;
  const better = tries.sort((x, y) => y.min - x.min)[0];
  return better && better.min > at ? { ...better, from: 'none' as const } : { ink: own, from: 'none', min: at };
}
/** The least an ink reads on every ground through every effect (decideInk's measure). */
export const leastThrough = (ink: string, grounds: string[], fx: FxBox, drawn: (ink: string) => string[] = (x) => [x]) => Math.min(Infinity, ...grounds.filter((g) => /^#[0-9a-f]{6}$/i.test(g)).map((g) => pairLeast(ink, g, fx, drawn)));
/**
 * The least an ink reads on a ground it stands right by, through the final pass: the vignette and the flicker are one
 * factor over both (the same pixel's neighbourhood: the glyph and the ground beside it within a few px), each end of
 * its range taken; grain adds apart to each, against the pair, except within the halo (none at a glyph's rim). The ink
 * is taken at itself and at each part its surface draws it in (`drawn`: its darkest and lightest). (Taking the two apart, as finalBounds' ranges do, read a
 * file's red key on its cream plate at 4.0 where every pixel reads 5.3: 2026-11-15.)
 */
export function pairLeast(ink: string, ground: string, fx: FxBox, drawn: (ink: string) => string[] = (x) => [x]): number {
  const g = fx.halo ? 0 : fx.grain / 2;
  const at = (c: string, k: number, d: number) => { const v = ch(c).map((x) => clamp(x * k + d)); return lumOf(...(v.map((x) => Math.round(x * 255)) as [number, number, number])); };
  // (the paper's fibres darken each pixel apart, not the pair together: the ink or the ground by up to PAPER_DEPTH × paper;
  // left out, a black ink on spy's red plate read 4.8 where the gate drew 4.3, 2026-11-16)
  const p = 1 - PAPER_DEPTH * (fx.paper ?? 0);
  let least = Infinity;
  for (const k of [(1 - fx.vignette) * (1 - fx.flicker), 1 + fx.flicker])
    for (const c of new Set([ink, ...drawn(ink)]))
      for (const d of g ? [-g, g] : [0])
        for (const [pi, pg] of p < 1 ? [[1, p], [p, 1]] : [[1, 1]]) {
          const li = at(c, k * pi, d);
          const lg0 = at(ground, k * pg, -d);
          // (the glow lays the ink's own light on the ground beside it: a lit wall)
          const lg = fx.glow && li > lg0 ? lg0 + fx.glow * (li - lg0) : lg0;
          least = Math.min(least, (Math.max(li, lg) + 0.05) / (Math.min(li, lg) + 0.05));
        }
  return least;
}
