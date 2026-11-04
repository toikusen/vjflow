// What a character is made of in the hand-made worlds. As in world-glyph.ts the stroke stays where the face drew it: nothing
// here thickens a stroke past its neighbour or closes a counter; it only decides what fills it and what lies round it.
export type HandSurface = 'keyblock' | 'cut-hole' | 'silhouette' | 'foil' | 'carved' | 'chalk' | 'resist' | 'wax';
const KINDS = new Set<string>(['keyblock', 'cut-hole', 'silhouette', 'foil', 'carved', 'chalk', 'resist', 'wax']);
export const isHandSurface = (k: string): k is HandSurface => KINDS.has(k);
export interface HandCtx { mask: OffscreenCanvas; tone: OffscreenCanvas; tinted: (m: OffscreenCanvas, tint: string) => OffscreenCanvas; tint: string; core: string; px: number; seed: number; cw: number; ch: number }

const fract = (x: number) => x - Math.floor(x);
const hash = (a: number, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
const copy = (m: OffscreenCanvas) => { const t = new OffscreenCanvas(m.width, m.height); t.getContext('2d')!.drawImage(m, 0, 0); return t; };
/** Takes specks out of a picture: paper showing through where the block or the stick never touched. */
function speck(t: OffscreenCanvas, n: number, r0: number, r1: number, a: number, seed: number) {
  const g = t.getContext('2d')!;
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = a;
  for (let i = 0; i < n; i++) { g.beginPath(); g.ellipse(hash(i, seed) * t.width, hash(i, seed + 1) * t.height, r0 + (r1 - r0) * hash(i, seed + 2), (r0 + (r1 - r0) * hash(i, seed + 3)) * 0.6, hash(i, seed + 4) * 3.14, 0, 6.3); g.fill(); }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

export function handSurface(ctx: CanvasRenderingContext2D, kind: HandSurface, h: HandCtx) {
  const { mask, tone, tinted, core, px, seed, cw, ch } = h;
  switch (kind) {
    case 'keyblock': {
      // the plate under the key block, a hair off register, then the key block with the baren's pale specks
      ctx.drawImage(tinted(mask, core), px * 0.012, px * 0.01);
      const t = copy(tone);
      speck(t, 70, px * 0.002, px * 0.008, 0.5, seed);
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'cut-hole': {
      // a hole in a thick sheet: the far side's colour, the sheet's own edge shadowing its upper left
      ctx.drawImage(tone, 0, 0);
      const d = Math.max(2, px * 0.016);
      const edge = tinted(mask, core);
      const g = edge.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(mask, d, d * 1.2);
      ctx.globalAlpha = 0.86;
      ctx.drawImage(edge, 0, 0);
      ctx.globalAlpha = 1;
      break;
    }
    case 'silhouette': {
      // a dark shape between two lit layers: light wraps round it, the shape itself stays solid
      ctx.filter = `blur(${px * 0.05}px)`;
      ctx.globalAlpha = 0.8;
      ctx.drawImage(tinted(mask, core), 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'foil': {
      // block printed in one flat ink, a pressed shadow on the paper below it
      ctx.drawImage(tinted(mask, core), px * 0.01, px * 0.012);
      ctx.drawImage(tone, 0, 0);
      break;
    }
    case 'carved': {
      // what the knife left: nicks along the edge and the ridges of the gouge running through the cleared stroke
      const t = copy(tone);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) {
        const [x, y, a, l] = [hash(i, seed) * cw, hash(i, seed + 1) * ch, -0.5 + 0.5 * hash(i, seed + 2), px * (0.02 + 0.06 * hash(i, seed + 3))];
        const w = px * (0.004 + 0.006 * hash(i, seed + 4));
        g.beginPath();
        g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
        g.lineTo(x - Math.sin(a) * w, y + Math.cos(a) * w);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.lineTo(x + Math.sin(a) * w, y - Math.cos(a) * w);
        g.closePath();
        g.globalAlpha = 0.85;
        g.fill();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'chalk': {
      // powder held on the slate's tooth (the round-2 board): the stroke a hair heavier than the face (well under the Han
      // cap), then pitted where the stick skipped the board and broken by its grain: crisp holes, never a blur round it
      const d = Math.max(1, px * 0.006);
      const t = new OffscreenCanvas(tone.width, tone.height);
      const g = t.getContext('2d')!;
      g.drawImage(tone, 0, 0);
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) g.drawImage(tone, dx, dy);
      speck(t, 1400, px * 0.003, px * 0.008, 1, seed);
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = 'rgba(0,0,0,1)';
      for (let i = 0; i < 26; i++) { g.globalAlpha = 0.24; g.lineWidth = px * (0.004 + 0.008 * hash(i, seed + 7)); const y = hash(i, seed + 8) * ch; g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y - cw * 0.3); g.stroke(); }
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'resist': {
      // bare cloth the dye never reached: it creeps in at the edge along the threads, so the edge is soft and a little hairy
      ctx.filter = `blur(${px * 0.012}px)`;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(tone, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      const t = copy(tone);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.globalAlpha = 0.07;
      for (let y = 0; y < ch; y += Math.max(2, px * 0.012)) g.fillRect(0, y, cw, Math.max(1, px * 0.004));
      for (let x = 0; x < cw; x += Math.max(2, px * 0.012)) g.fillRect(x, 0, Math.max(1, px * 0.004), ch);
      ctx.drawImage(t, 0, 0);
      break;
    }
    case 'wax': {
      // a wax stick pressed hard: heavy, hatched by the hand's back-and-forth, the paper's tooth in it
      const t = copy(tone);
      const g = t.getContext('2d')!;
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = 'rgba(0,0,0,1)';
      const pitch = Math.max(3, px * 0.026);
      for (let x = -ch; x < cw; x += pitch) { g.globalAlpha = 0.28; g.lineWidth = pitch * 0.34; g.beginPath(); g.moveTo(x + hash(x, seed) * pitch, 0); g.lineTo(x + ch * 0.46 + hash(x, seed + 1) * pitch, ch); g.stroke(); }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      speck(t, 600, px * 0.002, px * 0.007, 0.8, seed);
      ctx.drawImage(t, 0, 0);
      break;
    }
  }
}
