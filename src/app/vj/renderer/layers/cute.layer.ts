import { Container, Sprite, TilingSprite } from 'pixi.js';
import { ParticleSystem } from '../particle-system';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { BaseLayer, centeredSprite, fullRect, gradientRect, LayerDeps } from './vj-layer';

/**
 * Cute: pastel kawaii stage.
 * kick → heart/star burst, treble → sparkles, energy → bubble density, beat → background pulse.
 */
export class CuteLayer extends BaseLayer {
  private readonly dots: TilingSprite;
  private readonly bgPulse: Sprite;
  private readonly center = new Container();
  private readonly orbit: Sprite[] = [];
  private readonly hero?: Sprite;
  private readonly bubbles: ParticleSystem;
  private readonly hearts: ParticleSystem;
  private readonly stars: ParticleSystem;
  private readonly sparkles: ParticleSystem;

  constructor(deps: LayerDeps) {
    super(deps);
    const t = deps.textures;
    this.view.addChild(fullRect(this.color(0)), gradientRect(t.fadeV, this.color(1), 0.55, true));

    this.dots = new TilingSprite({ texture: t.dots, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.dots.tint = 0xffffff;
    this.dots.alpha = 0.35;
    this.dots.tileScale.set(this.preset === 'starfield' ? 1.4 : 1);
    this.bgPulse = centeredSprite(t.glow, CENTER_X, CENTER_Y, this.color(1));
    this.bgPulse.blendMode = 'add';
    this.view.addChild(this.dots, this.bgPulse);

    this.bubbles = new ParticleSystem(t.bubble, 90);
    this.view.addChild(this.bubbles.view);

    this.center.position.set(CENTER_X, CENTER_Y);
    this.view.addChild(this.center);
    if (this.preset === 'hearts') {
      this.hero = centeredSprite(t.heart, 0, 0, this.color(1));
      for (let i = 0; i < 10; i++) this.orbit.push(centeredSprite(t.heart, 0, 0, i % 2 ? this.color(2) : 0xffffff));
    } else if (this.preset === 'starfield') {
      this.hero = centeredSprite(t.star, 0, 0, this.color(2));
      for (let i = 0; i < 6; i++) this.orbit.push(centeredSprite(t.star, 0, 0, i % 2 ? this.color(1) : 0xffffff));
    }
    if (this.orbit.length) this.center.addChild(...this.orbit);
    if (this.hero) this.center.addChild(this.hero);

    this.hearts = new ParticleSystem(t.heart, 120);
    this.stars = new ParticleSystem(t.star, 120);
    this.sparkles = new ParticleSystem(t.sparkle, 140, 'add');
    this.view.addChild(this.hearts.view, this.stars.view, this.sparkles.view);
  }

  update(ctx: FrameContext): void {
    const { dt, time, energy, bass, treble, beatPulse, intensity } = ctx;

    this.dots.tilePosition.set(time * 30 * this.speed, time * 18 * this.speed);
    this.bgPulse.scale.set(7 + beatPulse * 2.5);
    this.bgPulse.alpha = 0.08 + beatPulse * 0.22;

    if (this.hero) {
      this.hero.scale.set((this.preset === 'hearts' ? 2.4 : 2) * (1 + beatPulse * 0.18 + bass * 0.08));
      this.hero.rotation = this.preset === 'starfield' ? time * 0.4 : Math.sin(time * 2) * 0.06;
      const radius = (this.preset === 'hearts' ? 340 : 300) + beatPulse * 30;
      this.orbit.forEach((s, i) => {
        const a = (i / this.orbit.length) * Math.PI * 2 + time * 0.5 * this.speed;
        s.position.set(Math.cos(a) * radius, Math.sin(a) * radius * 0.8);
        s.scale.set(0.55 + 0.15 * Math.sin(time * 4 + i));
        s.rotation = Math.sin(time * 3 + i) * 0.3;
      });
    }

    const bubbleRate = (this.preset === 'bubbles' ? 10 : 3) + energy * (this.preset === 'bubbles' ? 30 : 12) * intensity;
    for (let n = this.bubbles.emitCount(bubbleRate, dt); n > 0; n--) {
      const p = this.bubbles.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = STAGE_HEIGHT + 80;
      p.vy = -this.rand(90, 220);
      p.wobble = this.rand(40, 120);
      p.life = this.rand(5, 9);
      p.scale = p.scaleEnd = this.rand(0.3, 1.1);
      p.alpha = 0.9;
      p.twinkle = true;
      p.tint = this.deps.rng() > 0.5 ? 0xffffff : this.color(2);
    }

    if (ctx.beat && (bass > 0.4 || ctx.hit > 0)) this.burst(4 + Math.round((ctx.hit + bass) * 10 * intensity));

    for (let n = this.sparkles.emitCount(treble * 45, dt); n > 0; n--) {
      const p = this.sparkles.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = this.rand(0, STAGE_HEIGHT);
      p.life = this.rand(0.3, 0.8);
      p.scale = this.rand(0.3, 0.9);
      p.scaleEnd = 0.1;
      p.spin = 2;
      p.twinkle = true;
    }

    this.bubbles.update(dt);
    this.hearts.update(dt);
    this.stars.update(dt);
    this.sparkles.update(dt);
  }

  private burst(count: number): void {
    const cx = this.rand(300, STAGE_WIDTH - 300);
    const cy = this.rand(250, STAGE_HEIGHT - 250);
    for (let i = 0; i < count; i++) {
      const p = (i % 2 ? this.hearts : this.stars).spawn();
      if (!p) continue;
      const a = (i / count) * Math.PI * 2 + this.rand(-0.2, 0.2);
      const v = this.rand(350, 750);
      p.x = cx;
      p.y = cy;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.drag = 0.08;
      p.gravity = 250;
      p.spin = this.rand(-4, 4);
      p.life = this.rand(0.9, 1.5);
      p.scale = this.rand(0.25, 0.5);
      p.scaleEnd = 0.1;
      p.tint = [this.color(1), this.color(2), this.color(3)][i % 3];
    }
  }
}
