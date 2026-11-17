// The subject tier's frame rules (video-stage.mts): a line seated beside its subject, a blown-up word that keeps the
// seat's band, a running key ink that skips the blown-up word, a figure kept inside the frame, a grid of shots.
import { inFrameX, panelPictures, PANEL_H } from './kinetic';
import { keepsBlownInk } from './world-beats';
import { SEAT_EDGE_PLATE, SEAT_SHARE, seatSpec, SET_SPECS } from './world-sets';

describe('a line seated beside its subject', () => {
  it("keeps words a page prints a plate round inside the plate's margin (大雪 「總在喧囂人群」)", () => {
    const caption = SET_SPECS['screentone/caption'];
    expect(caption.on).toContain('plate');
    expect(seatSpec(caption, 'top').at[1]).toBe(SEAT_EDGE_PLATE.y);
    expect(seatSpec(caption, 'left').at[0]).toBe(SEAT_EDGE_PLATE.x);
    expect(seatSpec(caption, 'right').at[0]).toBeCloseTo(1 - SEAT_EDGE_PLATE.x);
    expect(seatSpec(SET_SPECS['riso/drop-right'], 'top').at[1]).toBe(0.035);
  });
  const drop = SET_SPECS['riso/drop-right'];
  it('stands the set on the seat it is given and keeps it to the seat band, the rest of the set its own', () => {
    expect(seatSpec(drop)).toBe(drop);
    const top = seatSpec(drop, 'top');
    expect(top).toMatchObject({ at: [0.5, 0.035], ax: 0, ay: -1, seated: true, rows: drop.rows, lead: drop.lead });
    expect(top.tall).toBeLessThanOrEqual(SEAT_SHARE.across);
    const left = seatSpec(drop, 'left');
    expect(left).toMatchObject({ ax: -1, ay: 0, seated: true });
    expect(left.share).toBeLessThanOrEqual(SEAT_SHARE.beside);
    expect(seatSpec(drop, 'right').at[0]).toBeGreaterThan(0.9);
  });
});

describe('a running key ink and a blown-up word', () => {
  it('leaves the blown-up word in its ink for a front that runs or flashes, and nothing else', () => {
    const blow = { from: 8, to: 10 };
    expect(keepsBlownInk('ink-run', blow, 8)).toBe(true);
    expect(keepsBlownInk('roll', blow, 9)).toBe(true);
    expect(keepsBlownInk('ink-run', blow, 7)).toBe(false);
    expect(keepsBlownInk('ink-run', undefined, 8)).toBe(false);
    // a phrase that settles into the key ink once is a change, not a flicker
    expect(keepsBlownInk('ink-swap', blow, 8)).toBe(false);
  });
});

describe('a figure in the frame', () => {
  it('keeps its whole width inside, a margin to spare, and centres one wider than the frame', () => {
    expect(inFrameX(1800, 300)).toBe(1920 - 24 - 300);
    expect(inFrameX(100, 300)).toBe(24 + 300);
    expect(inFrameX(960, 300)).toBe(960);
    expect(inFrameX(1500, 1000)).toBe(960);
  });
  it('lays a grid of shots from the pictures there are, at most four, each no higher than the band under the words', () => {
    const pic = (w: number, h: number) => ({ width: w, height: h }) as unknown as CanvasImageSource;
    const lib: Record<string, CanvasImageSource> = { 'spr:A': pic(500, 1000), 'spr:B': pic(1000, 500) };
    const got = panelPictures(['A', 'missing', 'B', 'A', 'B', 'A'], (id) => lib[id ?? '']);
    expect(got.length).toBe(3);
    expect(got[0].h).toBeCloseTo(1080 * PANEL_H);
    expect(got[1].w / got[1].h).toBeCloseTo(2);
  });
});
