import { Sprite } from 'pixi.js';
import { ParticleSystem } from '../particle-system';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { BaseLayer, centeredSprite, fullRect, gradientRect, LayerDeps } from './vj-layer';

const FLARE_STEPS = [0.55, 0.9, 1.25, 1.6, 2.1];

interface Ray {
  sprite: Sprite;
  base: number;
  offset: number;
}

/**
 * Light: dreamy rays, bloom, lens flares and floating dust.
 * bass → light intensity, treble → dust, energy → ray movement.
 */
export class LightLayer extends BaseLayer {
  private readonly sourceX: number;
  private readonly sourceY = -140;
  private readonly source: Sprite;
  private readonly rays: Ray[] = [];
  private readonly bands: Sprite[] = [];
  private readonly flares: Sprite[] = [];
  private readonly halos: ParticleSystem;
  private readonly dust: ParticleSystem;
  private phase = 0;

  constructor(deps: LayerDeps) {
    super(deps);
    const t = deps.textures;
    this.sourceX = CENTER_X + [-420, 0, 380, -200][this.variant];
    this.view.addChild(fullRect(this.color(0)), gradientRect(t.fadeV, this.color(1), 0.75));

    this.source = centeredSprite(t.glow, this.sourceX, this.sourceY, this.color(2));
    this.source.blendMode = 'add';
    this.view.addChild(this.source);

    if (this.preset === 'rays' || this.preset === 'halo') {
      const count = this.preset === 'rays' ? 14 : 7;
      for (let i = 0; i < count; i++) {
        const sprite = new Sprite(t.ray);
        sprite.anchor.set(0.5, 0);
        sprite.position.set(this.sourceX, this.sourceY);
        sprite.width = this.rand(140, 420);
        sprite.height = 1900;
        sprite.blendMode = 'add';
        sprite.tint = i % 3 ? this.color(2) : this.color(3);
        this.view.addChild(sprite);
        this.rays.push({ sprite, base: this.rand(-1, 1), offset: this.rand(0, 10) });
      }
    }
    if (this.preset === 'aurora') {
      for (let i = 0; i < 6; i++) {
        const band = centeredSprite(t.glow, CENTER_X, 260 + i * 110, i % 2 ? this.color(3) : this.color(2));
        band.width = 3200;
        band.height = 260;
        band.blendMode = 'add';
        this.view.addChild(band);
        this.bands.push(band);
      }
    }

    this.halos = new ParticleSystem(t.ring, 10, 'add');
    this.view.addChild(this.halos.view);

    FLARE_STEPS.forEach((_, i) => {
      const f = centeredSprite(i % 2 ? t.ring : t.glow, 0, 0, i % 2 ? this.color(3) : this.color(2));
      f.blendMode = 'add';
      f.scale.set(0.4 + (i % 3) * 0.35);
      this.view.addChild(f);
      this.flares.push(f);
    });

    this.dust = new ParticleSystem(t.glow, 180, 'add');
    this.view.addChild(this.dust.view);
  }

  update(ctx: FrameContext): void {
    const { dt, time, energy, bass, treble, beatPulse, intensity } = ctx;
    this.phase += dt * (0.08 + energy * 0.7) * this.speed;

    this.source.scale.set(9 + bass * 6);
    this.source.alpha = 0.45 + bass * 0.55;

    for (const r of this.rays) {
      r.sprite.rotation = r.base + Math.sin(this.phase + r.offset) * 0.18;
      r.sprite.alpha = (0.12 + bass * 0.45 * intensity) * (0.7 + 0.3 * Math.sin(time * 1.3 + r.offset));
    }

    this.bands.forEach((b, i) => {
      b.y = 260 + i * 110 + Math.sin(this.phase * 1.5 + i) * 70;
      b.rotation = Math.sin(this.phase + i * 0.7) * 0.08;
      b.alpha = 0.18 + energy * 0.3;
    });

    if (this.preset === 'halo' && ctx.beat && ctx.beatIndex % 2 === 0) {
      const p = this.halos.spawn();
      if (p) {
        p.x = CENTER_X;
        p.y = CENTER_Y;
        p.life = 3;
        p.scale = 0.6;
        p.scaleEnd = 7;
        p.alpha = 0.3 + bass * 0.5;
        p.tint = this.color(2);
      }
    }
    this.halos.update(dt);

    const dx = CENTER_X - this.sourceX;
    const dy = CENTER_Y - this.sourceY;
    this.flares.forEach((f, i) => {
      f.position.set(this.sourceX + dx * FLARE_STEPS[i], this.sourceY + dy * FLARE_STEPS[i]);
      f.alpha = (0.08 + bass * 0.3 + beatPulse * 0.05) * (i % 2 ? 0.8 : 0.5);
    });

    for (let n = this.dust.emitCount(6 + treble * 70, dt); n > 0; n--) {
      const p = this.dust.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = this.rand(STAGE_HEIGHT * 0.2, STAGE_HEIGHT + 20);
      p.vx = this.rand(-15, 15);
      p.vy = -this.rand(10, 45);
      p.wobble = this.rand(10, 30);
      p.life = this.rand(3, 7);
      p.scale = p.scaleEnd = this.rand(0.03, 0.12);
      p.alpha = this.rand(0.5, 1);
      p.twinkle = true;
      p.tint = this.color(2);
    }
    this.dust.update(dt);
  }
}
