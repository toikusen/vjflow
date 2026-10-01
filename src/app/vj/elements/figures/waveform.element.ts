import { Graphics } from 'pixi.js';
import { CENTER_Y, FrameContext, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, GlowPairs } from '../element';

const POINTS = 160;

/** Horizontal oscilloscope strands: flat, breathing curves instead of depth or spin. */
class Waveform extends BaseElement {
  private readonly strands: GlowPairs<Graphics>;
  private phase = 0;

  constructor(deps: ElementDeps) {
    super(deps);
    this.strands = new GlowPairs(this.view, this.skin);
    for (let i = 0; i < this.num('strands'); i++) this.strands.add(() => new Graphics());
  }

  update(ctx: FrameContext, strength: number): void {
    const { dt, bass, mid, treble, energy } = ctx;
    this.phase += dt * this.deps.speed * (0.8 + energy);
    const n = this.strands.pairs.length;
    const spacing = this.num('spacing');
    const freq = this.num('freq');
    const pulse = this.pulse(ctx);
    const round = this.skin.roundness > 0.5;
    this.strands.pairs.forEach((pair, i) => {
      const offset = (i - (n - 1) / 2) * spacing;
      const amp = (60 + mid * 260 + pulse * 80) * (0.5 + 0.5 * strength) * (1 - Math.abs(offset) / 900);
      const tint = [this.color(1), this.color(2), this.color(3)][i % 3];
      for (const g of pair) {
        if (!g) continue;
        g.clear();
        for (let k = 0; k <= POINTS; k++) {
          const u = k / POINTS;
          // Taper to zero at the edges so strands read as a signal, not a band.
          const envelope = Math.sin(Math.PI * u);
          const y =
            CENTER_Y +
            offset +
            envelope * amp * (Math.sin(u * freq * Math.PI * 2 + this.phase + i * 0.7) * (0.7 + bass * 0.3) + Math.sin(u * freq * 5.3 + this.phase * 1.7) * treble * 0.35);
          if (k === 0) g.moveTo(0, y);
          else g.lineTo(u * STAGE_WIDTH, y);
        }
        g.stroke({ width: this.skin.lineWidth * (i === 0 ? 1.4 : 1), color: tint, cap: round ? 'round' : 'butt', join: round ? 'round' : 'miter' });
        g.alpha = (0.55 + 0.45 * strength) * (1 - i * 0.12);
      }
    });
    this.strands.setGlow((0.4 + energy * 0.6) * this.skin.glow);
  }
}

export const WAVEFORM: ElementDef = {
  id: 'waveform',
  slot: 'figure',
  energy: 0.25,
  traits: ['lines', 'organic'],
  params: {
    strands: { kind: 'range', min: 1, max: 4, int: true },
    spacing: { kind: 'range', min: 60, max: 180 },
    freq: { kind: 'range', min: 1.5, max: 4 },
  },
  create: (d) => new Waveform(d),
};
