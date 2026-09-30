import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { ParticleSystem } from '../particle-system';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { BaseLayer, fullRect, LayerDeps } from './vj-layer';

const SPEED_LINES = 110;
const IMPACT_DURATION = 0.14;

interface SpeedLine {
  sprite: Sprite;
  angle: number;
  radius: number;
  velocity: number;
}

interface Panel {
  view: Container;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  targetRot: number;
}

/**
 * Anime: abstract manga language — cel bands, halftone, speed lines, panels, impact frames.
 * strong onset → impact frame, energy → speed lines, beat → panel movement.
 */
export class AnimeLayer extends BaseLayer {
  private readonly halftone: TilingSprite;
  private readonly lines: SpeedLine[] = [];
  private readonly lineLayer = new Container();
  private readonly panels: Panel[] = [];
  private readonly burstShape?: Graphics;
  private readonly impact = new Container();
  private readonly impactBurst: Graphics;
  private readonly impactBg = fullRect(0x000000);
  private readonly shards: ParticleSystem;
  private impactTime = 0;
  private lastBeat = -1;

  constructor(deps: LayerDeps) {
    super(deps);
    const t = deps.textures;
    const cel = new Container();
    cel.addChild(fullRect(this.color(0)));
    const band1 = fullRect(this.color(1), 0.55);
    band1.y = STAGE_HEIGHT * 0.55;
    const band2 = fullRect(this.color(1));
    band2.y = STAGE_HEIGHT * 0.78;
    cel.addChild(band1, band2);
    cel.pivot.set(CENTER_X, CENTER_Y);
    cel.position.set(CENTER_X, CENTER_Y);
    cel.rotation = (this.variant % 2 ? 1 : -1) * 0.18;
    cel.scale.set(1.35);
    this.view.addChild(cel);

    this.halftone = new TilingSprite({ texture: t.dots, width: STAGE_WIDTH, height: STAGE_HEIGHT });
    this.halftone.tint = this.color(3);
    this.halftone.alpha = 0.16;
    this.view.addChild(this.halftone);

    if (this.preset === 'panels') this.buildPanels();
    if (this.preset === 'burst') {
      this.burstShape = this.spikes(24, 180, 1300, this.color(2));
      this.burstShape.position.set(CENTER_X, CENTER_Y);
      this.view.addChild(this.burstShape);
    }

    for (let i = 0; i < SPEED_LINES; i++) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0, 0.5);
      sprite.tint = this.preset === 'panels' ? this.color(3) : this.color(2);
      this.lineLayer.addChild(sprite);
      this.lines.push({ sprite, angle: 0, radius: 0, velocity: 0 });
      this.resetLine(this.lines[i], true);
    }
    this.view.addChild(this.lineLayer);

    this.shards = new ParticleSystem(t.sparkle, 80);
    this.view.addChild(this.shards.view);

    this.impactBurst = this.spikes(40, 60, 1400, 0xffffff);
    this.impactBurst.position.set(CENTER_X, CENTER_Y);
    this.impact.addChild(this.impactBg, this.impactBurst);
    this.impact.visible = false;
    this.view.addChild(this.impact);
  }

  private spikes(count: number, inner: number, outer: number, color: number): Graphics {
    const g = new Graphics();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rand(-0.05, 0.05);
      const w = this.rand(0.02, 0.06);
      const r = outer * this.rand(0.7, 1);
      g.poly([Math.cos(a - w) * inner, Math.sin(a - w) * inner, Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + w) * inner, Math.sin(a + w) * inner]);
    }
    return g.fill({ color });
  }

  private buildPanels(): void {
    const layouts = [
      [[40, 40, 1100, 560], [1180, 40, 700, 340], [1180, 420, 700, 620], [40, 640, 1100, 400]],
      [[40, 40, 600, 1000], [680, 40, 1200, 480], [680, 560, 560, 480], [1280, 560, 600, 480]],
    ];
    const fills = [this.color(1), 0xffffff, this.color(0), this.color(2)];
    layouts[this.variant % 2].forEach(([x, y, w, h], i) => {
      const view = new Container();
      const g = new Graphics().rect(0, 0, w, h).fill({ color: fills[i] });
      const dots = new TilingSprite({ texture: this.deps.textures.dots, width: w, height: h });
      dots.tint = 0x000000;
      dots.alpha = 0.18;
      dots.tileScale.set(0.5 + i * 0.15);
      const border = new Graphics().rect(0, 0, w, h).stroke({ width: 12, color: 0x000000 });
      const slash = this.spikes(10, 20, Math.max(w, h), i % 2 ? this.color(1) : 0xffffff);
      slash.position.set(w / 2, h / 2);
      slash.alpha = 0.35;
      const mask = new Graphics().rect(0, 0, w, h).fill({ color: 0xffffff });
      slash.mask = mask;
      view.addChild(g, dots, slash, mask, border);
      view.pivot.set(w / 2, h / 2);
      view.position.set(x + w / 2, y + h / 2);
      this.view.addChild(view);
      this.panels.push({ view, baseX: x + w / 2, baseY: y + h / 2, targetX: 0, targetY: 0, targetRot: 0 });
    });
  }

  private resetLine(line: SpeedLine, scatter: boolean): void {
    line.angle = this.rand(0, Math.PI * 2);
    line.radius = scatter ? this.rand(150, 1200) : this.rand(150, 350);
    line.velocity = this.rand(900, 2200);
    line.sprite.width = this.rand(120, 520);
    line.sprite.height = this.rand(2, 9);
    line.sprite.rotation = line.angle;
  }

  update(ctx: FrameContext): void {
    const { dt, time, energy, bass, mid, beatPulse, intensity } = ctx;
    this.halftone.tilePosition.set(time * 20, time * -12);

    const lineAlpha = Math.max(0, Math.min(1, 0.25 + (energy - 0.15) * 1.8)) * (this.preset === 'panels' ? 0.45 : 1);
    this.lineLayer.alpha = lineAlpha;
    if (lineAlpha > 0) {
      const boost = 0.4 + energy * 1.4;
      for (const line of this.lines) {
        line.radius += line.velocity * boost * dt;
        if (line.radius > 1300) this.resetLine(line, false);
        line.sprite.position.set(CENTER_X + Math.cos(line.angle) * line.radius, CENTER_Y + Math.sin(line.angle) * line.radius);
      }
    }

    if (this.burstShape) {
      this.burstShape.rotation = time * 0.25 * this.speed;
      this.burstShape.scale.set(0.8 + bass * 0.35 + beatPulse * 0.1);
    }

    if (this.panels.length) {
      if (ctx.beatIndex !== this.lastBeat && ctx.beatIndex >= 0) {
        this.lastBeat = ctx.beatIndex;
        const i = ctx.beatIndex % this.panels.length;
        const p = this.panels[i];
        p.targetX = this.rand(-50, 50) * intensity;
        p.targetY = this.rand(-30, 30) * intensity;
        p.targetRot = this.rand(-0.05, 0.05);
      }
      const k = 1 - Math.exp(-dt / 0.12);
      for (const p of this.panels) {
        p.view.x += (p.baseX + p.targetX - p.view.x) * k;
        p.view.y += (p.baseY + p.targetY - p.view.y) * k;
        p.view.rotation += (p.targetRot - p.view.rotation) * k;
      }
    }

    for (let n = this.shards.emitCount(mid * 25 * intensity, dt); n > 0; n--) {
      const p = this.shards.spawn();
      if (!p) break;
      p.x = this.rand(0, STAGE_WIDTH);
      p.y = -40;
      p.vx = this.rand(-200, 200);
      p.vy = this.rand(500, 1000);
      p.spin = this.rand(-6, 6);
      p.life = 1.6;
      p.scale = p.scaleEnd = this.rand(0.4, 1);
      p.tint = this.deps.rng() > 0.5 ? 0xffffff : this.color(1);
    }
    this.shards.update(dt);

    if (ctx.hit > 0) {
      this.impactTime = IMPACT_DURATION;
      const inverted = ctx.beatIndex % 2 === 0;
      this.impactBg.tint = inverted ? 0xffffff : 0x000000;
      this.impactBurst.tint = inverted ? 0x000000 : 0xffffff;
      this.impactBurst.rotation = this.rand(0, Math.PI);
    }
    this.impact.visible = this.impactTime > 0;
    this.impactTime -= dt;
    const shake = this.impactTime > 0 ? 24 : 0;
    this.view.position.set(CENTER_X + this.rand(-shake, shake), CENTER_Y + this.rand(-shake, shake));
  }
}
