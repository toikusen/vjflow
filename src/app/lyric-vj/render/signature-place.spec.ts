import { describe, expect, it } from 'vitest';
import { bandsAround, Box, fitIn, FLOOR, pageSpecOf, pageUnder, pictureOf, placedBox, placeOnPage, quietBands, rowLens, rowPlaces, rowsOnPage, storyPictureOf, wordBounds } from './signature-place';

const c011 = [...'どうして よせる波に隠れてしまうの'];

// 世界のつづき frame 16 (c011 「どうして よせる波に隠れてしまうの」): a wavy window right of the middle, Hina standing in it
const sekai16 = { layout: { shape: 'wavy', x: 0.3, y: 0.5, size: 0.66 }, actors: [{ sprite: 'h_sad', then: '', x: 0.42, ground: 0.9, h: 0.7 }], props: [], aspects: { h_sad: 0.2545 } };
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

describe('the story picture of a page', () => {
  it('reads the page spec a cut-out shot\'s code layer carries, and nothing from other code', () => {
    const src = `const S=${JSON.stringify(sekai16)};\nconst W=f.w;`;
    expect(pageSpecOf(src)?.layout?.shape).toBe('wavy');
    expect(pageSpecOf('const x = 1;')).toBeUndefined();
    expect(storyPictureOf([{ kind: 'kinetic' }, { kind: 'code', src }])?.figures).toHaveLength(1);
    expect(storyPictureOf([{ kind: 'kinetic' }, { kind: 'code', src: 'ctx.fillRect(0,0,1,1)' }])).toBeUndefined();
  });
  it('lays the window as page.js does and boxes each figure from its feet up', () => {
    const pic = pictureOf(sekai16);
    expect(pic.window).toEqual([expect.closeTo(713, 0), expect.closeTo(184, 0), expect.closeTo(1783, 0), expect.closeTo(896, 0)]);
    const [girl] = pic.figures;
    expect(girl[3]).toBeCloseTo(972);
    expect(girl[1]).toBeCloseTo(216);
    expect(girl[0]).toBeGreaterThan(1260);
    expect(girl[2]).toBeLessThan(1460);
  });
  it('a whole frame (keyframes.mts\'s own photo, a full layout) is all picture', () => {
    expect(storyPictureOf([{ kind: 'photo', own: true }])?.window).toBe('full');
    expect(pictureOf({ ...sekai16, layout: { shape: 'full', x: 0, y: 0, size: 1 } }).window).toBe('full');
    expect(pictureOf({ ...sekai16, layout: { shape: 'band', x: 0, y: 0.5, size: 0.4 } }).window).toEqual([0, 324, 1920, 756]);
  });
});

describe('the quiet paper round it', () => {
  it('is the bands above, below, left and right of the window and figures together; the open frame is one band', () => {
    const bands = quietBands(pictureOf(sekai16));
    expect(bands.some((b) => b[2] <= 714 && b[3] === 1080)).toBe(true); // the left column
    for (const b of bands) for (const f of [pictureOf(sekai16).window as Box, ...pictureOf(sekai16).figures]) expect(overlaps(b, f)).toBe(false);
    expect(bandsAround([])).toEqual([[0, 0, 1920, 1080]]);
  });
  it('on a whole-frame picture only the lyric\'s third is quiet, and nothing without a side', () => {
    expect(quietBands({ window: 'full', figures: [] }, 'left')).toEqual([[0, 0, 1920 * 0.36, 1080]]);
    expect(quietBands({ window: 'full', figures: [] }, 'right')[0][0]).toBeCloseTo(1920 * 0.64);
    expect(quietBands({ window: 'full', figures: [] })).toEqual([]);
  });
});

describe('fitting a form onto it', () => {
  it('takes the band that keeps the form biggest, centred there, never larger than drawn', () => {
    const p = fitIn([200, 400, 1720, 680], [[0, 0, 1920, 180], [0, 0, 700, 1080]]);
    expect(p).toBeDefined();
    expect(p!.s).toBeLessThan(1);
    const placed = placedBox([200, 400, 1720, 680], p!);
    expect((placed[0] + placed[2]) / 2).toBeCloseTo(350);
    expect(placed[2] - placed[0]).toBeLessThanOrEqual(700 - 72 + 1e-6);
    expect(fitIn([0, 0, 100, 100], [[0, 0, 1920, 1080]])!.s).toBe(1);
  });
  it('a wave moment on 世界のつづき frame 16 lands on the paper clear of the window and the girl, never across her', () => {
    const pic = pictureOf(sekai16);
    const p = placeOnPage([120, 380, 1800, 800], pic, 'left');
    expect(p).toBeDefined();
    const placed = placedBox([120, 380, 1800, 800], p!);
    for (const f of pic.figures) expect(overlaps(placed, f)).toBe(false);
  });
  it('a form that would shrink below the floor on the clear paper goes over the window instead, still clear of the figures', () => {
    // a figure at the far right leaves the paper left of the window as a thin column: the long strike goes over the window
    const pic = pictureOf({ ...sekai16, layout: { shape: 'rect', x: 0.1, y: 0.5, size: 0.8 }, actors: [{ sprite: 'h_sad', then: '', x: 0.9, ground: 0.9, h: 0.7 }] });
    const p = placeOnPage([60, 140, 1860, 1000], pic)!;
    expect(p.s).toBeGreaterThanOrEqual(FLOOR);
    const placed = placedBox([60, 140, 1860, 1000], p);
    for (const f of pic.figures) expect(overlaps(placed, f)).toBe(false);
    expect(overlaps(placed, pic.window as Box)).toBe(true);
  });
  it('a frame without a story picture is left as the form drew it', () => {
    expect(pageUnder({ graphics: { sections: [{ start: 0, layers: [{ kind: 'kinetic' }] }] } }, 'c1', 3)).toBeUndefined();
    expect(pageUnder({}, 'c1', 3)).toBeUndefined();
  });
  it('reads the page under a cue from the section it starts in and its lyric side from its shot', () => {
    const src = `const S=${JSON.stringify(sekai16)};\n`;
    const tr = { graphics: { sections: [{ start: 0, layers: [{ kind: 'kinetic' }] }, { start: 135.95, layers: [{ kind: 'code', src }] }] }, cues: [{ cueId: 'c011', shot: 'L013' }], shots: [{ id: 'L013', params: { position: 'left' } }] };
    const page = pageUnder(tr, 'c011', 135.93); // the cue a hair before its section still finds it
    expect(page?.lyricSide).toBe('left');
    expect(page?.pic.figures).toHaveLength(1);
    expect(pageUnder(tr, 'c011', 100)).toBeUndefined();
  });
});

describe('a row form\'s rows', () => {
  it('on the open frame: one row at its own size in the middle, as before', () => {
    const lay = rowsOnPage(c011, 92, 2.6, [[0, 0, 1920, 1080]])!;
    expect(lay).toMatchObject({ rows: 1, size: 92 });
    const xs = rowPlaces(c011, lay, 2.6);
    expect(xs[8]).toEqual({ x: 960, y: 540 });
    expect(xs[0].x).toBeCloseTo(960 - 8 * 92 * 1.04);
  });
  it('wraps a 17-character wave into the lyric column at a readable size rather than one tiny row', () => {
    const bands = quietBands(pictureOf(sekai16), 'left');
    const lay = rowsOnPage(c011, 92, 3, bands)!;
    expect(lay.rows).toBeGreaterThan(1);
    expect(lay.size).toBeGreaterThanOrEqual(72);
    const places = rowPlaces(c011, lay, 3);
    for (const p of places) {
      expect(p.x - lay.size / 2).toBeGreaterThanOrEqual(lay.band[0]);
      expect(p.x + lay.size / 2).toBeLessThanOrEqual(lay.band[2]);
      for (const f of pictureOf(sekai16).figures) expect(overlaps([p.x - lay.size / 2, p.y - lay.size / 2, p.x + lay.size / 2, p.y + lay.size / 2], f)).toBe(false);
    }
    const rows = [...new Set(places.map((p) => p.y))];
    expect(rows).toHaveLength(lay.rows);
    expect((rows[0] + rows[rows.length - 1]) / 2).toBeCloseTo((lay.band[1] + lay.band[3]) / 2);
  });
  it('breaks only between words: never 隠／れ, a space ends its row, and a line whose words do not fit the rows is refused', () => {
    expect(wordBounds(c011).has(11)).toBe(false); // 隠|れ
    expect(wordBounds(c011).has(10)).toBe(true); // に|隠れ
    expect(rowLens(c011, 3, 6)).toBeUndefined(); // 6 a row would have to cut 隠れ or leave too much for the last row
    expect(rowLens(c011, 3, 7)).toEqual([5, 7, 5]); // どうして ｜よせる波に隠れ｜てしまうの
    expect(rowLens(c011, 2, 9)).toEqual([9, 8]); // どうして よせる波に｜隠れてしまうの
    const noSpace = [...'よせる波に隠れてしまうの'];
    for (let rows = 2; rows <= 3; rows++) for (let cols = Math.ceil(noSpace.length / rows); cols <= noSpace.length; cols++) {
      const lens = rowLens(noSpace, rows, cols);
      if (!lens) continue;
      let at = 0;
      for (const len of lens.slice(0, -1)) { at += len; expect(at).not.toBe(6); } // 隠(5)|れ(6)
    }
    expect(rowLens([...'回憶就像是那凋落的楓葉'], 3, 4)).toEqual([4, 4, 3]); // 回憶就像｜是那凋落｜的楓葉, never 楓／葉
    expect(rowLens([...'回憶就像是那凋落的楓葉'], 2, 6)).toEqual([6, 5]); // 回憶就像是那｜凋落的楓葉
    expect(rowLens([...'回憶就像是那凋落的楓葉'], 2, 7)).toEqual([6, 5]); // 7 would cut 凋落: the row ends a word earlier
    // the column: 3 rows of 7 at 88 px beat 3 rows of 6 (illegal) and 2 rows of 9 (68 px)
    const lay = rowsOnPage(c011, 92, 3, quietBands(pictureOf(sekai16), 'left'))!;
    expect(lay).toMatchObject({ rows: 3, cols: 7 });
    expect(lay.size).toBeGreaterThan(80);
    const places = rowPlaces(c011, lay, 3);
    expect((places[0].x + places[3].x) / 2).toBeCloseTo((lay.band[0] + lay.band[2]) / 2); // どうして centred without its trailing space
    expect(places[5].y).toBeGreaterThan(places[4].y);
  });
  it('a word longer than any row shrinks the row rather than splitting it', () => {
    const chars = [...'しまう'];
    expect(rowLens(chars, 2, 2)).toBeUndefined();
    expect(rowsOnPage(chars, 150, 3, [[0, 0, 300, 1080]])).toMatchObject({ rows: 1, cols: 3 });
  });
});
