import { VJStyle } from './vj-style.interface';

export const CUTE_STYLE: VJStyle = {
  id: 'cute',
  name: 'Cute 可愛',
  tagline: '粉彩愛心、星星與泡泡閃光',
  cardBackground: 'radial-gradient(circle at 70% 30%, #fff 0, transparent 25%), linear-gradient(135deg, #ffb3d9, #c9b6ff 55%, #a6e3ff)',
  palettes: {
    low: [['#ffe4f1', '#c9b6ff', '#ffffff', '#ff9ecb'], ['#e7f6ff', '#b8e0ff', '#ffd6ec', '#ffffff']],
    mid: [['#ffc6e3', '#ff7eb9', '#fff58a', '#ffffff'], ['#d9c8ff', '#ff9ad5', '#9ef0ff', '#ffffff']],
    high: [['#ff9fd0', '#ff3d9a', '#fff176', '#ffffff'], ['#b89cff', '#ff5fb7', '#6ef3ff', '#fffbe0']],
  },
  presets: [
    { id: 'hearts', tiers: ['mid', 'high'] },
    { id: 'bubbles', tiers: ['low', 'mid'] },
    { id: 'starfield', tiers: ['mid', 'high'] },
  ],
  transitions: [
    { type: 'fade', weight: 3 },
    { type: 'zoom', weight: 3 },
    { type: 'wipe', weight: 2 },
    { type: 'flash', weight: 1 },
  ],
  impactTransition: 'zoom',
  transitionDuration: 0.8,
  sceneLength: { min: 10, max: 22 },
  mapping: { attack: 0.05, decay: 0.25, beatDecay: 0.3, hitThreshold: 0.55 },
  typography: { fontFamily: '"Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", "Yuanti TC", "PingFang TC", sans-serif', fontWeight: 'bold', fontStyle: 'normal', letterSpacing: 2, uppercase: false },
  lyricPreset: 'idol',
};
