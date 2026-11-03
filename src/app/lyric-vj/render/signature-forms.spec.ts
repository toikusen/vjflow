import { describe, expect, it } from 'vitest';
import { inkReads, Inks } from './signature';
import { isMore, rowBreak } from './signature-forms';
import type { SignatureMoment } from '../signature-moments';

const inks = (ink: string, paper: string): Inks => ({ ink, paper, accent: '#ff0000', board: '#ffffff', boardInk: '#000000', ghost: '#888888', press: '#ff0000', core: '#ffffff' });

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

describe('inkReads', () => {
  it('keeps a dark ink on a light ground and a neon ink on a dark one', () => {
    expect(inkReads(inks('#111111', '#f5efe4'), 230)).toBe(true);
    expect(inkReads(inks('#111111', '#f5efe4'), 20)).toBe(false);
    expect(inkReads(inks('#ff4fd8', '#120a1a'), 20)).toBe(true);
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
