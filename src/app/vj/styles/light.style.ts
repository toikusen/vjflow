import { VJStyle } from './vj-style.interface';

export const LIGHT_STYLE: VJStyle = {
  id: 'light',
  name: 'Light 光感',
  tagline: '夢幻光束、柔光與漂浮微塵',
  cardBackground: 'conic-gradient(from 200deg at 50% -10%, transparent 0 10deg, #fff8 14deg, transparent 20deg 30deg, #fff6 34deg, transparent 40deg), linear-gradient(180deg, #fbe7c6, #b4c5e4 70%, #8e9fcf)',
  palettes: {
    low: [['#1b2240', '#8ea6d8', '#fff4e0', '#c8b6ff'], ['#20304a', '#a8c7e6', '#fffaf0', '#f3d9b1']],
    mid: [['#3b4a7a', '#ffd9a0', '#ffffff', '#b5d3ff'], ['#40306a', '#ffc2d9', '#fff6e8', '#c7f0ff']],
    high: [['#5b6aa8', '#ffe3a3', '#ffffff', '#ffd1f0'], ['#6a4c93', '#ffe8b0', '#ffffff', '#a8e6ff']],
  },
  presets: [
    { id: 'rays', tiers: ['mid', 'high'] },
    { id: 'aurora', tiers: ['low', 'mid'] },
    { id: 'halo', tiers: ['low', 'high'] },
  ],
  transitions: [
    { type: 'fade', weight: 5 },
    { type: 'zoom', weight: 2 },
    { type: 'wipe', weight: 1 },
  ],
  impactTransition: 'fade',
  transitionDuration: 1.6,
  sceneLength: { min: 12, max: 26 },
  mapping: { attack: 0.12, decay: 0.5, beatDecay: 0.45, hitThreshold: 0.8 },
  typography: { fontFamily: 'Georgia, "Times New Roman", "Songti TC", serif', fontWeight: '300', fontStyle: 'italic', letterSpacing: 4, uppercase: false },
  lyricPreset: 'minimal',
};
