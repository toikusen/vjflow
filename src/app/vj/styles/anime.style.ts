import { VJStyle } from './vj-style.interface';

export const ANIME_STYLE: VJStyle = {
  id: 'anime',
  name: 'Anime 動漫',
  tagline: '速度線、網點、漫畫分格、衝擊畫格',
  cardBackground: 'repeating-conic-gradient(from 0deg at 50% 50%, #fff 0 4deg, transparent 4deg 12deg), linear-gradient(160deg, #ff3b3b, #ffb300 60%, #1a1a2e)',
  palettes: {
    low: [['#1d2b53', '#7e8ecf', '#ffffff', '#ff77a8'], ['#243b55', '#89a8d8', '#f5f5f5', '#ffcc00']],
    mid: [['#ff4d4d', '#ffb300', '#ffffff', '#111111'], ['#2d6cdf', '#6ee7ff', '#ffffff', '#111111']],
    high: [['#e8113b', '#ffd500', '#ffffff', '#000000'], ['#ff5e00', '#fff200', '#ffffff', '#000000']],
  },
  presets: [
    { id: 'speedlines', tiers: ['mid', 'high'] },
    { id: 'panels', tiers: ['low', 'mid'] },
    { id: 'burst', tiers: ['high'] },
  ],
  transitions: [
    { type: 'wipe', weight: 3 },
    { type: 'flash', weight: 2 },
    { type: 'zoom', weight: 2 },
    { type: 'glitch', weight: 1 },
    { type: 'fade', weight: 1 },
  ],
  impactTransition: 'flash',
  transitionDuration: 0.45,
  sceneLength: { min: 8, max: 18 },
  mapping: { attack: 0.03, decay: 0.2, beatDecay: 0.25, hitThreshold: 0.65 },
  typography: { fontFamily: 'Impact, "Arial Black", "PingFang TC", sans-serif', fontWeight: '900', fontStyle: 'italic', letterSpacing: 3, uppercase: true },
  lyricPreset: 'idol',
};
