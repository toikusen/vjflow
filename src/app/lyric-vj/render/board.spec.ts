import { BoardEvent, edgeSlot, freeZone, orderAt, pieceAt, sceneSlot, slot, viewAt } from './board';

describe('board', () => {
  it('eases its order from the part\'s start value to its end value', () => {
    const b = { from: 10, to: 20, order: [1, 0] as [number, number] };
    expect(orderAt(b, 5)).toBe(1);
    expect(orderAt(b, 15)).toBeCloseTo(0.5);
    expect(orderAt(b, 25)).toBe(0);
  });

  it('files pieces inside the lyric\'s free stretch when tidy, and tilts and scatters them as the order goes', () => {
    const room: [number, number] = [1100, 1880];
    for (let i = 0; i < 6; i++) {
      const s = slot(i, 6, 0, 1920, 1080, room, 3);
      expect(s.x).toBeGreaterThan(room[0]);
      expect(s.x).toBeLessThan(room[1]);
      expect(Math.abs(s.rot)).toBeLessThan((3 * Math.PI) / 180);
    }
    const tilts = Array.from({ length: 6 }, (_, i) => Math.abs(slot(i, 6, 1, 1920, 1080, room, 3).rot));
    expect(Math.max(...tilts)).toBeGreaterThan((10 * Math.PI) / 180);
  });

  it('works a piece\'s state out from the board\'s events: pinned, hanging after its pin pops, then thrown off', () => {
    const ev: BoardEvent[] = [{ at: 10, kind: 'loosen', items: [0, 1] }, { at: 20, kind: 'scatter', items: [1] }];
    expect(pieceAt(ev, 0, 9, 1080).pin).toBe(true);
    const hung = pieceAt(ev, 0, 11, 1080);
    expect(hung.pin).toBe(false);
    expect(Math.abs(hung.drot)).toBeGreaterThan(0.4);
    expect(pieceAt(ev, 0, 25, 1080).gone).toBe(false);
    expect(pieceAt(ev, 1, 23, 1080).gone).toBe(true);
    expect(pieceAt(ev, 2, 23, 1080).pin).toBe(true);
  });

  it('finds the biggest stretch the cut\'s lines leave free, and none when a line fills the frame', () => {
    const line = (x0: number, y0: number, x1: number, y1: number) => ({ from: 0, to: 5, x0, y0, x1, y1 });
    expect(freeZone([line(100, 400, 900, 700)], 0, 5, 1920, 1080)).toEqual([940, 0, 1920, 1080]);
    expect(freeZone([line(0, 0, 1920, 1080)], 0, 5, 1920, 1080)).toBeUndefined();
    expect(freeZone([line(0, 0, 1920, 1080)], 6, 9, 1920, 1080)).toEqual([0, 0, 1920, 1080]);
  });

  it('lays a whole song\'s pieces on a fixed border: the top edge, then the bottom, the same spot every cut', () => {
    const a = edgeSlot(0, 12, 0, 1920, 1080, 7), b = edgeSlot(6, 12, 0, 1920, 1080, 7);
    expect(a.y).toBeLessThan(1080 * 0.3);
    expect(b.y).toBeGreaterThan(1080 * 0.7);
    expect(edgeSlot(0, 12, 0, 1920, 1080, 7)).toEqual(a);
  });

  it('stands a place\'s landmark large in the middle and its things smaller to either side', () => {
    const land = sceneSlot(0, 4, 1920, 1080, 1), a = sceneSlot(1, 4, 1920, 1080, 1), b = sceneSlot(2, 4, 1920, 1080, 1);
    expect(land.x).toBe(960);
    expect(a.w).toBeLessThan(land.w);
    expect(Math.sign(a.x - 960)).toBe(-Math.sign(b.x - 960));
  });

  it('revisits the place: the view eases from the one before', () => {
    const views = [{ at: 10, zoom: 1, focus: 0 }, { at: 20, zoom: 1.6, focus: 1 }];
    expect(viewAt(views, 5)).toEqual({ zoom: 1, focus: 0 });
    expect(viewAt(views, 20.6).zoom).toBeGreaterThan(1);
    expect(viewAt(views, 20.6).zoom).toBeLessThan(1.6);
    expect(viewAt(views, 30)).toEqual({ zoom: 1.6, focus: 1 });
  });
});
