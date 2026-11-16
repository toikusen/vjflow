import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stubCanvas2d } from '../testdata/canvas-stub';
import { EMPHASIS_METHODS, ENTER_KINDS, EXIT_KINDS, IDLE_KINDS, type CueStyle } from '../treatment';
import type { CueLayer, CueRuntime } from './runtime';
import { withTextFx } from './text-fx';

// The export renders frames in order; the preview seeks, scrubs back and skips frames when busy. A frame must be a
// function of its time alone, so every drawn effect is rendered here at chosen times four ways (straight seek, played
// in order at 30 fps, after a seek past it and back, after a jump over 0.2 s) and its scene compared, object by object.
let restore: () => void;
beforeAll(() => void (restore = stubCanvas2d()));
afterAll(() => restore());

const TEXT = 'abcd';
const fx = { flash: 0, hit: 0, shake: 0 };

/** A template that sets its glyphs in a row each frame, sliding right (so a trail has motion to follow). */
function layer(): CueLayer {
  const group = new THREE.Group();
  const meshes = [...TEXT].map((char, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), new THREE.MeshBasicMaterial({ map: Object.assign(new THREE.Texture({ width: 30, height: 40 } as unknown as HTMLImageElement), { name: char }), transparent: true }));
    m.userData['glyph'] = { char, index: i, src: i, advance: 30, x: i * 50, y: 0 };
    m.userData['style'] = { size: 40, family: 'x', weight: 700 };
    group.add(m);
    return m;
  });
  return {
    group,
    readable: () => [1.6, 3],
    update: (t) =>
      meshes.forEach((m, i) => {
        m.position.set(i * 50 + Math.max(0, 1.6 - t) * 300, 0, 0);
        m.scale.set(1, 1, 1);
        m.material.opacity = t >= 1 ? 1 : 0;
      }),
  };
}

const runtime = (style: Partial<CueStyle>) =>
  ({ cue: { text: TEXT, start: 1, end: 3 }, style: { enter: 'cut', exit: 'fade', reveal: 'line', ...style }, showFrom: 1, exitAt: 3, exitDur: 0.5, pace: 1, palette: { accent: '#ff0000', background: '#000000', ink: '#ffffff' } }) as unknown as CueRuntime;

/** Everything a frame shows of the layer: per object, whether it is drawn, where, how opaque, and with what picture. */
function scene(l: CueLayer): string[] {
  l.group.updateMatrixWorld(true);
  const out: string[] = [];
  l.group.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    const seen = o.visible && (!m || m.opacity > 0.002);
    out.push(seen ? `${o.matrixWorld.elements.map((x) => x.toFixed(2)).join(',')}|${m ? `${m.opacity.toFixed(3)}|${m.map?.name ?? ''}` : ''}` : '-');
  });
  return out;
}

const ORDERS: Record<string, (t: number) => number[]> = {
  seek: (t) => [t],
  played: (t) => [...Array(Math.round((t - 0.9) * 30)).keys()].map((k) => 0.9 + k / 30).concat(t),
  back: (t) => [t + 0.5, t],
  jump: (t) => [t - 0.25, t],
};
const TIMES = [1.03, 1.2, 1.7, 3.08, 3.3];

/** The rendered scene at t for each order. */
function framesAt(style: Partial<CueStyle>, t: number): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(ORDERS).map(([name, times]) => {
      const l = withTextFx(layer(), runtime(style));
      let last: string[] = [];
      for (const s of times(t)) l.update(s, fx), (last = scene(l));
      return [name, last];
    }),
  );
}

/** The styles a director can give a line, one technique at a time. */
const STYLES: [string, Partial<CueStyle>][] = [
  ...ENTER_KINDS.map((e) => [`enter:${e}`, { enter: e }] as [string, Partial<CueStyle>]),
  ...EXIT_KINDS.map((e) => [`exit:${e}`, { exit: e }] as [string, Partial<CueStyle>]),
  ...IDLE_KINDS.map((e) => [`idle:${e}`, { idle: e }] as [string, Partial<CueStyle>]),
  ...EMPHASIS_METHODS.map((m) => [`emph:${m}`, { emphasis: [{ from: 1, to: 3, method: m }] }] as [string, Partial<CueStyle>]),
  ['trail', { trail: true }],
];

describe('seek order: a frame is a function of its time', () => {
  it.each(STYLES)('%s renders the same by seek, play, back-seek and jump', (_, style) => {
    for (const t of TIMES) {
      const f = framesAt(style, t);
      for (const name of ['played', 'back', 'jump']) expect(f[name], `${name} at ${t}`).toEqual(f['seek']);
    }
  });
});
