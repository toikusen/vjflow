import { VJStyle } from './vj-style.interface';

export const EDM_STYLE: VJStyle = {
  id: 'edm',
  name: 'EDM 電音',
  tagline: '霓虹幾何、頻閃、夜店能量',
  cardBackground: 'radial-gradient(circle at 30% 30%, #ff00d4 0, transparent 45%), radial-gradient(circle at 75% 70%, #00e5ff 0, transparent 50%), #07010f',
  palettes: {
    low: [['#070012', '#3a0ca3', '#4cc9f0', '#7209b7'], ['#02030a', '#0b3d91', '#00f5d4', '#3a86ff']],
    mid: [['#05000d', '#ff00d4', '#00e5ff', '#7b2cff'], ['#030008', '#39ff14', '#00b3ff', '#ff2a6d']],
    high: [['#000000', '#ff006e', '#00f0ff', '#fffb00'], ['#050005', '#ff1f1f', '#ff00c8', '#ffffff']],
  },
  presets: [
    { id: 'tunnel', tiers: ['mid', 'high'] },
    { id: 'grid', tiers: ['low', 'mid'] },
    { id: 'bars', tiers: ['mid', 'high'] },
  ],
  transitions: [
    { type: 'flash', weight: 3 },
    { type: 'glitch', weight: 3 },
    { type: 'zoom', weight: 2 },
    { type: 'wipe', weight: 1 },
  ],
  impactTransition: 'flash',
  transitionDuration: 0.5,
  sceneLength: { min: 8, max: 20 },
  mapping: { attack: 0.03, decay: 0.18, beatDecay: 0.22, hitThreshold: 0.7 },
  typography: { fontFamily: '"Arial Black", "Helvetica Neue", "PingFang TC", sans-serif', fontWeight: '900', fontStyle: 'normal', letterSpacing: 8, uppercase: true },
  lyricPreset: 'kinetic',
};
