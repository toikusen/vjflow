import { describe, expect, it } from 'vitest';
import { BEHIND_SHARE, mustHold, unreadShare } from './behind-ink';

const px = (...hexes: string[]) => hexes.flatMap((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(255));

describe('unreadShare: the ink against what is really under it', () => {
  // LED 看板, red-lamp: the lamp-red ink, its near-black board, the module-flip's yellow and orange blocks
  const [ink, board, yellow, orange] = ['#FF3B2E', '#0A0505', '#FFD24A', '#FF8A2A'];
  it('the lamp-red line reads on its own dark board', () => {
    expect(unreadShare(px(board, board, board, board), ink)).toBe(0);
    expect(mustHold(unreadShare(px(board, board, board, board), ink))).toBe(false);
  });
  it('a yellow or orange block under part of the line is held back, however small a part', () => {
    const under = px(...Array(30).fill(board), yellow);
    expect(unreadShare(under, ink)).toBeCloseTo(1 / 31);
    expect(mustHold(unreadShare(under, ink))).toBe(true);
    expect(mustHold(unreadShare(px(orange, board, board), ink))).toBe(true);
  });
  it('a lamp texture dimmed under the words, still dark enough, is left as it is', () => {
    const dim = '#2a1206';
    expect(mustHold(unreadShare(px(dim, board, dim, board), ink))).toBe(false);
  });
  it('holds only past its share', () => {
    expect(mustHold(BEHIND_SHARE)).toBe(false);
    expect(mustHold(BEHIND_SHARE + 0.001)).toBe(true);
  });
});
