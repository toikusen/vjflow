import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stubCanvas2d } from '../testdata/canvas-stub';
import type { CueStyle } from '../treatment';
import type { CueLayer, CueRuntime } from './runtime';
import { withTextFx } from './text-fx';

// no canvas here: every 2D call is a no-op; the template's own pictures are named after their characters
let restore: () => void;
beforeAll(() => void (restore = stubCanvas2d()));
afterAll(() => restore());

const TEXT = 'abc';
const fx = { flash: 0, hit: 0, shake: 0 };

/** A template that sets three glyphs in a row each frame (move: how fast the row slides, px/s). */
function layer(move = 0): CueLayer {
  const group = new THREE.Group();
  const meshes = [...TEXT].map((char, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), new THREE.MeshBasicMaterial({ map: Object.assign(new THREE.Texture(), { name: char }), transparent: true }));
    m.userData['glyph'] = { char, index: i, src: i, advance: 30, x: i * 50, y: 0 };
    m.userData['style'] = { size: 40, family: 'x', weight: 700 };
    group.add(m);
    return m;
  });
  return {
    group,
    readable: () => [0, 9],
    update: (t) =>
      meshes.forEach((m, i) => {
        m.position.set(i * 50 + t * move, 0, 0);
        m.scale.set(1, 1, 1);
        m.material.opacity = t >= 1 ? 1 : 0;
      }),
  };
}

const runtime = (style: Partial<CueStyle>) =>
  ({ cue: { text: TEXT, start: 1 }, style: { enter: 'cut', exit: 'fade', reveal: 'line', ...style }, showFrom: 1, exitAt: 3, exitDur: 0.5, pace: 1, palette: { accent: '#ff0000' } }) as unknown as CueRuntime;

async function wrapped(style: Partial<CueStyle>, move = 0) {
  const l = withTextFx(layer(move), runtime(style));
  const glyphs = l.group.children.filter((o) => o.userData['glyph']) as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  return { l, glyphs };
}

describe('drawn text effects', () => {
  it('decode: signs flicker in each place, then every character settles on its own', async () => {
    const { l, glyphs } = await wrapped({ enter: 'decode' });
    l.update(1.05, fx);
    expect(glyphs[2].material.map!.name).not.toBe('c');
    l.update(2, fx);
    expect(glyphs.map((g) => g.material.map!.name).join('')).toBe(TEXT);
  });

  it('slice: the halves come in from opposite sides and meet in place', async () => {
    const { l, glyphs } = await wrapped({ enter: 'slice' });
    l.update(1.02, fx);
    const twin = glyphs[0].children[0];
    expect(glyphs[0].position.x).toBeLessThan(-20);
    expect(twin.position.x).toBeGreaterThan(40);
    l.update(2, fx);
    expect(glyphs[0].position.x).toBeCloseTo(0);
    expect(twin.position.x).toBeCloseTo(0);
  });

  it('strips: the line comes in as alternating horizontal strips and is whole, uncut, once it has landed', async () => {
    const { l, glyphs } = await wrapped({ enter: 'strips' });
    l.update(1.05, fx);
    const twins = glyphs[0].children.filter((c) => (c as THREE.Mesh).isMesh && c.visible) as THREE.Mesh[];
    expect(twins.length).toBeGreaterThanOrEqual(5);
    expect(glyphs[0].material.opacity).toBe(0);
    const sides = twins.map((c) => Math.sign(c.position.x));
    expect(sides.slice(0, 4)).toEqual([sides[0], -sides[0], sides[0], -sides[0]]);
    expect(l.readable()[0]).toBeGreaterThanOrEqual(1 + 0.5);
    l.update(1.6, fx);
    expect(glyphs[0].children.filter((c) => c.visible).length).toBe(0);
    expect(glyphs[0].material.opacity).toBe(1);
  });

  it('flip turns in from edge-on; stretch springs back to its own shape', async () => {
    const flip = await wrapped({ enter: 'flip' });
    flip.l.update(1.02, fx);
    expect(flip.glyphs[0].scale.x).toBeLessThan(0.5);
    flip.l.update(2, fx);
    expect(flip.glyphs[0].scale.x).toBeCloseTo(1);
    const stretch = await wrapped({ enter: 'stretch' });
    stretch.l.update(1.01, fx);
    expect(stretch.glyphs[0].scale.y).toBeGreaterThan(2);
    stretch.l.update(2, fx);
    expect(stretch.glyphs[0].scale.y).toBeCloseTo(1);
  });

  it('scramble and split exits break the line up as it leaves', async () => {
    const sc = await wrapped({ exit: 'scramble' });
    sc.l.update(2, fx);
    sc.l.update(3.2, fx);
    expect(sc.glyphs[0].material.map!.name).not.toBe('a');
    const sp = await wrapped({ exit: 'split' });
    sp.l.update(2, fx);
    sp.l.update(3.3, fx);
    const twin = sp.glyphs[0].children[0];
    expect(twin.visible).toBe(true);
    expect(sp.glyphs[0].position.x).toBeGreaterThan(1);
    expect(twin.position.x).toBeLessThan(-1);
  });

  it('trail: copies follow a moving line, none sit on a still one', async () => {
    const ghostsOn = async (move: number) => {
      const { l } = await wrapped({ trail: true }, move);
      for (let t = 1; t < 1.5; t += 1 / 30) l.update(t, fx);
      return l.group.children.filter((o) => !o.userData['glyph'] && o.visible).length;
    };
    expect(await ghostsOn(600)).toBe(9);
    expect(await ghostsOn(0)).toBe(0);
  });

  it('hold: the wavering line grows from the word after it lands', async () => {
    const { l } = await wrapped({ emphasis: [{ from: 0, to: 3, method: 'hold' }] });
    const line = l.group.children.find((o) => !o.userData['glyph'])!;
    l.update(1.2, fx);
    const early = line.scale.x;
    l.update(2.2, fx);
    expect(line.scale.x).toBeGreaterThan(early * 2);
    expect(line.position.x).toBeGreaterThan(100);
  });

  it('revise: the word is struck through, then a caret comes in under its end', async () => {
    const { l } = await wrapped({ emphasis: [{ from: 0, to: 2, method: 'revise' }] });
    const extras = () => l.group.children.filter((o) => !o.userData['glyph']);
    l.update(1.5, fx);
    const [strike, caret] = extras();
    expect(strike.scale.x).toBeGreaterThan(1);
    expect(caret.scale.y).toBeLessThan(0.01);
    // the caret follows the strike, once the struck word has been sung (its last character at 1.85 s)
    l.update(2.6, fx);
    expect(caret.scale.y).toBeGreaterThan(10);
    expect(caret.position.y).toBeLessThan(0);
  });

  it('strike: the line goes through a word only as it is sung, at the pace it is sung', async () => {
    // 'c' (the third character) is sung at 2.7 s: no end and no character times, so over 85 % of 2 s
    const { l } = await wrapped({ emphasis: [{ from: 2, to: 3, method: 'strike' }] });
    const strike = () => l.group.children.find((o) => !o.userData['glyph'])!;
    l.update(2, fx);
    expect(strike().scale.x).toBeLessThan(1);
    l.update(3.2, fx);
    expect(strike().scale.x).toBeGreaterThan(20);
  });

  it('revise: tape, scribble and stamp cover the word without a caret; a stamp lands whole and askew', async () => {
    for (const look of ['tape', 'scribble', 'stamp'] as const) {
      const { l } = await wrapped({ emphasis: [{ from: 0, to: 2, method: 'revise', look }] });
      const extras = () => l.group.children.filter((o) => !o.userData['glyph']);
      l.update(2, fx);
      expect(extras().length, look).toBe(1);
      const [m] = extras();
      expect(m.scale.y, look).toBeGreaterThan(20);
      if (look === 'stamp') expect(m.rotation.z).toBeLessThan(-0.05);
    }
  });

  it('shuffle: glyphs start in each other\'s places and run home', async () => {
    const { l, glyphs } = await wrapped({ enter: 'shuffle' });
    l.update(1.0, fx);
    const start = glyphs.map((g) => Math.round(g.position.x)).sort((a, b) => a - b);
    expect(start).toEqual([0, 50, 100]);
    expect(glyphs.some((g, i) => Math.abs(g.position.x - i * 50) > 1)).toBe(true);
    l.update(2.5, fx);
    glyphs.forEach((g, i) => expect(g.position.x).toBeCloseTo(i * 50));
  });

  it('squash drops in from above and flattens as it lands; windup backs off, then lands in place', async () => {
    const sq = await wrapped({ enter: 'squash' });
    sq.l.update(1.01, fx);
    expect(sq.glyphs[0].position.y).toBeGreaterThan(80);
    // the first landing: 1 / 4.12 of the way through its 1.1 s
    sq.l.update(1 + 1.1 / 4.121, fx);
    expect(sq.glyphs[0].scale.x).toBeGreaterThan(1.3);
    expect(sq.glyphs[0].scale.y).toBeLessThan(0.7);
    sq.l.update(3, fx);
    expect([sq.glyphs[0].position.y, sq.glyphs[0].scale.y]).toEqual([0, 1]);
    const w = await wrapped({ enter: 'windup' });
    w.l.update(1.25, fx);
    expect(w.glyphs[0].position.x).toBeLessThan(-110);
    expect(w.glyphs[0].scale.y).toBeLessThan(0.85);
    w.l.update(3, fx);
    expect(w.glyphs[0].position.x).toBeCloseTo(0);
  });

  it('karaoke: the line waits dim and lights character by character under a hopping ball', async () => {
    const { l, glyphs } = await wrapped({ enter: 'karaoke' });
    const ball = l.group.children.find((o) => !o.userData['glyph'])!;
    // sung over 1…2.7 s (no character times, no end: 2 s, 85 % of it): the first is lit at once, the last not yet
    l.update(1.3, fx);
    expect(glyphs.map((g) => g.material.opacity)).toEqual([1, 0.5, 0.5]);
    expect(ball.visible).toBe(true);
    expect(ball.position.y).toBeGreaterThan(20);
    l.update(2.75, fx);
    expect(glyphs.every((g) => g.material.opacity === 1)).toBe(true);
    expect(l.readable()[0]).toBeLessThan(1.5);
  });

  it('karaoke: the ball arcs from one row to the next, never jumping', async () => {
    // the third character sits on a second row 200 px lower
    const l0 = layer();
    const gs = l0.group.children as THREE.Mesh[];
    const update = l0.update;
    l0.update = (t, f) => (update(t, f), gs[2].position.set(0, -200, 0));
    const l = withTextFx(l0, runtime({ enter: 'karaoke' }));
    const ball = l.group.children.find((o) => !o.userData['glyph'])!;
    let prev: number | undefined, worst = 0;
    for (let t = 1.3; t < 2.8; t += 1 / 30) {
      l.update(t, fx);
      if (prev !== undefined) worst = Math.max(worst, Math.abs(ball.position.y - prev));
      prev = ball.position.y;
    }
    expect(worst).toBeLessThan(40);
    expect(ball.position.y).toBeLessThan(-150);
  });

  it('karaoke: down a column the ball runs beside the characters, never over them', async () => {
    const l0 = layer();
    const gs = l0.group.children as THREE.Mesh[];
    const update = l0.update;
    l0.update = (t, f) => (update(t, f), gs.forEach((g, i) => g.position.set(0, -i * 50, 0)));
    const l = withTextFx(l0, runtime({ enter: 'karaoke' }));
    const ball = l.group.children.find((o) => !o.userData['glyph'])!;
    for (const t of [1.5, 2.0, 2.5]) {
      l.update(t, fx);
      expect(ball.position.x).toBeGreaterThan(25);
    }
  });

  it('shatter: each glyph breaks into wedges that fly apart; scrubbed back it is whole', async () => {
    const { l, glyphs } = await wrapped({ exit: 'shatter' });
    l.update(2, fx);
    l.update(3.4, fx);
    const parts = glyphs[0].children as THREE.Mesh[];
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(glyphs[0].material.opacity).toBe(0);
    expect(parts.every((p) => p.visible && p.position.length() > 5)).toBe(true);
    expect(parts.every((p) => (p.material as THREE.MeshBasicMaterial).clippingPlanes!.length === 2)).toBe(true);
    l.update(2, fx);
    expect(parts.every((p) => !p.visible)).toBe(true);
    expect(glyphs[0].material.opacity).toBe(1);
  });

  it('shatter: each song breaks its own glass (shard count from the song)', async () => {
    const counts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((song) => {
      const l = withTextFx(layer(), { ...runtime({ exit: 'shatter' }), song } as CueRuntime);
      return (l.group.children[0] as THREE.Mesh).children.length;
    }));
    expect(counts.size).toBeGreaterThan(1);
  });

  it('slice and slash take each song\'s own reach and angle', async () => {
    const sliceAt = (song: number) => {
      const l = withTextFx(layer(), { ...runtime({ enter: 'slice' }), song } as CueRuntime);
      l.update(1.02, fx);
      return +(l.group.children[0] as THREE.Mesh).position.x.toFixed(3);
    };
    const bladeAt = (song: number) => {
      const l = withTextFx(layer(), { ...runtime({ exit: 'slash' }), song } as CueRuntime);
      l.update(3.2, fx);
      return +l.group.children.filter((o) => !o.userData['glyph'])[1].rotation.z.toFixed(3);
    };
    expect(new Set([1, 22, 333, 4444].map(sliceAt)).size).toBeGreaterThan(1);
    expect(new Set([1, 22, 333, 4444, 55555].map(bladeAt)).size).toBeGreaterThan(1);
    expect(sliceAt(22)).toBe(sliceAt(22));
  });

  it('shine sweeps a band of light over the word; faces flicks through other typefaces, then lands in its own', async () => {
    const l = withTextFx(layer(), { ...runtime({ emphasis: [{ from: 0, to: 2, method: 'shine' }] }), fonts: { display: 'a', body: 'b', script: 'c' } } as unknown as CueRuntime);
    const glow = (l.group.children[0] as THREE.Mesh).children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    l.update(1.3, fx);
    expect(glow.material.opacity).toBeGreaterThan(0.5);
    expect(glow.material.clippingPlanes!.length).toBe(2);
    // (the white copy is a copy, read as interference by the ink gate, never as a glyph of its own: review 2026-11-13)
    expect([glow.userData['copy'], glow.userData['part']]).toEqual([true, 'copy']);
    l.update(2.3, fx);
    expect(glow.material.opacity).toBe(0);
    const f = withTextFx(layer(), { ...runtime({ emphasis: [{ from: 0, to: 1, method: 'faces' }] }), fonts: { display: 'a', body: 'b', script: 'c' } } as unknown as CueRuntime);
    const g0 = f.group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    const own = g0.material.map;
    f.update(1.05, fx);
    f.update(1.15, fx);
    const mid = g0.material.map;
    f.update(3, fx);
    expect(g0.material.map).toBe(own);
    expect(mid).not.toBe(own);
  });

  it('echo fans outlined copies out behind the word; weight swaps in heavier pictures', async () => {
    const ec = await wrapped({ emphasis: [{ from: 0, to: 1, method: 'echo' }] });
    ec.l.update(2, fx);
    const copies = ec.glyphs[0].children;
    expect(copies.length).toBeGreaterThanOrEqual(3);
    expect(copies[3].position.x).toBeGreaterThan(copies[0].position.x);
    expect(ec.glyphs[1].children.length).toBe(0);
    const wt = await wrapped({ emphasis: [{ from: 0, to: 1, method: 'weight' }] });
    wt.l.update(1.05, fx);
    const thin = wt.glyphs[0].material.map;
    wt.l.update(2, fx);
    expect(wt.glyphs[0].material.map).not.toBe(thin);
  });

  it('does not compound over frames when the template leaves scale alone (a focus line grew to fill the frame)', async () => {
    const l0 = layer();
    // a template that sets position and opacity but never scale
    const glyphs = l0.group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
    const noScale = { ...l0, update: (t: number) => glyphs.forEach((m, i) => { m.position.set(i * 50, 0, 0); m.material.opacity = t >= 1 ? 1 : 0; }) };
    const l = withTextFx(noScale, runtime({ enter: 'stretch' }));
    for (let t = 1; t < 1.3; t += 1 / 30) l.update(t, fx);
    l.update(2, fx);
    expect(glyphs[0].scale.y).toBeCloseTo(1);
  });
});

describe('tracking-out and the sung fill', () => {
  const gap = (gs: THREE.Mesh[]) => gs[1].position.x - gs[0].position.x;

  it('track: the spacing opens evenly about the line centre over its life, never before it shows', async () => {
    const { l, glyphs } = await wrapped({ idle: 'track' });
    l.update(1, fx);
    expect(gap(glyphs)).toBeCloseTo(50);
    l.update(2, fx);
    const mid = gap(glyphs);
    l.update(2.99, fx);
    const late = gap(glyphs);
    expect(mid).toBeGreaterThan(50);
    expect(late).toBeGreaterThan(mid);
    // bounded, and even: both gaps the same, the middle character where it was
    expect(late).toBeLessThanOrEqual(50 * (1 + 0.22) + 1e-6);
    expect(glyphs[2].position.x - glyphs[1].position.x).toBeCloseTo(late);
    expect(glyphs[1].position.x).toBeCloseTo(50);
  });

  it('track: measured at rest the line stands at its widest, so the fit holds the open line', async () => {
    const { measureAtRest } = await import('./runtime');
    const { l, glyphs } = await wrapped({ idle: 'track' });
    l.update(3.2, fx);
    const widest = gap(glyphs);
    measureAtRest(() => l.update(1.2, fx));
    expect(gap(glyphs)).toBeCloseTo(widest);
  });

  it('track: a column opens top to bottom', async () => {
    const l0 = layer();
    const gs = l0.group.children as THREE.Mesh[];
    const update = l0.update;
    l0.update = (t, f) => (update(t, f), gs.forEach((g, i) => g.position.set(0, -i * 50, 0)));
    const l = withTextFx(l0, runtime({ idle: 'track' }));
    l.update(2.9, fx);
    expect(gs[0].position.y - gs[1].position.y).toBeGreaterThan(55);
    expect(gs.every((g) => g.position.x === 0)).toBe(true);
  });

  /** A glyph's fill uniforms as the sungFill shader reads them (material-patch.ts FillUniforms). */
  type FillUniforms = { uFillDir: { value: THREE.Vector2 }; uFillEdge: { value: number }; uFillInk: { value: THREE.Color }; uFillOrigin: { value: THREE.Vector2 }; uFillSize: { value: THREE.Vector2 } };
  /** Whether the point (u, v) of this mesh's picture is drawn in the fill ink now (the sungFill shader's own test). */
  const filled = (m: THREE.Object3D, u: number, v: number) => {
    const f = m.userData['fill'] as FillUniforms | undefined;
    if (!f?.uFillDir) return false;
    const [x, y] = [f.uFillOrigin.value.x + (u - 0.5) * f.uFillSize.value.x, f.uFillOrigin.value.y + (v - 0.5) * f.uFillSize.value.y];
    return x * f.uFillDir.value.x + y * f.uFillDir.value.y < f.uFillEdge.value;
  };
  const timed = (style: Partial<CueStyle>) => ({ ...runtime(style), cue: { text: TEXT, start: 1, end: 3, charTimed: true, charStarts: [1.2, 1.6, 2.4] }, palette: { accent: '#ff0000', background: '#ffffff', text: '#222222' } }) as unknown as CueRuntime;
  /** The test layer with each glyph's place reset after the template's own (a column, a turned glyph). */
  const placed = (at: (g: THREE.Mesh, i: number) => void) => {
    const l0 = layer();
    const gs = l0.group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
    const update = l0.update;
    l0.update = (t, f) => (update(t, f), gs.forEach(at));
    return { l0, gs };
  };

  it('fill: the line reads whole in its own ink; its own picture takes a key ink left to right as each character is sung', async () => {
    const l0 = layer();
    (l0.group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]).forEach((m) => m.material.color.set('#222222'));
    const l = withTextFx(l0, timed({ idle: 'fill' }));
    const glyphs = l.group.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
    // one picture per character, no copy laid over it (a copy is cut out of the reading glyph's clean zone)
    expect(glyphs.every((g) => g.children.length === 0)).toBe(true);
    expect(glyphs.every((g) => g.material.customProgramCacheKey().includes('sung-fill'))).toBe(true);
    l.update(1.1, fx);
    // nothing waits pale: every character is at full ink before any is sung, and none is filled yet
    expect(glyphs.map((g) => g.material.opacity)).toEqual([1, 1, 1]);
    expect(glyphs.some((g) => filled(g, 0.01, 0.5))).toBe(false);
    // a quarter through the first character's time (1.2 → 1.6): its left quarter of the 30 px advance, nothing more
    l.update(1.3, fx);
    expect([filled(glyphs[0], 0.2, 0.5), filled(glyphs[0], 0.3, 0.5), filled(glyphs[1], 0.01, 0.5)]).toEqual([true, false, false]);
    expect(glyphs.map((g) => g.material.opacity)).toEqual([1, 1, 1]);
    // the second is whole by the third's sung time, the third not begun
    l.update(2.4, fx);
    expect([filled(glyphs[1], 0.99, 0.5), filled(glyphs[2], 0.01, 0.5)]).toEqual([true, false]);
    // the fill ink reads on the paper and stands apart from the body ink
    const { contrast } = await import('../contrast');
    const ink = (glyphs[0].userData['fill'] as FillUniforms).uFillInk.value.getHexString();
    expect(contrast(`#${ink}`, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ink).not.toBe('222222');
  });

  it('fill: a column fills from the top down; a karaoke entrance takes no fill', async () => {
    const { l0, gs } = placed((g, i) => g.position.set(0, -i * 50, 0));
    const l = withTextFx(l0, timed({ idle: 'fill' }));
    l.update(1.3, fx);
    // a quarter of the 40 px em, from the top (v = 1 is the picture's top)
    expect([filled(gs[0], 0.5, 0.8), filled(gs[0], 0.5, 0.7), filled(gs[0], 0.01, 0.5)]).toEqual([true, false, false]);
    const k = withTextFx(layer(), runtime({ enter: 'karaoke', idle: 'fill' }));
    expect((k.group.children as THREE.Mesh[]).every((g) => !g.userData['fill'])).toBe(true);
  });

  it('fill: a glyph turned a quarter in a vertical run (Latin) still fills down the screen, across its own advance', async () => {
    // turned −90°: the glyph's own +x runs down the screen, its own +y to the right
    const { l0, gs } = placed((g, i) => (g.position.set(0, -i * 50, 0), (g.rotation.z = -Math.PI / 2)));
    const l = withTextFx(l0, timed({ idle: 'fill' }));
    l.update(1.3, fx);
    // its top on screen is its own left: a quarter of its 30 px advance there is filled, its screen-right side is not
    expect([filled(gs[0], 0.2, 0.5), filled(gs[0], 0.3, 0.5), filled(gs[0], 0.5, 0.95)]).toEqual([true, false, false]);
  });

  it('fill: a glyph split into strokes (pieces) fills through every piece, each placed in the glyph', async () => {
    const l0 = layer();
    const g0 = l0.group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    // two strokes, left and right halves of the 30 px glyph; the glyph itself draws nothing
    const pieces = [-7.5, 7.5].map((x) => {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(15, 40), new THREE.MeshBasicMaterial({ map: new THREE.Texture(), transparent: true }));
      pm.position.set(x, 0, 0);
      pm.userData['home'] = [x, 0];
      g0.add(pm);
      return pm;
    });
    g0.userData['pieces'] = pieces;
    const l = withTextFx(l0, timed({ idle: 'fill' }));
    expect(pieces.every((p) => p.material.customProgramCacheKey().includes('sung-fill'))).toBe(true);
    l.update(1.3, fx);
    // the fill edge at −7.5 px: the left stroke's left half, the right stroke not at all
    expect([filled(pieces[0], 0.4, 0.5), filled(pieces[0], 0.6, 0.5), filled(pieces[1], 0.01, 0.5)]).toEqual([true, false, false]);
  });
});
