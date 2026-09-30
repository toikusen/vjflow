import { Texture } from 'pixi.js';

/** Procedural textures shared by all layers. Built once per renderer, never per frame. */
export interface VjTextures {
  glow: Texture;
  ring: Texture;
  sparkle: Texture;
  star: Texture;
  heart: Texture;
  bubble: Texture;
  dots: Texture;
  grain: Texture;
  vignette: Texture;
  fadeV: Texture;
  ray: Texture;
}

function draw(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  paint(g);
  return Texture.from(canvas);
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, points: number, outer: number, inner: number): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

export function createVjTextures(): VjTextures {
  return {
    glow: draw(128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }),
    ring: draw(256, 256, (g) => {
      const grad = g.createRadialGradient(128, 128, 90, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
    }),
    sparkle: draw(64, 64, (g) => {
      g.fillStyle = '#fff';
      g.shadowColor = '#fff';
      g.shadowBlur = 8;
      starPath(g, 32, 32, 4, 30, 5);
      g.fill();
    }),
    star: draw(128, 128, (g) => {
      g.fillStyle = '#fff';
      starPath(g, 64, 68, 5, 58, 25);
      g.fill();
    }),
    heart: draw(128, 128, (g) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(64, 116);
      g.bezierCurveTo(10, 78, 4, 44, 24, 24);
      g.bezierCurveTo(42, 8, 60, 16, 64, 36);
      g.bezierCurveTo(68, 16, 86, 8, 104, 24);
      g.bezierCurveTo(124, 44, 118, 78, 64, 116);
      g.fill();
    }),
    bubble: draw(128, 128, (g) => {
      const grad = g.createRadialGradient(64, 64, 40, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255,255,255,0.08)');
      grad.addColorStop(0.85, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0.9)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(64, 64, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(44, 40, 14, 8, -0.7, 0, Math.PI * 2);
      g.fill();
    }),
    dots: draw(48, 48, (g) => {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(12, 12, 7, 0, Math.PI * 2);
      g.arc(36, 36, 7, 0, Math.PI * 2);
      g.fill();
    }),
    grain: draw(256, 256, (g) => {
      const img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }),
    vignette: draw(480, 270, (g) => {
      const grad = g.createRadialGradient(240, 135, 60, 240, 135, 280);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
      grad.addColorStop(1, 'rgba(0,0,0,0.95)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 480, 270);
    }),
    fadeV: draw(4, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
    }),
    ray: draw(64, 512, (g) => {
      const h = g.createLinearGradient(0, 0, 64, 0);
      h.addColorStop(0, 'rgba(255,255,255,0)');
      h.addColorStop(0.5, 'rgba(255,255,255,1)');
      h.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = h;
      g.fillRect(0, 0, 64, 512);
      g.globalCompositeOperation = 'destination-in';
      const v = g.createLinearGradient(0, 0, 0, 512);
      v.addColorStop(0, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v;
      g.fillRect(0, 0, 64, 512);
    }),
  };
}

export function destroyVjTextures(t: VjTextures): void {
  Object.values(t).forEach((tex) => tex.destroy(true));
}
