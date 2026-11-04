import { describe, expect, it } from 'vitest';
import { contrast } from '../contrast';
import { groundUnder, inkFor, Inks, READS } from './signature';
import { isMore, riseKindOf, rowBreak } from './signature-forms';
import type { SignatureMoment } from '../signature-moments';

const inks = (ink: string, paper: string, accent = '#ff0000'): Inks => ({ ink, paper, accent, board: '#ffffff', boardInk: '#000000', ghost: '#888888', press: '#ff0000', core: '#ffffff' });

describe('rowBreak', () => {
  it('keeps a line that fits on one row and breaks a long one at the space nearest its middle', () => {
    expect(rowBreak([...'那些悲傷融化了從前'], 1560)).toBe(9);
    const drift = [...'はい わたし テリヤキ・ボーイズ あっという間吹き飛ばすノイズ'];
    expect(drift[rowBreak(drift, 1560)]).toBe(' ');
    expect(rowBreak([...'一二三四五六七八九十一二三四五六七八九十一二三'], 1560)).toBe(12);
    expect(rowBreak([...'この星は丸くて青くてさ、綺麗じゃん！'], 1, 1)).toBe(12);
    expect(rowBreak([...'私がどんなにあなたを想ってこの身を削っても'], 1560, 72, [6, 13])).toBe(13);
  });
});

describe('inkFor: the moment\'s type on what is really under it', () => {
  it('keeps the song\'s ink where it reads, takes the paper colour on a dark ground, and needs no keyline on a plain one', () => {
    const on = inkFor(inks('#111111', '#f5efe4'), { mean: '#e8e2d6', mixed: false });
    expect(on.ink).toBe('#111111');
    expect(on.halo).toBeUndefined();
    expect(inkFor(inks('#111111', '#f5efe4'), { mean: '#141418', mixed: false }).ink).toBe('#f5efe4');
    expect(inkFor(inks('#ff4fd8', '#120a1a'), { mean: '#141418', mixed: false }).ink).toBe('#ff4fd8');
  });
  it('Utsusemi 「君の輪郭」: the cream ink stays cream over the blue dye, with a dark keyline where the dye is dotted light', () => {
    const aizome = inks('#E6E5DA', '#0B1526', '#5F86A8');
    const on = inkFor(aizome, { mean: '#2d4b73', mixed: true });
    expect(on.ink).toBe('#E6E5DA');
    expect(contrast(on.ink, '#2d4b73')).toBeGreaterThanOrEqual(READS);
    expect(on.halo).toMatch(/^rgba\(14,12,18/);
  });
  it('moves an ink that cannot reach 4.5:1 on its ground toward the far pole until it does, and keylines it', () => {
    const blue = inks('#3a5f8a', '#2b4a70', '#5F86A8');
    const on = inkFor(blue, { mean: '#2f4f78', mixed: false });
    expect(contrast(on.ink, '#2f4f78')).toBeGreaterThanOrEqual(READS);
    expect(on.halo).toBeDefined();
    expect(contrast(on.ghost, '#2f4f78')).toBeGreaterThanOrEqual(2.5);
    // a dark type on a light ground takes a light keyline, never a dark one (its strokes would fill in)
    const grey = inkFor(inks('#5a5a5a', '#6a6a6a'), { mean: '#9a9a9a', mixed: true });
    expect(contrast(grey.ink, '#9a9a9a')).toBeGreaterThanOrEqual(READS);
    expect(grey.halo).toMatch(/^rgba\(255,250,240/);
  });
  it('reads the ground as the engine does: its mean, and whether dark and light are both there', () => {
    const half = (dark: number, light: number) => {
      const d = new Uint8ClampedArray(4 * 700);
      for (let i = 0; i < 700; i++) { const v = i < dark ? 10 : i < dark + light ? 240 : 120; d.set([v, v, v, 255], i * 4); }
      return { getImageData: () => ({ data: d }) } as unknown as CanvasRenderingContext2D;
    };
    expect(groundUnder(half(350, 350), 0, 0, 10, 10).mixed).toBe(true);
    expect(groundUnder(half(700, 0), 0, 0, 10, 10)).toEqual({ mean: '#0a0a0a', mixed: false });
    expect(groundUnder(half(20, 0), 0, 0, 10, 10).mixed).toBe(false);
  });
});

describe('isMore', () => {
  const m = (form: string, variant: string) => ({ form, variant }) as SignatureMoment;
  it('draws the spike\'s forms in signature.ts and the rest in signature-forms.ts', () => {
    expect(isMore(m('strike', 'tear'))).toBe(false);
    expect(isMore(m('shape', 'chain'))).toBe(false);
    expect(isMore(m('strike', 'burn'))).toBe(true);
    expect(isMore(m('shape', 'circle'))).toBe(true);
    expect(isMore(m('freeze', 'stop'))).toBe(true);
    expect(isMore(m('echo', 'ghost'))).toBe(true);
  });
});

describe('riseKindOf: what a rising line names', () => {
  it('tells smoke, bubbles, a balloon and a firework apart, and lets the line itself rise otherwise', () => {
    expect(riseKindOf('煙味')).toBe('smoke');
    expect(riseKindOf('けむり')).toBe('smoke');
    expect(riseKindOf('シャボン玉')).toBe('bubble');
    expect(riseKindOf('風船')).toBe('balloon');
    expect(riseKindOf('花火')).toBe('burst');
    expect(riseKindOf('昇天')).toBe('lift');
    expect(riseKindOf('空へ')).toBe('lift');
    expect(riseKindOf('rising')).toBe('lift');
  });
});
