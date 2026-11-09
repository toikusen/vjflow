// Q5 phase 2: the mini moments the song's scheduler approved (mini-moments.ts), drawn over the engine's frame in their own
// region and never over a line's words (Codex §5–6: the normal lyric renderer keeps every line; the region is 15–30 % of the
// frame; the main action 0.35–0.6 s, then exit and restore inside the approved window). Three families, each carrying only
// the forms it can honestly draw (moment-caps-draft.ts MINI_FORMS). This overlay draws `page`: it acts on the page round the
// line (a tear opens and closes, one wipe of paper passes, a second impression slips off register), never with words of its
// own. A `type-only` mini moves the line's own sung words in their seat (render/world-layout.ts, line moment): no copies
// of a word are painted in free space (critic 2026-11-10). Inks are read off the frame under the region (signature.ts inkFor).
import type { RenderJob } from './engine';
import type { MiniMoment } from '../mini-moments';
import { canvas, groundUnder, inkFor, inksAt, mixHex, type Inks } from './signature';

const W = 1920;
const H = 1080;

/** The minis this overlay draws: page ones (a type-only mini moves the line's own words, render/world-layout.ts). */
export const miniMomentsOf = (job: RenderJob): MiniMoment[] => ((job.treatment as { miniMoments?: MiniMoment[] }).miniMoments ?? []).filter((m) => m.family !== 'type-only');

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
const hash = (i: number, s: number) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

/** Where a mini stands at t: its preparation (0–1), its main action (0–1) and how much is left after its restore (1–0). */
export function phaseOf(m: Pick<MiniMoment, 'prepareAt' | 'at' | 'mainSec' | 'to'>, t: number): { on: boolean; prep: number; main: number; left: number } {
  const on = t >= m.prepareAt && t < m.to;
  const prep = clamp((t - m.prepareAt) / Math.max(0.05, m.at - m.prepareAt));
  const main = clamp((t - m.at) / Math.max(0.05, m.mainSec));
  const end = m.at + m.mainSec;
  const left = t < end ? 1 : 1 - clamp((t - end) / Math.max(0.05, m.to - end));
  return { on, prep, main, left };
}

export interface MiniLayer { compose(stage: HTMLCanvasElement, t: number): HTMLCanvasElement; metrics(): Record<string, unknown>[] }

/** Returns the layer that draws every approved mini over the frame. */
export async function miniMomentLayer(job: RenderJob): Promise<MiniLayer> {
  const minis = miniMomentsOf(job);
  const out = canvas(W, H);
  const o = out.getContext('2d')!;
  // (each mini is drawn on a layer of its own, then every line's box is erased from it: their union, however they overlap)
  const layer = canvas(W, H);
  const x = layer.getContext('2d')!;
  const drawn = new Map<string, { frames: number; region: number }>();

  /** The mini's layer kept to its region, then cleared of the union of every line's box: nothing in it crosses a word being read. */
  const clipOf = (m: MiniMoment) => {
    const r = m.region;
    x.beginPath();
    x.rect(r.x0 * W, r.y0 * H, (r.x1 - r.x0) * W, (r.y1 - r.y0) * H);
    x.clip();
  };
  const eraseLines = (m: MiniMoment) => {
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = '#000';
    for (const a of m.avoid) x.fillRect(a.x0 * W, a.y0 * H, (a.x1 - a.x0) * W, (a.y1 - a.y0) * H);
    x.globalCompositeOperation = 'source-over';
  };
  /** The free band of the region furthest from the lines: above or below them, whichever has more room. */
  const bandOf = (m: MiniMoment): [number, number, number, number] => {
    const r = { x0: m.region.x0 * W, y0: m.region.y0 * H, x1: m.region.x1 * W, y1: m.region.y1 * H };
    const top = Math.min(r.y1, ...m.avoid.filter((a) => a.x1 * W > r.x0 && a.x0 * W < r.x1).map((a) => a.y0 * H));
    const bottom = Math.max(r.y0, ...m.avoid.filter((a) => a.x1 * W > r.x0 && a.x0 * W < r.x1).map((a) => a.y1 * H));
    const [above, below] = [Math.max(0, top - r.y0), Math.max(0, r.y1 - bottom)];
    return above >= below ? [r.x0, r.y0, r.x1, Math.max(r.y0 + 1, top)] : [r.x0, Math.min(r.y1 - 1, bottom), r.x1, r.y1];
  };
  const draw = (m: MiniMoment, t: number, inks: Inks) => {
    const ph = phaseOf(m, t);
    const [bx0, by0, bx1, by1] = bandOf(m);
    const [bw, bh] = [bx1 - bx0, by1 - by0];
    const key = `${m.form}/${m.variant}`;
    // page
    if (key === 'strike/tear' || key === 'strike/slice' || key === 'strike/burn') {
      // a tear runs across the band and opens a gap of the page under it, then lies flat again
      const open = 10 * ease(ph.main) * ph.left;
      const run = ease(ph.prep * 0.4 + ph.main);
      const cy = (by0 + by1) / 2;
      const pts = Array.from({ length: 24 }, (_, i) => [bx0 + (i / 23) * bw * run, cy + (hash(i, 5) - 0.5) * Math.min(bh * 0.5, 40)] as [number, number]);
      x.beginPath();
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py - open / 2) : x.moveTo(px, py - open / 2)));
      [...pts].reverse().forEach(([px, py]) => x.lineTo(px, py + open / 2));
      x.closePath();
      x.fillStyle = mixHex(inks.ink, inks.paper, 0.15);
      x.globalAlpha = ph.left;
      x.fill();
      x.lineWidth = 2;
      x.strokeStyle = mixHex(inks.paper, '#ffffff', 0.5);
      x.stroke();
      x.globalAlpha = 1;
    } else if (key === 'strike/wipe') {
      // one wipe of paper passes through the band, its leading edge inked
      const w = bw * ease(ph.main);
      x.globalAlpha = ph.left;
      x.fillStyle = inks.paper;
      x.fillRect(bx0, by0, w, bh);
      x.fillStyle = inks.ink;
      x.fillRect(bx0 + w - 4, by0, 4, bh);
      x.globalAlpha = 1;
    } else {
      // echo / ghost, freeze / stop: the page's second impression slips off register and back
      const off = 14 * ease(ph.main) * ph.left;
      x.globalAlpha = 0.55 * ph.left;
      x.lineWidth = 3;
      x.strokeStyle = inks.press;
      x.strokeRect(bx0 + 6 + off, by0 + 6 + off, bw - 12, bh - 12);
      x.globalAlpha = 1;
    }
  };

  return {
    compose(stage, t) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.drawImage(stage, 0, 0, W, H);
      for (const m of minis) {
        if (!phaseOf(m, t).on) continue;
        const r = m.region;
        const inks = inkFor(inksAt(job, t), groundUnder(o, Math.floor(r.x0 * W), Math.floor(r.y0 * H), Math.ceil(r.x1 * W), Math.ceil(r.y1 * H)));
        x.clearRect(0, 0, W, H);
        x.save();
        clipOf(m);
        draw(m, t, inks);
        x.restore();
        eraseLines(m);
        o.drawImage(layer, 0, 0);
        const d = drawn.get(m.id) ?? { frames: 0, region: (r.x1 - r.x0) * (r.y1 - r.y0) };
        d.frames += 1;
        drawn.set(m.id, d);
      }
      return out;
    },
    metrics: () => minis.map((m) => ({ id: m.id, meaningRef: m.meaningRef, evidenceCueId: m.evidenceCueId, word: m.word, family: m.family, at: m.at, frames: drawn.get(m.id)?.frames ?? 0, regionShare: +((m.region.x1 - m.region.x0) * (m.region.y1 - m.region.y0)).toFixed(3) })),
  };
}

