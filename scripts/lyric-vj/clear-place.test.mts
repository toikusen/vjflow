// npx tsx --test scripts/lyric-vj/clear-place.test.mts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLEAR_JS, shotCode, type Shot } from './cutout.mts';

type Box = { from: number; to: number; x0: number; y0: number; x1: number; y1: number };
type Placed = { actors: Shot['actors']; props: Shot['props']; moved: number; shrunk: number; stuck: number };
const placeClear = new Function(`${CLEAR_JS}; return placeClear;`)() as (s: unknown, w: number, h: number, lines: Box[]) => Placed;
const W = 1920, H = 1080;

const actor = (x: number, o: Partial<Shot['actors'][number]> = {}): Shot['actors'][number] => ({ sprite: 'he', then: '', at: 0.5, x, ground: 0.9, h: 0.6, flip: false, enter: 'none', wind: false, ...o });
const shot = (actors: Shot['actors'], props: Shot['props'] = [], o: Partial<Shot> = {}) => ({ dur: 4, zoom: [1, 1], focus: [0, 0], pulse: false, aspects: { he: 0.4, she: 0.4, leaf: 1 }, actors, props, ...o });
// the figure's frame box at full size, as the drawing places it (no camera)
const box = (q: Shot['actors'][number], asp = 0.4) => { const hh = q.h * H, cx = ((q.x + 1) / 2) * W; return { x0: cx - (hh * asp) / 2, y0: q.ground * H - hh, x1: cx + (hh * asp) / 2, y1: q.ground * H }; };
const meets = (a: { x0: number; y0: number; x1: number; y1: number }, b: Box) => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
// a vertical line standing in the middle right of the frame, read the whole shot
const midLine: Box = { from: 0, to: 4, x0: 1000, y0: 200, x1: 1300, y1: 900 };

test('a figure clear of the lines stays exactly where the director put it', () => {
  const q = actor(-0.6);
  const r = placeClear(shot([q]), W, H, [midLine]);
  assert.deepEqual(r.actors[0], q);
  assert.equal(r.moved, 0);
});

test('a figure standing under a line slides along its ground out of it, its size and footing kept', () => {
  const q = actor(0.2);
  assert.ok(meets(box(q), midLine), 'the director had it under the line');
  const r = placeClear(shot([q]), W, H, [midLine]);
  const p = r.actors[0];
  assert.equal(p.ground, q.ground, 'never lifted');
  assert.equal(p.h, q.h, 'a slide is enough: no shrink');
  assert.ok(!meets(box(p), { ...midLine, x0: midLine.x0 - 24, x1: midLine.x1 + 24 }), 'clear of the line and its margin');
  assert.ok(Math.abs(p.x - q.x) < 0.6, 'the nearest clear place, not the far edge');
  assert.equal(r.moved, 1);
});

test('a line read only before the shot moves nothing', () => {
  const q = actor(0.2);
  const r = placeClear(shot([q]), W, H, [{ ...midLine, from: -5, to: -0.5 }]);
  assert.deepEqual(r.actors[0], q);
});

test('a line that comes up as the shot ends (its page lingers under it through the next transition) moves the figure', () => {
  // (三年後的大雪 13.3 s: he_eyes_closed stood whole on the next line through the warp; the engine hands it in f.lines)
  const q = actor(0.2);
  const r = placeClear(shot([q]), W, H, [{ ...midLine, from: 4, to: 11 }]);
  assert.equal(r.moved, 1);
  assert.ok(!meets(box(r.actors[0]), midLine));
});

test('the camera push is part of the envelope: a figure clear at the start but pushed under the line later moves', () => {
  // the line sits just right of the figure; a 1.25 push from the left focus carries the figure right into it
  const line: Box = { from: 2, to: 4, x0: 1260, y0: 150, x1: 1500, y1: 950 };
  const q = actor(0.1);
  assert.ok(!meets(box(q), line), 'clear before the push');
  const r = placeClear(shot([q], [], { zoom: [1, 1.25], focus: [-1, 0] }), W, H, [line]);
  assert.equal(r.moved, 1);
  assert.notEqual(r.actors[0].x, q.x);
});

test('two figures keep their order and stay apart when one of them has to make room', () => {
  const a = actor(-0.3, { sprite: 'she' }), b = actor(0.25);
  const r = placeClear(shot([a, b]), W, H, [midLine]);
  const [pa, pb] = r.actors;
  assert.ok(pa.x < pb.x, 'left one stays left');
  assert.ok(box(pb).x0 - box(pa).x1 > 0, 'not standing into each other');
  assert.ok(!meets(box(pb), midLine));
});

test('with no room to slide a figure shrinks a little on its foot; never below the readable size', () => {
  // two lines leave a gap that only a slightly smaller figure fits in
  const left: Box = { from: 0, to: 4, x0: 0, y0: 150, x1: 700, y1: 950 };
  const right: Box = { from: 0, to: 4, x0: 1150, y0: 150, x1: W, y1: 950 };
  const q = actor(0.0, { h: 0.95, ground: 0.98 });
  const r = placeClear(shot([q]), W, H, [left, right]);
  const p = r.actors[0];
  assert.equal(r.shrunk, 1);
  assert.ok(p.h < q.h && p.h >= q.h * 0.7, 'a modest shrink');
  assert.equal(p.ground, q.ground);
  assert.ok(!meets(box(p), left) && !meets(box(p), right));
});

test('a figure with no room at all stays put for the keep-clear', () => {
  const wall: Box = { from: 0, to: 4, x0: 0, y0: 100, x1: W, y1: 1000 };
  const q = actor(0.2);
  const r = placeClear(shot([q]), W, H, [wall]);
  assert.deepEqual(r.actors[0], q);
  assert.equal(r.stuck, 1);
});

test('a falling leaf is placed by its whole fall, not where it lands', () => {
  // the line is high up: the leaf lands below it but falls through it
  const high: Box = { from: 0, to: 4, x0: 700, y0: 100, x1: 1220, y1: 420 };
  const leaf = { sprite: 'leaf', x: 0, y: 0.8, h: 0.1, motion: 'fall' as const, front: false, walk: 0 };
  const r = placeClear(shot([], [leaf]), W, H, [high]);
  assert.equal(r.moved, 1);
  const cx = ((r.props[0].x + 1) / 2) * W;
  assert.ok(cx + 0.1 * H < high.x0 || cx - 0.1 * H > high.x1, 'its fall passes beside the line');
});

test('the shot code places its figures from f.lines: the sprite is drawn clear of the line it would have covered', () => {
  const s: Shot = { frame: 1, mode: 'cutout', set: 'set_a', layout: { shape: 'full', x: 0, y: 0.5, size: 1, paper: '', tilt: 0 }, zoom: [1, 1], focus: [0, 0], wash: '', weather: 'none', transition: 'cut', pulse: false,
    actors: [actor(0.2)], props: [] } as unknown as Shot;
  const xs: number[] = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === 'translate' ? (x: number) => xs.push(x) : () => {}), set: () => true });
  const pic = { width: 40, height: 100 };
  // song time: the section starts at 10 s, the line is read 10–14 s
  const f = { w: W, h: H, t: 11, age: 1, cache: {}, lines: [{ ...midLine, from: 10, to: 14 }], scene: () => pic, img: () => pic, warp: () => {}, particles: () => {} };
  new Function('ctx', 'f', shotCode(s, 4, { he: 0.4 }))(ctx, f);
  // the figure's translate is its foot centre (frame px)
  const foot = xs.filter((x) => x > 0 && Math.abs(x - W / 2) > 1).at(-1)!;
  const half = (0.6 * H * 0.4) / 2;
  assert.ok(foot + half < midLine.x0 || foot - half > midLine.x1, `foot at ${foot} is clear of the line`);
});

test('a close figure between two lines takes the room beside the far figure behind him, whole and at full size', () => {
  // (三年後的大雪 9.2–13.9 s: lines at both sides, he_eyes_closed 0.9 high in front, her small in the picture behind)
  const lines: Box[] = [{ from: 0, to: 4, x0: 190, y0: 40, x1: 488, y1: 951 }, { from: 4, to: 11, x0: 1351, y0: 40, x1: 1714, y1: 956 }];
  const her = actor(0.12, { sprite: 'she', h: 0.4, ground: 0.8 }), him = actor(0.6, { h: 0.9, ground: 1 });
  const r = placeClear(shot([her, him], [], { aspects: { he: 0.29, she: 0.31 } }), W, H, lines);
  assert.equal(r.stuck, 0);
  const [pher, p] = r.actors;
  const b = box(p, 0.29);
  assert.ok(lines.every((l) => !meets(b, l)), 'clear of both lines');
  assert.equal(p.h, him.h);
  assert.equal(p.ground, him.ground);
  assert.ok(b.x0 >= 0 && b.x1 <= W, 'wholly in the frame');
  assert.deepEqual(pher, her, 'she is not under a line and stays');
});

test('a close figure with no room inside the frame steps partly out past its side, no more than 40 %', () => {
  const lines: Box[] = [{ from: 0, to: 4, x0: 0, y0: 40, x1: 1600, y1: 951 }];
  const q = actor(0.3, { h: 0.9, ground: 1 });
  const r = placeClear(shot([q], [], { aspects: { he: 0.45 } }), W, H, lines);
  const b = box(r.actors[0], 0.45);
  assert.equal(r.stuck, 0);
  assert.ok(b.x1 > W && b.x1 - W <= 0.4 * (b.x1 - b.x0) + 1);
  assert.ok(!meets(b, lines[0]));
});

test('a wide free spot where the figure stands whole beats a nearer spot that crops it at the frame edge', () => {
  // (三年後的大雪 151.5 s: he was pushed half off the left edge with the right side free)
  const line: Box = { from: 0, to: 4, x0: 300, y0: 40, x1: 1100, y1: 950 };
  const q = actor(-0.6, { h: 0.9, ground: 1 });
  const r = placeClear(shot([q], [], { aspects: { he: 0.35 } }), W, H, [line]);
  const b = box(r.actors[0], 0.35);
  assert.ok(b.x0 >= 0 && b.x1 <= W, 'wholly in the frame');
  assert.equal(r.actors[0].h, q.h, 'at full size');
  assert.ok(b.x0 > line.x1, 'across the line, in the free right side');
});

test('a lone close figure crosses past a far figure in the picture behind to the free side; the far one stays', () => {
  const line: Box = { from: 0, to: 4, x0: 100, y0: 40, x1: 800, y1: 950 };
  const him = actor(-0.6, { h: 0.9, ground: 1 }), her = actor(0, { sprite: 'she', h: 0.4, ground: 0.8 });
  const r = placeClear(shot([him, her], [], { aspects: { he: 0.35, she: 0.4 } }), W, H, [line]);
  const [p, ph] = r.actors;
  assert.deepEqual(ph, her);
  assert.ok(p.x > her.x, 'he crossed to her other side');
  assert.equal(p.h, him.h);
  assert.equal(p.flip, him.flip, 'his facing is kept');
  const b = box(p, 0.35);
  assert.ok(b.x0 >= 0 && b.x1 <= W && !meets(b, line));
});

test('two figures talking on the same ground keep their order even when crossing would be nearer and bigger', () => {
  const line: Box = { from: 0, to: 4, x0: 900, y0: 40, x1: 1700, y1: 950 };
  const a = actor(-0.25, { sprite: 'she', h: 0.58, ground: 0.88 }), b = actor(0.15, { h: 0.62, ground: 0.88 });
  const r = placeClear(shot([a, b]), W, H, [line]);
  const [pa, pb] = r.actors;
  assert.ok(pa.x < pb.x, 'she stays on his left');
  assert.ok(!meets(box(pb), line) && !meets(box(pa), line));
  assert.equal(pb.ground, b.ground);
});

test('a far figure never steps out of the frame to make room', () => {
  const wallRight: Box = { from: 0, to: 4, x0: 700, y0: 100, x1: 1900, y1: 1000 };
  const q = actor(0.3, { h: 0.5 });
  const r = placeClear(shot([q]), W, H, [wallRight]);
  const b = box(r.actors[0]);
  assert.ok(b.x0 >= 0 && b.x1 <= 700);
});

test('two figures with no room for one beside the other slide together, keeping their spacing', () => {
  // a line on the right; the left figure stands where the right one would have to go
  const line: Box = { from: 0, to: 4, x0: 1100, y0: 100, x1: W, y1: 1000 };
  const a = actor(-0.05, { sprite: 'she' }), b = actor(0.25);
  const r = placeClear(shot([a, b]), W, H, [line]);
  assert.equal(r.stuck, 0);
  const [pa, pb] = r.actors;
  assert.ok(Math.abs((pb.x - pa.x) - (b.x - a.x)) < 1e-9, 'same spacing');
  assert.ok(!meets(box(pa), line) && !meets(box(pb), line));
});

test('lines at both sides and no room for two as spaced: the one under a line pushes its partner along, order kept', () => {
  // (三年後的大雪 79–84.7 s: he reaches wide, then searches slim as the left line comes in through the next warp; she
  // stands in the middle; the right side is read the whole shot)
  const lines: Box[] = [{ from: 0, to: 3.88, x0: 1351, y0: 40, x1: 1714, y1: 953 }, { from: 3.52, to: 5.66, x0: 1507, y0: 40, x1: 1744, y1: 950 }, { from: 5.68, to: 8.06, x0: 134, y0: 40, x1: 566, y1: 948 }];
  const him = actor(-0.5, { sprite: 'reach', then: 'search', at: 0.5, h: 0.85, ground: 1 }), her = actor(0.05, { sprite: 'she', h: 0.58, ground: 0.86 });
  const r = placeClear(shot([him, her], [], { dur: 5.68, zoom: [1, 1.02], focus: [-0.25, 0.1], aspects: { reach: 0.63, search: 0.33, she: 0.38 } }), W, H, lines);
  assert.equal(r.stuck, 0);
  const [ph, pr] = r.actors;
  assert.ok(ph.x < pr.x, 'he stays left of her');
  assert.equal(ph.h, him.h, 'the one under the line keeps his size');
  assert.ok(pr.h >= her.h * 0.7, 'she shrinks a little at most');
  assert.ok(!meets(box(ph, 0.33), lines[2]), 'his search pose is clear of the incoming line');
  assert.ok(!meets(box(ph, 0.63), lines[0]), 'his reach is clear of the line read first');
  assert.ok(lines.every((l) => !meets(box(pr, 0.38), l)));
  assert.equal(ph.ground, him.ground);
  assert.equal(pr.ground, her.ground);
});

test('standing over another figure costs more than a modest shrink (三年後的大雪 151.5 s: he covered the girl in the picture)', () => {
  // the only clear room is the middle; at full size he must overlap her, a little smaller he stands beside her
  const lines: Box[] = [{ from: 0, to: 12.24, x0: 1324, y0: 40, x1: 1756, y1: 951 }, { from: 12.26, to: 15.88, x0: 174, y0: 40, x1: 567, y1: 954 }];
  const him = actor(-0.58, { h: 0.9, ground: 1 }), her = actor(-0.05, { sprite: 'she', h: 0.4, ground: 0.8 });
  const r = placeClear(shot([him, her], [], { dur: 12.26, zoom: [1, 1.03], focus: [-0.1, 0], aspects: { he: 0.321, she: 0.342 }, pic: [294 / W, 140 / H, 1050 / W, 896 / H] }), W, H, lines);
  const [p] = r.actors;
  assert.equal(r.stuck, 0);
  assert.ok(p.h < him.h && p.h >= him.h * 0.8, 'a modest shrink');
  assert.ok(!meets(box(p, 0.321), { from: 0, to: 0, ...box(her, 0.342) }), 'not over her');
  assert.equal(p.ground, him.ground, 'feet on his own ground');
});

test('a moved figure keeps out of the scene picture when a clear spot outside it is there', () => {
  const line: Box = { from: 0, to: 4, x0: 850, y0: 40, x1: 1150, y1: 950 };
  const q = actor(0.0);
  // the picture's window fills the left of the line (the nearer side); the right of it is bare paper
  const r = placeClear(shot([q], [], { pic: [0.05, 0.1, 0.4, 0.9] }), W, H, [line]);
  const b = box(r.actors[0]);
  assert.ok(b.x0 > line.x1, 'beside the line on the bare side, not in front of the picture');
});

test('a figure is never lifted, sunk or enlarged: its ground stays and its size never grows', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 60; k++) {
    const qs = [actor(rnd() * 1.6 - 0.8, { h: 0.4 + rnd() * 0.6, ground: 0.8 + rnd() * 0.2 }), actor(rnd() * 1.6 - 0.8, { sprite: 'she', h: 0.4 + rnd() * 0.5, ground: 0.8 + rnd() * 0.15 })];
    const x0 = rnd() * 1500;
    const r = placeClear(shot(qs), W, H, [{ from: 0, to: 4, x0, y0: 40, x1: x0 + 200 + rnd() * 500, y1: 950 }]);
    r.actors.forEach((p, i) => { assert.equal(p.ground, qs[i].ground); assert.ok(p.h <= qs[i].h); });
  }
});
