// What a character is made of in a style world, applied to its picture once (glyphs.ts caches the result). The stroke stays
// exactly where the face drew it: these only change what fills it and what lies round it, so a counter stays open and a thin
// stroke stays whole. Colours arrive from the world's slots in the surface string.

export type SurfaceKind = 'bitmap' | 'tube' | 'phosphor' | 'lamp' | 'brush' | 'silver' | 'lead' | 'gilt' | 'tape' | HandSurface;

export interface Surface { kind: SurfaceKind; tint: string; core: string; eaten: boolean }
export const surfaceKey = (s: Surface) => `${s.kind}|${s.tint}|${s.core}|${s.eaten ? 1 : 0}`;
export const parseSurface = (k: string): Surface => { const [kind, tint, core, eaten] = k.split('|'); return { kind: kind as SurfaceKind, tint, core, eaten: eaten === '1' }; };

import { handSurface, HandSurface, isHandSurface } from './world-glyph-hand';

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const charSeed = (c: string) => (c.codePointAt(0) ?? 1) % 997;

/** The glyph's alpha as it stands, on a canvas of its own. */
function maskOf(canvas: HTMLCanvasElement) {
  const m = new OffscreenCanvas(canvas.width, canvas.height);
  m.getContext('2d')!.drawImage(canvas, 0, 0);
  return m;
}

function tinted(m: OffscreenCanvas, tint: string) {
  const t = new OffscreenCanvas(m.width, m.height);
  const g = t.getContext('2d')!;
  g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = tint;
  g.fillRect(0, 0, t.width, t.height);
  return t;
}

/** Pulls in a character's edge by a blur and a threshold: only what lies deep inside a stroke is left. */
function inner(m: OffscreenCanvas, px: number, cut = 150) {
  const t = new OffscreenCanvas(m.width, m.height);
  const g = t.getContext('2d')!;
  g.filter = `blur(${px}px)`;
  g.drawImage(m, 0, 0);
  g.filter = 'none';
  const img = g.getImageData(0, 0, t.width, t.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.max(0, Math.min(255, (img.data[i] - cut) * 5));
  g.putImageData(img, 0, 0);
  return t;
}

/** Scanning dropouts and missing patches: what static takes out of a character. Under a fifth of its ink, never a whole stroke. */
function eat(g: CanvasRenderingContext2D, w: number, h: number, size: number, seed: number) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  const band = Math.max(2, size * 0.022);
  const pitch = size * 0.15;
  for (let k = 0, y = hash(seed, 3) * pitch; y < h; k++, y += pitch * (0.6 + 0.8 * hash(k, seed))) g.fillRect(0, y, w, band * (0.6 + hash(k, seed + 1)));
  for (let i = 0; i < 26; i++) g.fillRect(hash(i, seed + 2) * w, hash(i, seed + 4) * h, size * (0.03 + 0.08 * hash(i, seed + 5)), band);
  g.restore();
}

/** Rewrites the white character on `canvas` (w × h design px, scale SS) as the surface. */
export function applySurface(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, key: string, char: string, size: number, ss: number) {
  const s = parseSurface(key);
  const seed = charSeed(char);
  const [cw, ch] = [canvas.width, canvas.height];
  const px = size * ss;
  const m = maskOf(canvas);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const tone = tinted(m, s.tint);
  if (isHandSurface(s.kind)) { handSurface(ctx, s.kind, { mask: m, tone, tinted, tint: s.tint, core: s.core, px, seed, cw, ch }); ctx.restore(); return; }
  switch (s.kind) {
    case 'tube': {
      // bent glass: light thrown on the wall, the coloured gas, the hot middle of the bore
      ctx.filter = `blur(${px * 0.13}px)`;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = `blur(${px * 0.045}px)`;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      ctx.drawImage(tinted(inner(m, px * 0.022, 120), s.core), 0, 0);
      break;
    }
    case 'phosphor': {
      ctx.filter = `blur(${px * 0.014}px)`;
      ctx.globalAlpha = 0.4;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      // the raster shows in the strokes; the gap is dim, not empty
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.2;
      for (let y = 0; y < ch; y += 4 * ss) ctx.fillRect(0, y, cw, 1.2 * ss);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'bitmap': {
      // the face as a screen font would draw it at this size: hard pixels, no anti-aliasing, the stroke still where it was
      const cell = Math.max(3 * ss, Math.round((size / 17) * ss));
      const a2 = m.getContext('2d')!.getImageData(0, 0, cw, ch).data;
      ctx.fillStyle = s.tint;
      for (let y = 0; y < ch; y += cell) for (let x = 0; x < cw; x += cell) {
        let sum = 0;
        for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) sum += a2[(Math.min(ch - 1, Math.floor(y + ((v + 0.5) * cell) / 3)) * cw + Math.floor(x + ((u + 0.5) * cell) / 3)) * 4 + 3];
        if (sum / (9 * 255) > 0.3) ctx.fillRect(x, y, cell, cell);
      }
      break;
    }
    case 'lamp': {
      // lamps on a fixed pitch: each one lit by how much of the stroke falls on it
      const pitch = Math.max(5 * ss, size * 0.062 * ss);
      const g = m.getContext('2d')!;
      const a = g.getImageData(0, 0, cw, ch).data;
      ctx.fillStyle = s.tint;
      ctx.shadowColor = s.tint;
      ctx.shadowBlur = pitch * 0.9;
      for (let y = pitch / 2; y < ch; y += pitch)
        for (let x = pitch / 2; x < cw; x += pitch) {
          let sum = 0;
          for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) sum += a[(Math.floor(y + (v * pitch) / 3) * cw + Math.floor(x + (u * pitch) / 3)) * 4 + 3] ?? 0;
          const k = sum / (9 * 255);
          if (k < 0.3) continue;
          ctx.globalAlpha = 0.72 + 0.28 * k;
          ctx.beginPath();
          ctx.arc(x, y, pitch * 0.46, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      break;
    }
    case 'brush': {
      // ink wicks outwards along the paper, a little more at some places than others; the body dries unevenly
      ctx.filter = `blur(${px * 0.012}px)`;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 3; i++) ctx.drawImage(tone, (hash(i, seed) - 0.5) * px * 0.014, (hash(i, seed + 1) - 0.5) * px * 0.014);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      for (let i = 0; i < 26; i++) {
        ctx.globalAlpha = 0.05 + 0.12 * hash(i, seed + 2);
        ctx.lineWidth = px * (0.005 + 0.012 * hash(i, seed + 3));
        const y = hash(i, seed + 4) * ch;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cw, y + (hash(i, seed + 5) - 0.5) * ch * 0.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'silver': {
      // light through emulsion: it spreads a little past the edge and the silver is never quite even
      ctx.filter = `blur(${px * 0.03}px)`;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) {
        ctx.globalAlpha = 0.25;
        const r = px * (0.002 + 0.006 * hash(i, seed));
        ctx.beginPath();
        ctx.arc(hash(i, seed + 1) * cw, hash(i, seed + 2) * ch, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'lead': {
      // pale glass set in lead: the came round the outside of the stroke, the light running through the glass
      const came = tinted(m, s.core);
      const w = px * 0.03;
      for (const [dx, dy] of [[w, 0], [-w, 0], [0, w], [0, -w], [w * 0.7, w * 0.7], [-w * 0.7, w * 0.7], [w * 0.7, -w * 0.7], [-w * 0.7, -w * 0.7]]) ctx.drawImage(came, dx, dy);
      const face = new OffscreenCanvas(cw, ch);
      const fg = face.getContext('2d')!;
      fg.drawImage(tone, 0, 0);
      fg.globalCompositeOperation = 'source-atop';
      const g = fg.createLinearGradient(0, 0, cw, ch);
      g.addColorStop(0.2, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(0.9, 'rgba(0,0,0,0.2)');
      fg.fillStyle = g;
      fg.fillRect(0, 0, cw, ch);
      ctx.drawImage(face, 0, 0);
      break;
    }
    case 'gilt': {
      // leaf on a tooled ground: a dark pressed edge below, the metal, a thin catch of light along the upper edge
      ctx.drawImage(tinted(m, s.core), px * 0.012, px * 0.016);
      const metal = new OffscreenCanvas(cw, ch);
      const mg = metal.getContext('2d')!;
      mg.drawImage(tone, 0, 0);
      mg.globalCompositeOperation = 'source-atop';
      const g = mg.createLinearGradient(0, 0, cw * 0.4, ch);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, i % 2 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.26)');
      mg.fillStyle = g;
      mg.fillRect(0, 0, cw, ch);
      ctx.drawImage(metal, 0, 0);
      break;
    }
    case 'tape':
    default: {
      // thermal print: the head leaves each character a little uneven along its width
      ctx.drawImage(tone, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 0.18;
      for (let y = 0; y < ch; y += 5 * ss) ctx.fillRect(0, y, cw, 1 * ss);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (s.eaten) eat(ctx, cw, ch, px, seed);
  ctx.restore();
}
