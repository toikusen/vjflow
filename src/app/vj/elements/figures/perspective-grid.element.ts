import { Sprite, Texture } from 'pixi.js';
import { CENTER_X, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { centeredSprite } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

const V_LINES = 25;

/** Synthwave floor (and mirrored ceiling) scrolling towards a horizon, with an optional sun. */
class PerspectiveGrid extends BaseElement {
  private readonly lines: GlowPairs<Sprite>;
  private readonly sun?: Sprite;
  private readonly hLines: number;
  private readonly horizon: number;
  private travel = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.hLines = this.num('density');
    this.horizon = this.num('horizon');
    this.lines = new GlowPairs(this.view, this.skin);
    if (this.str('sun') === 'on') this.sun = this.lines.add(() => centeredSprite(deps.textures.glow, CENTER_X, this.horizon - 80, this.color(3)));
    const line = (ay: number, tint: number) => () => {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5, ay);
      s.tint = tint;
      return s;
    };
    for (let i = 0; i < this.hLines * 2; i++) this.lines.add(line(0.5, this.color(1)));
    for (let i = 0; i < V_LINES; i++) this.lines.add(line(0, this.color(2)));
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, bass, mid, energy } = ctx;
    this.travel += dt * this.deps.speed * (0.25 + energy * 0.6);
    const floor = STAGE_HEIGHT - this.horizon;
    const width = this.skin.lineWidth;
    const offset = this.sun ? 1 : 0;
    if (this.sun) {
      this.sun.scale.set(5 + bass * 2.5);
      this.sun.alpha = (0.6 + bass * 0.4) * strength;
    }
    this.lines.pairs.slice(offset).forEach(([s], k) => {
      if (k < this.hLines * 2) {
        const z = ((k % this.hLines) / this.hLines + this.travel) % 1;
        const up = k >= this.hLines;
        const off = floor * z ** 2.4;
        s.position.set(CENTER_X, up ? this.horizon - 200 - off * 0.6 : this.horizon + off);
        s.width = STAGE_WIDTH;
        s.height = width * (0.3 + z * 1.7);
        s.alpha = z * (up ? 0.35 : 1) * strength;
        return;
      }
      const j = k - this.hLines * 2;
      const x = (j - (V_LINES - 1) / 2) * 240 + Math.sin(this.travel * 0.7) * mid * 120;
      s.position.set(CENTER_X, this.horizon);
      s.width = width;
      s.height = Math.hypot(x, floor) + 60;
      s.rotation = -Math.atan2(x, floor);
      s.alpha = 0.8 * strength;
    });
    this.lines.setGlow((0.35 + energy * 0.65) * this.skin.glow);
    this.lines.sync();
  }
}

export const PERSPECTIVE_GRID: ElementDef = {
  id: 'perspectiveGrid',
  slot: 'figure',
  energy: 0.4,
  traits: ['perspective', 'lines'],
  params: {
    density: { kind: 'range', min: 12, max: 20, int: true },
    horizon: { kind: 'range', min: 520, max: 680 },
    sun: { kind: 'choice', options: ['on', 'off'] },
  },
  create: (d) => new PerspectiveGrid(d),
};
