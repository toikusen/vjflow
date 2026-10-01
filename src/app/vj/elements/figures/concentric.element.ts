import { Graphics, GraphicsContext } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

/** Ripples: rings expanding outwards from the center, pushed by the bass. No spin, no depth. */
class Concentric extends BaseElement {
  private readonly shape: GraphicsContext;
  private readonly rings: GlowPairs<Graphics>;
  private travel = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    const sides = this.num('sides');
    const width = this.skin.lineWidth;
    this.shape =
      sides < 3
        ? new GraphicsContext().circle(0, 0, 100).stroke({ width, color: 0xffffff })
        : new GraphicsContext()
            .poly(Array.from({ length: sides * 2 }, (_, k) => (k % 2 ? Math.sin : Math.cos)((Math.floor(k / 2) / sides) * Math.PI * 2) * 100))
            .stroke({ width, color: 0xffffff, join: this.skin.roundness > 0.5 ? 'round' : 'miter' });
    this.rings = new GlowPairs(this.view, this.skin);
    for (let i = 0; i < this.num('count'); i++) {
      this.rings.add(() => {
        const g = new Graphics(this.shape);
        g.position.set(CENTER_X, CENTER_Y);
        g.tint = [this.color(1), this.color(2), this.color(3)][i % 3];
        return g;
      });
    }
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, bass, energy } = ctx;
    this.travel += dt * this.deps.speed * (0.08 + bass * 0.25);
    const n = this.rings.pairs.length;
    const pulse = this.pulse(ctx);
    this.rings.pairs.forEach(([g], i) => {
      const age = (i / n + this.travel) % 1;
      // Rings are born small and bright at the center and fade as they reach the frame edge.
      g.scale.set(0.3 + age * 11 * (1 + pulse * 0.05));
      g.alpha = (age < 0.08 ? age / 0.08 : 1 - age) * strength;
    });
    this.rings.setGlow((0.4 + energy * 0.6) * this.skin.glow);
    this.rings.sync();
  }

  override destroy(): void {
    super.destroy();
    this.shape.destroy();
  }
}

export const CONCENTRIC: ElementDef = {
  id: 'concentric',
  slot: 'figure',
  energy: 0.35,
  traits: ['organic'],
  params: {
    // < 3 draws circles.
    sides: { kind: 'range', min: 0, max: 8, int: true },
    count: { kind: 'range', min: 5, max: 12, int: true },
  },
  create: (d) => new Concentric(d),
};
