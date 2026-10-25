import { describe, expect, it } from 'vitest';
import { bubbleOf, cameraAt, CHAT_BASE, CHAT_TOP, closeUp, isMine } from './chat';

describe('chat', () => {
  it('tells whose message a line is: mine by default, theirs on the left, taking turns from theirs', () => {
    expect([0, 1, 2].map((k) => isMine(undefined, k))).toEqual([true, true, true]);
    expect(isMine('left', 0)).toBe(false);
    expect([0, 1, 2, 3].map((k) => isMine('alternate', k))).toEqual([false, true, false, true]);
  });

  it('sets a long line in at most three rows inside the column, a short one in one', () => {
    // every character one em wide (the test has no canvas to measure with)
    const em = (_: string, st: { size: number }) => st.size;
    const long = bubbleOf('無条件に幸福です 他に何にもいらないです 嫌なたばこの煙さえ 愛しくて欲しくて', 'Zen Kaku Gothic New', 64, 900, em);
    expect(long.rows.length).toBeGreaterThan(1);
    expect(long.rows.length).toBeLessThanOrEqual(4);
    expect(long.w).toBeLessThanOrEqual(900 + long.size * 1.3 + 1);
    expect(bubbleOf('いつまでも', 'Zen Kaku Gothic New', 64, 900, em).rows).toEqual(['いつまでも']);
    // rows break between phrases, never leaving a lone character or cutting a word (seen in the LOVE YOU KILL YOU
    // sample: 「魔法にかかってしまったみた／い」, 「キ／スで」)
    for (const line of ['魔法にかかってしまったみたい', '永遠に起こしてよ不器用なキスで', '嫌なたばこの煙さえ 愛しくて欲しくて']) {
      const rows = bubbleOf(line, 'Zen Kaku Gothic New', 64, 640, em).rows;
      expect(rows.join('').replace(/ /g, ''), line).toBe(line.replace(/ /g, ''));
      expect(rows.every((r) => [...r].length >= 2), rows.join('|')).toBe(true);
      expect(rows.some((r) => /^[ぁぃぅぇぉっゃゅょー]/.test(r)), rows.join('|')).toBe(false);
      expect(rows.join('|'), line).not.toMatch(/キ\|ス|み\|たい|みた\|い/);
    }
    expect(bubbleOf('嫌なたばこの煙さえ 愛しくて欲しくて', 'Zen Kaku Gothic New', 64, 640, em).rows).toEqual(['嫌なたばこの煙さえ', '愛しくて欲しくて']);
    // a strong break beats an even one (the zoomed sample split 「もう殺しちゃ／いたいんだ (キルユー)」 and 「魔法にか／かって」)
    expect(bubbleOf('もう殺しちゃいたいんだ (キルユー)', 'x', 64, 900, em).rows).toEqual(['もう殺しちゃいたいんだ', '(キルユー)']);
    expect(bubbleOf('魔法にかかってしまったみたい', 'x', 64, 700, em).rows).toEqual(['魔法にかかって', 'しまったみたい']);
    expect(bubbleOf('無条件に幸福です 他に何にもいらないです', 'x', 64, 900, em).rows).toEqual(['無条件に幸福です', '他に何にもいらないです']);
  });

  it('holds the camera close on the first message and pulls back when the next arrives', () => {
    expect(cameraAt(1.8, 0, 53, [55.4, 57.8], 54)).toBe(1.8);
    expect(cameraAt(1.8, 0, 53, [55.4, 57.8], 56)).toBe(1);
    expect(cameraAt(1.8, 1, 55.4, [57.8], 55.5)).toBeGreaterThan(1);
    expect(cameraAt(1.8, 2, 57.8, [], 58)).toBe(1);
    expect(cameraAt(1, 0, 53, [55.4], 54)).toBe(1);
  });

  it('takes a close-up from the first message\'s side and never so close that the bubble leaves the frame', () => {
    const W = 1920;
    for (const mine of [true, false]) {
      const first = { w: 500, h: 150 };
      const c = closeUp(2, first, mine);
      // the bubble hugs the pivot's side of the column; scaled about the pivot it must stay inside the frame
      const edge = W * 0.43;
      const x0 = mine ? edge - first.w : -edge;
      const x1 = mine ? edge : -edge + first.w;
      const scaled = [c.px + (x0 - c.px) * c.zoom, c.px + (x1 - c.px) * c.zoom];
      expect(Math.min(...scaled), String(mine)).toBeGreaterThanOrEqual(-W / 2);
      expect(Math.max(...scaled), String(mine)).toBeLessThanOrEqual(W / 2);
      expect(CHAT_BASE + first.h * c.zoom).toBeLessThanOrEqual(CHAT_TOP);
    }
    // a wide first message is not zoomed past what fits
    expect(closeUp(2, { w: 1100, h: 150 }, true).zoom).toBeLessThan(1.6);
  });
});

describe('broken glass', () => {
  it('is the same break for the same seed, its cracks running past the frame so every shard is closed', async () => {
    const { glassOf } = await import('./kit');
    const a = glassOf(1920, 1080, 0.6, 4)!;
    const b = glassOf(1920, 1080, 0.6, 4)!;
    expect(a).toEqual(b);
    expect(glassOf(1920, 1080, 0, 4)).toBeUndefined();
    // the impact is up and to the left, where the chat thread never is
    expect(a.ox).toBeLessThan(1920 * 0.45);
    expect(a.oy).toBeLessThan(1080 * 0.31);
    for (const r of a.rays) {
      const [x, y] = r[r.length - 1];
      expect(x < 0 || x > 1920 || y < 0 || y > 1080).toBe(true);
    }
  });
});

describe('chat attachments', () => {
  it('reads a photo or a sticker message from the shot, a sticker by its prop sprite', async () => {
    const { attachmentOf } = await import('./chat');
    expect(attachmentOf({}, 10)).toBeUndefined();
    expect(attachmentOf({ attachKind: 'sticker', attach: 'earth.blue', attachAt: 3, attachVoice: 'them' }, 10)).toEqual({ kind: 'sticker', id: 'spr:earth.blue', at: 13, mine: false });
    expect(attachmentOf({ attachKind: 'photo', attach: 'night_sky' }, 10)).toEqual({ kind: 'photo', id: 'night_sky', at: 10, mine: true });
  });
});
