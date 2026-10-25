// npx tsx --test scripts/lyric-vj/cutout.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange, calmShot, calmSong, diversify, headIn, limiter, tiles, oddCutout, offLyric, onBeat, overlapping, paintedWindow, Shot, shotCode, windowOff } from './cutout.mts';

test('cut-outs keep out of the lyric third', () => {
  assert.equal(offLyric(-0.8, 'left'), -0.2);
  assert.equal(offLyric(0.5, 'left'), 0.5);
  assert.equal(offLyric(0.7, 'right'), 0.2);
});

test('a shot becomes drawing code that parses and draws its set, cut-outs and weather', () => {
  const s: Shot = { frame: 1, mode: 'cutout', set: 'set_a', layout: { shape: 'full', x: 0, y: 0.5, size: 1, paper: '', tilt: 0 }, zoom: [1, 1.1], focus: [0, 0], wash: '#203060', weather: 'snow', transition: 'cut', pulse: false,
    actors: [{ sprite: 'he', then: '', at: 0.5, x: 0.3, ground: 0.9, h: 0.6, flip: false, enter: 'fade', wind: true }], props: [{ sprite: 'leaf', x: 0, y: 0, h: 0.1, motion: 'fall', front: false, walk: 0 }] };
  const drawn: string[] = [];
  const pic = { width: 100, height: 200 };
  const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? () => drawn.push('img') : () => {}), set: () => true });
  const f = { w: 1920, h: 1080, age: 0.5, scene: () => pic, img: () => pic, warp: () => drawn.push('warp'), particles: () => drawn.push('snow') };
  new Function('ctx', 'f', shotCode(s, 4, { he: 0.5, leaf: 1 }))(ctx, f);
  assert.deepEqual(drawn, ['img', 'img', 'warp', 'snow']);
});

test('two cut-outs standing into each other are caught (a fake embrace); apart they pass', () => {
  const q = (x: number) => ({ sprite: 'p', then: '', at: 0.5, x, ground: 0.9, h: 0.7, flip: false, enter: 'none' as const, wind: false });
  assert.equal(overlapping([q(0), q(0.1)], { p: 0.4 }), true);
  assert.equal(overlapping([q(-0.5), q(0.5)], { p: 0.4 }), false);
});

test('a close figure keeps its head in the frame; its feet go below it instead', () => {
  assert.ok(Math.abs(headIn({ ground: 0.95, h: 1.1 }).ground - 1.14) < 1e-9);
  assert.equal(headIn({ ground: 0.9, h: 0.6 }).ground, 0.9);
});

test('a shot on paper draws its picture clipped into the shape, then its figures over the edge', () => {
  const s: Shot = { frame: 1, mode: 'cutout', set: 'set_a', layout: { shape: 'circle', x: 0.3, y: 0.45, size: 0.6, paper: '#F2EDE3', tilt: 0 }, zoom: [1, 1], focus: [0, 0], wash: '', weather: 'none', transition: 'cut', pulse: false,
    actors: [{ sprite: 'he', then: '', at: 0.5, x: 0.3, ground: 0.88, h: 0.6, flip: false, enter: 'none', wind: false }], props: [] };
  const calls: string[] = [];
  const pic = { width: 100, height: 200 };
  const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' || k === 'clip' || k === 'arc' ? () => calls.push(String(k)) : () => {}), set: () => true });
  new Function('ctx', 'f', shotCode(s, 4, { he: 0.5 }))(ctx, { w: 1920, h: 1080, age: 1, scene: () => pic, img: () => pic, warp: () => calls.push('warp'), particles: () => {} });
  const firstImg = calls.indexOf('drawImage');
  assert.ok(calls.lastIndexOf('clip') < firstImg && calls.lastIndexOf('drawImage') > firstImg);
});

test('a window keeps its whole width out of the lyric third, shrinking when it must; full-width forms stay', () => {
  const l = { shape: 'ticket' as const, x: 0, y: 0.5, size: 0.72, paper: '', tilt: 0 };
  const w = windowOff(l, 'left');
  const left = ((w.x + 1) / 2) * 1920 - (1.6 * w.size * 1080) / 2;
  assert.ok(left >= 0.36 * 1920 - 1e-6);
  const r = windowOff(l, 'right');
  assert.ok(((r.x + 1) / 2) * 1920 + (1.6 * r.size * 1080) / 2 <= 0.64 * 1920 + 1e-6);
  assert.equal(windowOff({ ...l, shape: 'band' }, 'right').x, 0);
});

test('a pose change lands on the nearest downbeat inside the shot', () => {
  assert.ok(Math.abs(onBeat(0.5, 10, 4, [9, 11.2, 13.9]) - 0.3) < 1e-9);
  assert.equal(onBeat(0.5, 10, 4, []), 0.5);
});

test('a keyed cut-out shaped like a smear or ground band is caught', () => {
  assert.equal(oddCutout(5.4, false), true);
  assert.equal(oddCutout(1, false), false);
  assert.equal(oddCutout(0.4, true), false);
  assert.equal(oddCutout(1.6, true), true);
});

test('a painted frame moves out of a narrow window into the song\'s wide motif', () => {
  const l = { shape: 'diamond' as const, x: -0.3, y: 0.5, size: 0.5, paper: '', tilt: 0 };
  assert.equal(paintedWindow(l, ['diamond', 'doubleband', 'rounded']).shape, 'doubleband');
  assert.equal(paintedWindow(l, ['circle']).shape, 'rounded');
  assert.equal(paintedWindow({ ...l, shape: 'rect' }, []).shape, 'rect');
});

test('a sparse song is calm whatever its tracked tempo; its shots stop bouncing and barely push in', () => {
  assert.equal(calmSong([{ text: '三年後的大雪', start: 0, end: 3 }]), true);
  assert.equal(calmSong([{ text: '我的阿妹妹快來跟我跳阿哥哥我知道你看到是我', start: 0, end: 4 }]), false);
  const s = calmShot({ pulse: true, zoom: [1, 1.15] } as Shot);
  assert.equal(s.pulse, false);
  assert.ok(Math.abs(s.zoom[1] - 1.05) < 1e-9);
});

test('figures are set apart beside the lyric, shrunk together when they do not fit', () => {
  const q = (x: number) => ({ sprite: 'p', then: '', at: 0.5, x, ground: 0.9, h: 0.8, flip: false, enter: 'none' as const, wind: false });
  const out = arrange([q(-0.9), q(-0.85), q(-0.8)], { p: 0.45 }, 'left');
  const half = (a: { h: number }) => (a.h * 0.45 * 1080) / 1920;
  assert.ok(out[0].x - half(out[0]) >= 2 * 0.36 - 1 - 1e-9);
  for (let i = 1; i < out.length; i++) assert.ok(out[i].x - half(out[i]) >= out[i - 1].x + half(out[i - 1]));
  assert.ok(out[2].x + half(out[2]) <= 1 - 0.06 + 1e-9);
});

test('a character never holds the same pose two shots running; the least-used other pose takes over', () => {
  const sprites = [{ id: 'a1', who: ['a'] }, { id: 'a2', who: ['a'] }, { id: 'a3', who: ['a'] }];
  const shot = (sprite: string) => ({ actors: [{ sprite, then: '', at: 0.5, x: 0, ground: 0.9, h: 0.6, flip: false, enter: 'none', wind: false }] }) as unknown as Shot;
  const out = diversify([shot('a1'), shot('a1'), shot('a1'), shot('a2')], sprites).map((s) => s.actors[0].sprite);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i], out[i - 1]);
  assert.deepEqual(out, ['a1', 'a2', 'a1', 'a2']);
});

test('hand tiles cover the whole picture and overlap their neighbours', () => {
  const t = tiles(3, 2);
  assert.equal(t.length, 6);
  assert.deepEqual([Math.min(...t.map((b) => b[0])), Math.min(...t.map((b) => b[1])), Math.max(...t.map((b) => b[2])), Math.max(...t.map((b) => b[3]))], [0, 0, 1, 1]);
  assert.ok(t[0][2] > t[1][0]);
});

test('the limiter never runs more jobs at once than it allows', async () => {
  const slot = limiter(2);
  let now = 0, most = 0;
  await Promise.all(Array.from({ length: 6 }, () => slot(async () => { now++; most = Math.max(most, now); await new Promise((r) => setTimeout(r, 5)); now--; })));
  assert.equal(most, 2);
});

test('a scene word falls onto the floor and the figure standing on it pushes its letters aside', () => {
  const s = { frame: 1, mode: 'cutout', set: 'set_a', layout: { shape: 'full', x: 0, y: 0.5, size: 1, paper: '', tilt: 0 }, zoom: [1, 1], focus: [0, 0], wash: '', weather: 'none', transition: 'cut', pulse: false, floor: '台妹',
    actors: [{ sprite: 'he', then: '', at: 0.5, x: 0, ground: 0.88, h: 0.6, flip: false, enter: 'none', wind: false }], props: [] } as unknown as Shot;
  const xs: number[] = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'translate' ? (x: number) => xs.push(x) : () => {}), set: () => true });
  new Function('ctx', 'f', shotCode(s, 4, { he: 0.5 }))(ctx, { w: 1920, h: 1080, age: 2, scene: () => ({ width: 10, height: 10 }), img: () => ({ width: 10, height: 10 }), warp: () => {}, particles: () => {} });
  const letters = xs.filter((x) => Math.abs(x - 960) > 100 && Math.abs(x - 960) < 1000);
  assert.ok(letters.length >= 2, 'both letters are drawn');
  assert.ok(letters.some((x) => x < 960 - 200) && letters.some((x) => x > 960 + 200), 'pushed out to both sides of the figure');
});
