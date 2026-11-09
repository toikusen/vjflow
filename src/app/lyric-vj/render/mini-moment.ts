// Q5 phase 2: the mini moments the song's scheduler approved (mini-moments.ts), drawn over the engine's frame in their own
// region and never over a line's words (Codex §5–6: the normal lyric renderer keeps every line; the region is 15–30 % of the
// frame; the main action 0.35–0.6 s, then exit and restore inside the approved window). Three families, each carrying only
// the forms it can honestly draw (moment-caps-draft.ts MINI_FORMS): `page` acts on the page round the line (a tear opens
// and closes, one wipe of paper passes, a second impression slips off register); `type-only` sets the evidence word once
// in one relation to the line (its characters falling or riding a wave, a ghost of it beside the line). Inks are read off
// the frame under the region (signature.ts inkFor), as a moment's text is.
import type { RenderJob } from './engine';
import type { MiniMoment } from '../mini-moments';
import { canvas, groundUnder, inkFor, inksAt, mixHex, type Inks } from './signature';

const W = 1920;
const H = 1080;

export const miniMomentsOf = (job: RenderJob): MiniMoment[] => (job.treatment as { miniMoments?: MiniMoment[] }).miniMoments ?? [];

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

/** Loads the face and returns the layer that draws every approved mini over the frame. */
export async function miniMomentLayer(job: RenderJob): Promise<MiniLayer> {
  const minis = miniMomentsOf(job);
  const family = job.fonts?.family ?? (job.treatment.design as { font?: string } | undefined)?.font ?? 'Chiron Hei HK';
  await document.fonts.load(`700 100px "${family}"`, minis.map((m) => m.word).join('') + '!?');
  const out = canvas(W, H);
  const x = out.getContext('2d')!;
  const drawn = new Map<string, { frames: number; region: number }>();

  /** The region with every line's box cut out: nothing drawn here can cross a word being read. */
  const clipOf = (m: MiniMoment) => {
    const r = m.region;
    x.beginPath();
    x.rect(r.x0 * W, r.y0 * H, (r.x1 - r.x0) * W, (r.y1 - r.y0) * H);
    for (const a of m.avoid) x.rect(a.x0 * W, a.y0 * H, (a.x1 - a.x0) * W, (a.y1 - a.y0) * H);
    x.clip('evenodd');
  };
  /** The free band of the region furthest from the lines: above or below them, whichever has more room. */
  const bandOf = (m: MiniMoment): [number, number, number, number] => {
    const r = { x0: m.region.x0 * W, y0: m.region.y0 * H, x1: m.region.x1 * W, y1: m.region.y1 * H };
    const top = Math.min(r.y1, ...m.avoid.filter((a) => a.x1 * W > r.x0 && a.x0 * W < r.x1).map((a) => a.y0 * H));
    const bottom = Math.max(r.y0, ...m.avoid.filter((a) => a.x1 * W > r.x0 && a.x0 * W < r.x1).map((a) => a.y1 * H));
    const [above, below] = [Math.max(0, top - r.y0), Math.max(0, r.y1 - bottom)];
    return above >= below ? [r.x0, r.y0, r.x1, Math.max(r.y0 + 1, top)] : [r.x0, Math.min(r.y1 - 1, bottom), r.x1, r.y1];
  };
  const text = (s: string, cx: number, cy: number, size: number, fill: string, a: number, stroke = false) => {
    x.globalAlpha = a;
    x.font = `700 ${size}px "${family}"`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (stroke) { x.lineWidth = Math.max(2, size * 0.06); x.strokeStyle = fill; x.strokeText(s, cx, cy); }
    else { x.fillStyle = fill; x.fillText(s, cx, cy); }
    x.globalAlpha = 1;
  };

  const draw = (m: MiniMoment, t: number, inks: Inks) => {
    const ph = phaseOf(m, t);
    const [bx0, by0, bx1, by1] = bandOf(m);
    const [bw, bh] = [bx1 - bx0, by1 - by0];
    const chars = [...m.word].filter((c) => c.trim());
    const key = `${m.form}/${m.variant}`;
    if (m.family === 'type-only') {
      const size = Math.max(28, Math.min(bh * 0.42, 96));
      if (key === 'shape/fall' || key === 'shape/rise') {
        // the word's characters fall (rise) through the band once, a few copies spread across it
        const n = Math.max(4, Math.min(9, Math.round(bw / (size * 1.6))));
        for (let i = 0; i < n; i++) {
          const lag = hash(i, 3) * 0.35;
          const q = t >= m.at ? clamp(ph.main * 1.35 - lag) : 0;
          const travel = (t - m.at) / Math.max(0.2, m.to - m.at);
          const y = key === 'shape/fall' ? by0 + size / 2 + travel * (bh - size) : by1 - size / 2 - travel * (bh - size);
          const cx = bx0 + ((i + 0.5) / n) * bw + Math.sin(travel * 6 + i) * size * 0.2;
          if (q > 0) text(chars[i % chars.length], cx, y, size * (0.6 + 0.4 * hash(i, 9)), inks.ink, Math.min(q * 2, 1) * ph.left * 0.9);
        }
      } else if (key === 'shape/wave') {
        // the word laid along one wave that runs through the band
        const n = Math.max(chars.length * 2, Math.min(14, Math.round(bw / (size * 1.1))));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const shown = clamp(ph.main * 1.6 - u);
          const cy = (by0 + by1) / 2 + Math.sin(u * Math.PI * 2 + (t - m.at) * 5) * Math.max(0, bh / 2 - size / 2) * 0.8;
          if (shown > 0) text(chars[i % chars.length], bx0 + u * bw, cy, size * 0.8, inks.ink, shown * ph.left);
        }
      } else {
        // echo / ghost (and freeze / stop): the word once beside the line, an open copy that slips off as it is sung
        const off = 10 * ease(ph.main);
        text(m.word, (bx0 + bx1) / 2 + off, (by0 + by1) / 2 + off, Math.min(size * 1.3, bw / Math.max(1, chars.length) * 0.9), inks.ghost, 0.85 * ph.left * ease(ph.main * 2), true);
        text(m.word, (bx0 + bx1) / 2, (by0 + by1) / 2, Math.min(size * 1.3, bw / Math.max(1, chars.length) * 0.9), inks.ink, ph.left * ease(ph.main * 2));
      }
      return;
    }
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
      text(m.word, (bx0 + bx1) / 2 + off, (by0 + by1) / 2 + off, Math.max(28, Math.min(bh * 0.4, 84)), inks.press, 0.7 * ph.left * ease(ph.main * 2));
    }
  };

  return {
    compose(stage, t) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(stage, 0, 0, W, H);
      for (const m of minis) {
        if (!phaseOf(m, t).on) continue;
        const r = m.region;
        const inks = inkFor(inksAt(job, t), groundUnder(x, Math.floor(r.x0 * W), Math.floor(r.y0 * H), Math.ceil(r.x1 * W), Math.ceil(r.y1 * H)));
        x.save();
        clipOf(m);
        draw(m, t, inks);
        x.restore();
        const d = drawn.get(m.id) ?? { frames: 0, region: (r.x1 - r.x0) * (r.y1 - r.y0) };
        d.frames += 1;
        drawn.set(m.id, d);
      }
      return out;
    },
    metrics: () => minis.map((m) => ({ id: m.id, meaningRef: m.meaningRef, evidenceCueId: m.evidenceCueId, word: m.word, family: m.family, at: m.at, frames: drawn.get(m.id)?.frames ?? 0, regionShare: +((m.region.x1 - m.region.x0) * (m.region.y1 - m.region.y0)).toFixed(3) })),
  };
}

