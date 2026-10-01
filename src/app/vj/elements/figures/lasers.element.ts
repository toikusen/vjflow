import { Sprite, Texture } from 'pixi.js';
import { FrameContext, lerp, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

interface Beam {
  base: number;
  phase: number;
}

/** Club lasers: beams fanning out of fixed sources and sweeping; each beat flips the sweep. */
class Lasers extends BaseElement {
  private readonly beams: GlowPairs<Sprite>;
  private readonly meta: Beam[] = [];
  private readonly origins: [number, number][];
  private sweep = 0;
  private direction = 1;

  constructor(deps: ElementDeps) {
    super(deps);
    const count = this.num('count');
    this.origins =
      this.str('origin') === 'corners'
        ? [
            [80, STAGE_HEIGHT + 20],
            [STAGE_WIDTH - 80, STAGE_HEIGHT + 20],
          ]
        : [[STAGE_WIDTH / 2, STAGE_HEIGHT + 20]];
    this.beams = new GlowPairs(this.view, this.skin);
    for (let i = 0; i < count; i++) {
      const fan = count > 1 ? i / (count - 1) - 0.5 : 0;
      this.meta.push({ base: fan * this.num('spread'), phase: this.rand(0, Math.PI * 2) });
      this.beams.add(() => {
        const s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5, 1);
        s.height = 2400;
        s.tint = i % 2 ? this.color(1) : this.color(3);
        return s;
      });
    }
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, energy, treble } = ctx;
    if (ctx.beat) this.direction = -this.direction;
    this.sweep = lerp(this.sweep, this.direction, 1 - Math.exp(-dt * 3 * this.deps.speed));
    const flicker = 0.75 + 0.25 * this.pulse(ctx);
    this.beams.pairs.forEach(([s], i) => {
      const m = this.meta[i];
      const [x, y] = this.origins[i % this.origins.length];
      const mirror = x > STAGE_WIDTH * 0.6 ? -1 : 1;
      s.position.set(x, y);
      s.rotation = mirror * (m.base + this.sweep * 0.35 + Math.sin(ctx.time * 0.6 * this.deps.speed + m.phase) * 0.08);
      s.width = this.skin.lineWidth * 2.5 * (1 + treble * 1.5);
      s.alpha = (0.35 + energy * 0.65) * flicker * strength;
    });
    this.beams.setGlow((0.5 + energy * 0.5) * this.skin.glow);
    this.beams.sync();
  }
}

export const LASERS: ElementDef = {
  id: 'lasers',
  slot: 'figure',
  energy: 0.6,
  traits: ['lines', 'sharp'],
  params: {
    count: { kind: 'range', min: 4, max: 10, int: true },
    spread: { kind: 'range', min: 0.8, max: 1.8 },
    origin: { kind: 'choice', options: ['bottom', 'corners'] },
  },
  create: (d) => new Lasers(d),
};
