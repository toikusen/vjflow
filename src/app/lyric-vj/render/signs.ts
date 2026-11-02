// The small signs, drawn in a 128 px square: nothing else here, so backdrops can print them too.
import type { SymbolName } from '../treatment';

export const SIGN_PATHS: Record<SymbolName, (c: CanvasRenderingContext2D) => void> = {
  heart: (c) => {
    c.beginPath();
    c.moveTo(64, 108);
    c.bezierCurveTo(10, 72, 14, 22, 44, 22);
    c.bezierCurveTo(56, 22, 62, 30, 64, 40);
    c.bezierCurveTo(66, 30, 72, 22, 84, 22);
    c.bezierCurveTo(114, 22, 118, 72, 64, 108);
    c.fill();
  },
  star: (c) => {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 22 : 54;
      c.lineTo(64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
    c.fill();
  },
  sparkle: (c) => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 ? 9 : 58;
      c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    c.fill();
  },
  note: (c) => {
    c.beginPath();
    c.ellipse(44, 96, 20, 14, -0.4, 0, Math.PI * 2);
    c.fill();
    c.fillRect(58, 22, 8, 74);
    c.beginPath();
    c.moveTo(66, 22);
    c.quadraticCurveTo(100, 34, 92, 64);
    c.quadraticCurveTo(92, 42, 66, 40);
    c.fill();
  },
  flame: (c) => {
    c.beginPath();
    c.moveTo(64, 10);
    c.bezierCurveTo(98, 46, 104, 72, 92, 96);
    c.bezierCurveTo(82, 116, 46, 118, 36, 96);
    c.bezierCurveTo(26, 72, 44, 60, 50, 40);
    c.bezierCurveTo(56, 56, 62, 60, 66, 62);
    c.bezierCurveTo(70, 44, 68, 26, 64, 10);
    c.fill();
  },
  drop: (c) => {
    c.beginPath();
    c.moveTo(64, 12);
    c.bezierCurveTo(78, 44, 98, 62, 98, 82);
    c.arc(64, 82, 34, 0, Math.PI);
    c.bezierCurveTo(30, 62, 50, 44, 64, 12);
    c.fill();
  },
  bolt: (c) => {
    c.beginPath();
    for (const [x, y] of [[76, 8], [34, 72], [60, 72], [48, 120], [96, 52], [70, 52], [84, 8]]) c.lineTo(x, y);
    c.fill();
  },
  exclaim: (c) => {
    c.beginPath();
    c.moveTo(52, 10);
    c.lineTo(78, 10);
    c.lineTo(70, 84);
    c.lineTo(58, 84);
    c.fill();
    c.beginPath();
    c.arc(64, 106, 11, 0, Math.PI * 2);
    c.fill();
  },
  question: (c) => {
    c.lineWidth = 16;
    c.lineCap = 'round';
    c.strokeStyle = '#fff';
    c.beginPath();
    c.arc(64, 46, 24, Math.PI * 1.05, Math.PI * 0.45);
    c.quadraticCurveTo(64, 70, 64, 80);
    c.stroke();
    c.beginPath();
    c.arc(64, 108, 10, 0, Math.PI * 2);
    c.fill();
  },
  swirl: (c) => {
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.strokeStyle = '#fff';
    c.beginPath();
    for (let a = 0; a < Math.PI * 4.2; a += 0.05) c.lineTo(64 + Math.cos(a) * a * 3.9, 64 + Math.sin(a) * a * 3.9);
    c.stroke();
  },
  flower: (c) => {
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      c.beginPath();
      c.ellipse(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28, 22, 16, a, 0, Math.PI * 2);
      c.fill();
    }
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(64, 64, 11, 0, Math.PI * 2);
    c.fill();
  },
};
