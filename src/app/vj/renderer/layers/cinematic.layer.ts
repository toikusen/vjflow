import { Container, Sprite, TilingSprite } from 'pixi.js';
import { ParticleSystem } from '../particle-system';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { BaseLayer, centeredSprite, fullRect, gradientRect, LayerDeps } from './vj-layer';

/** 2.39:1 scope framing inside 16:9. */
const LETTERBOX = Math.round((STAGE_HEIGHT - STAGE_WIDTH / 2.39) / 2);

/**
 * Cinematic: slow dolly camera, light leaks, anamorphic streaks, grain, vignette, letterbox.
 * Deliberately restrained: audio mostly drives exposure and leak intensity, never strobes.
 */
export class CinematicLayer extends BaseLayer {
  private readonly camera = new Container();
  private readonly leaks: Sprite[] = [];
  private readonly streaks: Sprite[] = [];
  private readonly core?: Sprite;
  private readonly exposure = fullRect(0xffffff, 0);
  private readonly grain: TilingSprite;
  private readonly motes: ParticleSystem;

  constructor(deps: LayerDeps) {
    super(deps);
    const t = deps.textures;
    this.camera.pivot.set(CENTER_X, CENTER_Y);
    this.camera.position.set(CENTER_X, CENTER_Y);
    this.camera.addChild(fullRect(this.color(0)), gradientRect(t.fadeV, this.color(3), 0.35, true));

    const leakCount = this.preset === 'leak' ? 3 : 2;
    for (let i = 0; i < leakCount; i++) {
      const leak = centeredSprite(t.glow, this.rand(200, STAGE_WIDTH - 200), this.rand(150, STAGE_HEIGHT - 150), i ? this.color(3) : this.color(1));
      leak.scale.set(this.rand(8, 14), this.rand(6, 10));
      leak.blendMode = 'add';
      this.camera.addChild(leak);
      this.leaks.push(leak);
    }

    if (this.preset === 'anamorphic') {
      this.core = centeredSprite(t.glow, CENTER_X, CENTER_Y, this.color(2));
      this.core.blendMode = 'add';
      [this.color(2), this.color(3)].forEach((tint) => {
        const s = centeredSprite(t.glow, CENTER_X, CENTER_Y, tint);
        s.blendMode = 'add';
        this.streaks.push(s);
      });
      this.camera.addChild(this.core, ...this.streaks);
    }

    this.motes = new ParticleSystem(t.glow, 40, 'add');
    this.camera.addChild(this.motes.view);

    const vignette = new Sprite(t.vignette);
    vignette.width = STAGE_WIDTH;
    vignette.height = STAGE_HEIGHT;
    this.grain = new TilingSprite({ texture: t.grain, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.grain.alpha = 0.07;
    this.exposure.blendMode = 'add';
    const top = fullRect(0x000000);
    top.height = LETTERBOX;
    const bottom = fullRect(0x000000);
    bottom.height = LETTERBOX;
    bottom.y = STAGE_HEIGHT - LETTERBOX;
    this.view.addChild(this.camera, this.exposure, vignette, this.grain, top, bottom);
  }

  update(ctx: FrameContext): void {
    const { dt, time, energy, bass, sceneProgress, intensity } = ctx;
    const dir = this.variant % 2 ? 1 : -1;
    this.camera.scale.set(1.06 + sceneProgress * 0.08);
    this.camera.position.set(CENTER_X + dir * (sceneProgress - 0.5) * 90, CENTER_Y + Math.sin(time * 0.07) * 20);

    this.leaks.forEach((leak, i) => {
      leak.x += Math.sin(time * 0.05 + i * 2) * 12 * dt;
      leak.y += Math.cos(time * 0.04 + i) * 8 * dt;
      const flicker = 0.85 + 0.15 * Math.sin(time * 0.9 + i * 1.7) * Math.sin(time * 0.37 + i);
      leak.alpha = (0.45 + energy * 0.45 * intensity) * flicker;
    });

    if (this.core) {
      this.core.scale.set(2.5 + bass * 2);
      this.core.alpha = 0.3 + energy * 0.5;
      this.streaks.forEach((s, i) => {
        s.width = 2600 + energy * 800;
        s.height = (i ? 6 : 14) + bass * (i ? 10 : 26);
        s.y = CENTER_Y + (i ? 26 : 0);
        s.alpha = (0.5 + energy * 0.5) * (i ? 0.6 : 1);
      });
    }

    this.exposure.alpha = bass * 0.05;
    this.grain.tilePosition.set(this.rand(0, 256), this.rand(0, 256));

    for (let n = this.motes.emitCount(3 + energy * 3, dt); n > 0; n--) {
      const p = this.motes.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = this.rand(LETTERBOX, STAGE_HEIGHT - LETTERBOX);
      p.vx = this.rand(-8, 8);
      p.vy = this.rand(-8, 4);
      p.life = this.rand(4, 8);
      p.scale = p.scaleEnd = this.rand(0.03, 0.08);
      p.alpha = 0.6;
      p.twinkle = true;
      p.tint = this.color(2);
    }
    this.motes.update(dt);
  }
}
