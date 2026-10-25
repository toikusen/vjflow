import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CueStyle } from '../treatment';
import type { CueLayer, CueRuntime } from './runtime';

// no canvas here: every 2D call is a no-op; the template's own pictures are named after their characters
beforeAll(() => {
  const metrics = { width: 30, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 6, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 30 };
  const stub = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, k) => (k === 'measureText' ? () => metrics : k === 'getImageData' ? (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : () => ({ addColorStop: () => undefined })),
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = (() => stub) as never;
});

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
  const { withTextFx } = await import('./text-fx');
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
    const { withTextFx } = await import('./text-fx');
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
    const { withTextFx } = await import('./text-fx');
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
    const { withTextFx } = await import('./text-fx');
    const counts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((song) => {
      const l = withTextFx(layer(), { ...runtime({ exit: 'shatter' }), song } as CueRuntime);
      return (l.group.children[0] as THREE.Mesh).children.length;
    }));
    expect(counts.size).toBeGreaterThan(1);
  });

  it('slice and slash take each song\'s own reach and angle', async () => {
    const { withTextFx } = await import('./text-fx');
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
    const { withTextFx } = await import('./text-fx');
    const l = withTextFx(layer(), { ...runtime({ emphasis: [{ from: 0, to: 2, method: 'shine' }] }), fonts: { display: 'a', body: 'b', script: 'c' } } as unknown as CueRuntime);
    const glow = (l.group.children[0] as THREE.Mesh).children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    l.update(1.3, fx);
    expect(glow.material.opacity).toBeGreaterThan(0.5);
    expect(glow.material.clippingPlanes!.length).toBe(2);
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
    const { withTextFx } = await import('./text-fx');
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
