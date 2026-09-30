import { VJStyle } from './vj-style.interface';

export const CINEMATIC_STYLE: VJStyle = {
  id: 'cinematic',
  name: 'Cinematic 電影感',
  tagline: '底片顆粒、漏光、緩慢運鏡',
  cardBackground: 'linear-gradient(180deg, #000 0 14%, transparent 14% 86%, #000 86%), radial-gradient(ellipse at 70% 40%, #ff8a3d 0, transparent 45%), linear-gradient(180deg, #1a1410, #0b0b0f)',
  palettes: {
    low: [['#07080b', '#2b3a4a', '#d9c7a3', '#8a5a3c'], ['#060606', '#1f2a36', '#c9b79c', '#5c3d2e']],
    mid: [['#0a0908', '#ff8a3d', '#f2e6d0', '#3a5a78'], ['#08090d', '#e0703a', '#e8dcc6', '#2e4a62']],
    high: [['#0c0907', '#ff6a2b', '#fff1d8', '#c43d2b'], ['#0a0a0c', '#ffb057', '#ffffff', '#a23b2a']],
  },
  presets: [
    { id: 'drift', tiers: ['low', 'mid'] },
    { id: 'leak', tiers: ['mid', 'high'] },
    { id: 'anamorphic', tiers: ['mid', 'high'] },
  ],
  transitions: [
    { type: 'fade', weight: 6 },
    { type: 'wipe', weight: 1 },
    { type: 'zoom', weight: 1 },
  ],
  impactTransition: 'fade',
  transitionDuration: 2.2,
  sceneLength: { min: 14, max: 30 },
  mapping: { attack: 0.2, decay: 0.8, beatDecay: 0.6, hitThreshold: 0.92 },
  typography: { fontFamily: '"Didot", "Bodoni 72", Georgia, "Songti TC", serif', fontWeight: '400', fontStyle: 'normal', letterSpacing: 14, uppercase: true },
  lyricPreset: 'minimal',
};
