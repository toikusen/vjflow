import { Graphics, GraphicsContext } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

const RINGS = 14;

/** Polygon rings flying towards the viewer. */
class PolyTunnel extends BaseElement {
  private readonly shape: GraphicsContext;
  private readonly rings: GlowPairs<Graphics>;
  private travel = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    const sides = this.num('sides');
    const pts: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      pts.push(Math.cos(a) * 100, Math.sin(a) * 100);
    }
    const round = this.skin.roundness > 0.5;
    this.shape = new GraphicsContext().poly(pts).stroke({ width: this.skin.lineWidth, color: 0xffffff, join: round ? 'round' : 'miter' });
    this.rings = new GlowPairs(this.view, this.skin);
    for (let i = 0; i < RINGS; i++) {
      this.rings.add(() => {
        const g = new Graphics(this.shape);
        g.position.set(CENTER_X, CENTER_Y);
        g.tint = i % 2 ? this.color(1) : this.color(2);
        return g;
      });
    }
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, time, bass, energy } = ctx;
    this.travel += dt * this.deps.speed * (0.25 + energy * 0.6);
    const spin = this.str('motion') === 'rotate' ? this.num('dir') * time * this.deps.speed * (0.2 + energy * 0.5) : 0;
    const pulse = 1 + bass * 0.12 + this.pulse(ctx) * 0.04;
    this.rings.pairs.forEach(([g], i) => {
      const depth = (i / RINGS + this.travel * 0.4) % 1;
      g.scale.set((0.05 + depth ** 2.2 * 13) * pulse);
      g.rotation = spin + i * this.num('twist');
      g.alpha = (depth < 0.1 ? depth * 10 : Math.sqrt(1 - depth)) * strength;
    });
    this.rings.setGlow((0.35 + energy * 0.65) * this.skin.glow);
    this.rings.sync();
  }

  override destroy(): void {
    super.destroy();
    this.shape.destroy();
  }
}

export const POLY_TUNNEL: ElementDef = {
  id: 'polyTunnel',
  slot: 'figure',
  energy: 0.65,
  traits: ['rotation', 'perspective', 'lines'],
  params: {
    sides: { kind: 'range', min: 3, max: 8, int: true },
    twist: { kind: 'range', min: 0, max: 0.35 },
    motion: { kind: 'choice', options: ['rotate', 'rotate', 'still'] },
    dir: { kind: 'choice', options: ['1', '-1'] },
  },
  create: (d) => new PolyTunnel(d),
};
