import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contrast } from '../contrast';
import { stubCanvas2d } from '../testdata/canvas-stub';
import { templateOffered } from '../templates';
import type { CueRuntime } from './runtime';
import { previewInk, PREVIEW_GAP, scroll, SCROLL_SEC, singalong } from './sing-along';

let restore: () => void;
beforeAll(() => void (restore = stubCanvas2d()));
afterAll(() => restore());

const fx = { flash: 0, hit: 0, shake: 0 };
const rt = (over: Partial<CueRuntime> = {}) =>
  ({
    cue: { id: 'c1', text: '風から聞いた歌', start: 10, end: 13 },
    style: { enter: 'fade', exit: 'cut', reveal: 'line' },
    shot: { template: 'singalong' }, params: {},
    palette: { text: '#f4efe6', background: '#1d1b22', accent: '#5a4fd0' },
    fonts: { display: 'x', body: 'x', script: 'x' },
    showFrom: 10, exitAt: 13.4, exitDur: 0.2, accentTimes: [], pace: 1,
    songOrder: 4, prevText: '前の行', prevEnd: 9.8, nextText: '次の行を待つ', nextStart: 13.7,
    ...over,
  }) as unknown as CueRuntime;
type M = { visible: boolean; userData: Record<string, unknown>; material: { opacity: number }; position: { x: number; y: number }; scale: { x: number } };
const meshes = (g: { traverse(f: (o: unknown) => void): void }) => {
  const out: M[] = [];
  g.traverse((o) => (o as { isMesh?: boolean }).isMesh && out.push(o as M));
  return out;
};
const sung = (ms: M[]) => ms.filter((m) => (m.userData['glyph'] as { src?: number } | undefined)?.src !== undefined);
const preview = (ms: M[]) => ms.filter((m) => m.userData['glyph'] && (m.userData['glyph'] as { src?: number }).src === undefined);

describe('sing-along modes', () => {
  it('are offered to the director only when the buyer opts in (lanes only with a translation)', () => {
    expect(templateOffered('singalong', {})).toBe(false);
    expect(templateOffered('scroll', { sub: true })).toBe(false);
    expect(templateOffered('scroll', { singAlong: true })).toBe(true);
    expect(templateOffered('lanes', {})).toBe(false);
    expect(templateOffered('lanes', { sub: true })).toBe(true);
    expect(templateOffered('stair', {})).toBe(true);
    expect(templateOffered('scene', { sub: true, singAlong: true })).toBe(false);
  });

  it('the preview reads at 4.5:1 and is never dimmed', () => {
    for (const pal of [{ text: '#f4efe6', background: '#1d1b22' }, { text: '#9a9a9a', background: '#ffffff' }, { text: '#333333', background: '#3a3a3a' }])
      expect(contrast(previewInk({ palette: pal } as never), pal.background)).toBeGreaterThanOrEqual(4.5);
    const l = singalong.cue(rt());
    l.update(11, fx);
    const p = preview(meshes(l.group));
    expect(p.length).toBe([...'次の行を待つ'].length);
    expect(p.every((m) => m.material.opacity === 1)).toBe(true);
  });

  it('singalong: alternates rows, the preview in the other row; the underline follows the singing', () => {
    const even = singalong.cue(rt({ songOrder: 4 }));
    const odd = singalong.cue(rt({ songOrder: 5 }));
    even.update(11, fx), odd.update(11, fx);
    const y = (ms: M[]) => ms[0].position.y;
    expect(Math.sign(y(sung(meshes(even.group))))).toBe(1);
    expect(Math.sign(y(sung(meshes(odd.group))))).toBe(-1);
    expect(Math.sign(y(preview(meshes(even.group))))).toBe(-1);
    const bar = () => meshes(even.group).find((m) => m.userData['decor'])!;
    even.update(10.5, fx);
    const a = bar().scale.x;
    even.update(12.5, fx);
    expect(bar().scale.x).toBeGreaterThan(a * 2);
  });

  it('shows no preview when the next line is far off (a row left waiting)', () => {
    const l = singalong.cue(rt({ nextStart: 13 + PREVIEW_GAP + 2 }));
    expect(preview(meshes(l.group)).length).toBe(0);
  });

  it('scroll: the line lands centred before it is read; the line before only scrolls away', () => {
    const l = scroll.cue(rt());
    expect(l.readable()[0]).toBeCloseTo(10 + SCROLL_SEC);
    l.update(10 + SCROLL_SEC + 0.01, fx);
    const ms = meshes(l.group);
    const s = sung(ms);
    // (small kana sit a little low on the row)
    expect(Math.abs((s[0].position.y + s[s.length - 1].position.y) / 2)).toBeLessThan(12);
    // the line before is gone; the next line waits below at full strength
    const others = preview(ms);
    expect(others.filter((m) => m.position.y > 1).every((m) => m.material.opacity === 0)).toBe(true);
    expect(others.filter((m) => m.position.y < -1).every((m) => m.material.opacity === 1)).toBe(true);
  });
});

describe('sing-along lines carry no handoff', () => {
  it('nothing carries words from line to line on a sing-along shot (its rows are fixed places)', async () => {
    const { NO_HANDOFF } = await import('./line-shows');
    expect(NO_HANDOFF.has('singalong') && NO_HANDOFF.has('scroll')).toBe(true);
  });
});
