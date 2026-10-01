import { Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext, lerp, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

/** Spectrum-analyzer bars (bass in the middle or on the left), with an optional spinning diamond behind. */
class SpectrumBars extends BaseElement {
  private readonly diamondShape?: GraphicsContext;
  private readonly diamond?: Graphics;
  private readonly bars: GlowPairs<Sprite>;
  private readonly count: number;

  constructor(deps: ElementDeps) {
    super(deps);
    this.count = this.num('count');
    const items = new GlowPairs<Graphics | Sprite>(this.view, this.skin);
    if (this.str('diamond') === 'on') {
      this.diamondShape = new GraphicsContext().poly([0, -420, 420, 0, 0, 420, -420, 0]).stroke({ width: this.skin.lineWidth + 1, color: 0xffffff });
      this.diamond = items.add(() => {
        const g = new Graphics(this.diamondShape);
        g.position.set(CENTER_X, CENTER_Y);
        g.tint = this.color(3);
        return g;
      }) as Graphics;
    }
    this.bars = items as GlowPairs<Sprite>;
    for (let i = 0; i < this.count; i++) {
      items.add(() => {
        const s = new Sprite(Texture.WHITE);
        s.anchor.set(0.5);
        s.tint = i % 2 ? this.color(1) : this.color(2);
        return s;
      });
    }
  }

  update(ctx: FrameContext, strength: number): void {
    const { time, bass, mid, treble, energy, intensity } = ctx;
    if (this.diamond) {
      this.diamond.rotation = time * 0.3 * this.deps.speed;
      this.diamond.scale.set(0.8 + bass * 0.5);
      this.diamond.alpha = 0.5 * strength;
    }
    const mirrored = this.str('layout') === 'mirror';
    this.bars.pairs.slice(this.diamond ? 1 : 0).forEach(([s], k) => {
      const pos = mirrored ? Math.abs(k - (this.count - 1) / 2) / (this.count / 2) : k / this.count;
      const band = pos < 0.33 ? bass : pos < 0.66 ? mid : treble;
      const wobble = 0.55 + 0.45 * Math.sin(time * this.deps.speed * 5 + k * 1.7);
      s.position.set(lerp(80, STAGE_WIDTH - 80, k / (this.count - 1)), CENTER_Y);
      s.width = Math.max(4, (STAGE_WIDTH / this.count) * 0.45);
      s.height = 30 + band * wobble * 880 * intensity * (0.4 + 0.6 * strength);
      s.alpha = 0.9 * strength;
    });
    this.bars.setGlow((0.35 + energy * 0.65) * this.skin.glow);
    this.bars.sync();
  }

  override destroy(): void {
    super.destroy();
    this.diamondShape?.destroy();
  }
}

export const SPECTRUM_BARS: ElementDef = {
  id: 'spectrumBars',
  slot: 'figure',
  energy: 0.9,
  traits: ['blocky'],
  params: {
    count: { kind: 'range', min: 32, max: 64, int: true },
    layout: { kind: 'choice', options: ['mirror', 'linear'] },
    diamond: { kind: 'choice', options: ['on', 'off'] },
  },
  create: (d) => new SpectrumBars(d),
};
