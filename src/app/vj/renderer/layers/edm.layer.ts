import { BlurFilter, Container, Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import { ParticleSystem } from '../particle-system';
import { CENTER_X, CENTER_Y, FrameContext, lerp, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { BaseLayer, centeredSprite, fullRect, LayerDeps } from './vj-layer';

const TUNNEL_RINGS = 14;
const GRID_H_LINES = 16;
const GRID_V_LINES = 25;
const BAR_COUNT = 48;
const HORIZON = 600;

/**
 * EDM: dark neon geometry with a blurred "bloom" copy.
 * bass → scale pulse, strong onset → white flash, treble → sparks, energy → bloom + shake.
 */
export class EdmLayer extends BaseLayer {
  private readonly stage = new Container();
  private readonly sharp = new Container();
  private readonly glow = new Container();
  private readonly sparks: ParticleSystem;
  private readonly flash = fullRect(0xffffff, 0);
  private readonly haze: Sprite;
  private readonly shapeContext?: GraphicsContext;
  /** Pairs of [sharp, glow] display objects driven identically. */
  private readonly items: [Container, Container][] = [];
  private flashLevel = 0;
  private travel = 0;

  constructor(deps: LayerDeps) {
    super(deps);
    const { textures } = deps;
    this.view.addChild(fullRect(this.color(0)));
    this.haze = centeredSprite(textures.glow, CENTER_X, CENTER_Y, this.color(1));
    this.haze.scale.set(18, 12);
    this.haze.alpha = 0.18;
    this.haze.blendMode = 'add';
    this.view.addChild(this.haze);

    this.stage.pivot.set(CENTER_X, CENTER_Y);
    this.stage.position.set(CENTER_X, CENTER_Y);
    this.glow.filters = [new BlurFilter({ strength: 14, quality: 3, resolution: 0.5 })];
    this.glow.blendMode = 'add';
    this.stage.addChild(this.glow, this.sharp);
    this.view.addChild(this.stage);

    if (this.preset === 'tunnel') {
      const sides = [3, 4, 6, 8][this.variant];
      const pts: number[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
        pts.push(Math.cos(a) * 100, Math.sin(a) * 100);
      }
      this.shapeContext = new GraphicsContext().poly(pts).stroke({ width: 3, color: 0xffffff });
      for (let i = 0; i < TUNNEL_RINGS; i++) this.addPair(() => this.ring(i));
    } else if (this.preset === 'grid') {
      const sun = () => centeredSprite(textures.glow, CENTER_X, HORIZON - 80, this.color(3));
      this.addPair(sun);
      for (let i = 0; i < GRID_H_LINES * 2; i++) this.addPair(() => this.line(0.5, 0.5, this.color(1)));
      for (let i = 0; i < GRID_V_LINES; i++) this.addPair(() => this.line(0.5, 0, this.color(2)));
    } else {
      this.shapeContext = new GraphicsContext().poly([0, -420, 420, 0, 0, 420, -420, 0]).stroke({ width: 4, color: 0xffffff });
      this.addPair(() => this.shape(this.color(3)));
      for (let i = 0; i < BAR_COUNT; i++) this.addPair(() => this.line(0.5, 0.5, i % 2 ? this.color(1) : this.color(2)));
    }

    this.sparks = new ParticleSystem(textures.glow, 240, 'add');
    this.view.addChild(this.sparks.view, this.flash);
    this.flash.blendMode = 'add';
  }

  private addPair(make: () => Container): void {
    const a = make();
    const b = make();
    this.sharp.addChild(a);
    this.glow.addChild(b);
    this.items.push([a, b]);
  }

  private ring(i: number): Graphics {
    const g = this.shape(i % 2 ? this.color(1) : this.color(2));
    g.position.set(CENTER_X, CENTER_Y);
    return g;
  }

  private shape(tint: number): Graphics {
    const g = new Graphics(this.shapeContext);
    g.position.set(CENTER_X, CENTER_Y);
    g.tint = tint;
    return g;
  }

  private line(ax: number, ay: number, tint: number): Sprite {
    const s = new Sprite(Texture.WHITE);
    s.anchor.set(ax, ay);
    s.tint = tint;
    return s;
  }

  private each(fn: (item: Container, index: number) => void): void {
    this.items.forEach(([a, b], i) => {
      fn(a, i);
      b.position.copyFrom(a.position);
      b.scale.copyFrom(a.scale);
      b.rotation = a.rotation;
      b.alpha = a.alpha;
      b.visible = a.visible;
      if (a instanceof Sprite && b instanceof Sprite) {
        b.width = a.width;
        b.height = a.height;
      }
    });
  }

  update(ctx: FrameContext): void {
    const { dt, time, bass, energy, treble, beatPulse, intensity } = ctx;
    this.travel += dt * this.speed * (0.25 + energy * 0.6);

    if (this.preset === 'tunnel') this.updateTunnel(ctx);
    else if (this.preset === 'grid') this.updateGrid(ctx);
    else this.updateBars(ctx);

    const pulse = 1 + bass * 0.07 * intensity + beatPulse * 0.04;
    this.stage.scale.set(pulse);
    const shake = energy > 0.75 ? (energy - 0.75) * 40 : 0;
    this.stage.position.set(CENTER_X + Math.sin(time * 53) * shake, CENTER_Y + Math.cos(time * 47) * shake);
    this.glow.alpha = 0.35 + energy * 0.65;
    this.haze.alpha = 0.1 + bass * 0.25;

    const count = this.sparks.emitCount(treble * treble * 90 * intensity, dt);
    for (let i = 0; i < count; i++) {
      const p = this.sparks.spawn();
      if (!p) break;
      const a = this.rand(0, Math.PI * 2);
      const v = this.rand(500, 1400);
      p.x = CENTER_X + Math.cos(a) * 60;
      p.y = CENTER_Y + Math.sin(a) * 60;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.life = this.rand(0.5, 1.1);
      p.scale = this.rand(0.1, 0.3);
      p.scaleEnd = p.scale * 0.3;
      p.tint = this.deps.rng() > 0.5 ? this.color(2) : this.color(3);
    }
    this.sparks.update(dt);

    if (ctx.hit > 0) this.flashLevel = Math.max(this.flashLevel, ctx.hit);
    this.flash.alpha = this.flashLevel * 0.85;
    this.flashLevel *= Math.exp(-dt / 0.07);
  }

  private updateTunnel({ time, bass, energy }: FrameContext): void {
    const dir = this.variant % 2 ? 1 : -1;
    this.each((g, i) => {
      const depth = (i / TUNNEL_RINGS + this.travel * 0.4) % 1;
      g.scale.set((0.05 + depth ** 2.2 * 13) * (1 + bass * 0.12));
      g.rotation = dir * time * (0.2 + energy * 0.5) + i * 0.18;
      g.alpha = depth < 0.1 ? depth * 10 : Math.sqrt(1 - depth);
    });
  }

  private updateGrid({ bass, mid }: FrameContext): void {
    const floor = STAGE_HEIGHT - HORIZON;
    this.each((s, i) => {
      if (i === 0) {
        s.scale.set(5 + bass * 2.5);
        s.alpha = 0.6 + bass * 0.4;
        return;
      }
      const k = i - 1;
      if (k < GRID_H_LINES * 2) {
        const z = ((k % GRID_H_LINES) / GRID_H_LINES + this.travel) % 1;
        const up = k >= GRID_H_LINES;
        const off = floor * z ** 2.4;
        s.position.set(CENTER_X, up ? HORIZON - 200 - off * 0.6 : HORIZON + off);
        (s as Sprite).width = STAGE_WIDTH;
        (s as Sprite).height = 1 + z * 5;
        s.alpha = z * (up ? 0.35 : 1);
        return;
      }
      const j = k - GRID_H_LINES * 2;
      const x = (j - (GRID_V_LINES - 1) / 2) * 240 + Math.sin(this.travel * 0.7) * mid * 120;
      s.position.set(CENTER_X, HORIZON);
      (s as Sprite).width = 3;
      (s as Sprite).height = Math.hypot(x, floor) + 60;
      s.rotation = -Math.atan2(x, floor);
      s.alpha = 0.8;
    });
  }

  private updateBars({ time, bass, mid, treble, intensity }: FrameContext): void {
    this.each((s, i) => {
      if (i === 0) {
        s.rotation = time * 0.3;
        s.scale.set(0.8 + bass * 0.5);
        s.alpha = 0.5;
        return;
      }
      const k = i - 1;
      const fromCenter = Math.abs(k - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
      const band = fromCenter < 0.33 ? bass : fromCenter < 0.66 ? mid : treble;
      const wobble = 0.55 + 0.45 * Math.sin(time * this.speed * 5 + k * 1.7 + this.variant);
      s.position.set(lerp(80, STAGE_WIDTH - 80, k / (BAR_COUNT - 1)), CENTER_Y);
      (s as Sprite).width = 22;
      (s as Sprite).height = 30 + band * wobble * 880 * intensity;
      s.alpha = 0.9;
    });
  }

  override destroy(): void {
    super.destroy();
    this.shapeContext?.destroy();
  }
}
