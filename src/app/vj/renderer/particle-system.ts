import { BLEND_MODES, Container, Sprite, Texture } from 'pixi.js';

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  rotation: number;
  spin: number;
  scale: number;
  scaleEnd: number;
  alpha: number;
  tint: number;
  gravity: number;
  /** Velocity multiplier per second (1 = no drag). */
  drag: number;
  wobble: number;
  /** false = linear fade out, true = fade in and out (twinkle). */
  twinkle: boolean;
}

/**
 * Fixed-capacity sprite pool. Sprites are created up front; spawn() recycles
 * a free slot or returns null when full, so particle count can never grow unbounded.
 */
export class ParticleSystem {
  readonly view = new Container();
  private readonly particles: { p: Particle; sprite: Sprite }[] = [];
  private cursor = 0;
  private spawnDebt = 0;

  constructor(texture: Texture, capacity: number, blendMode: BLEND_MODES = 'normal') {
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.blendMode = blendMode;
      this.view.addChild(sprite);
      this.particles.push({
        sprite,
        p: { active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, rotation: 0, spin: 0, scale: 1, scaleEnd: 1, alpha: 1, tint: 0xffffff, gravity: 0, drag: 1, wobble: 0, twinkle: false },
      });
    }
  }

  /** Returns a reset particle to configure, or null when the pool is exhausted. */
  spawn(): Particle | null {
    const n = this.particles.length;
    for (let k = 0; k < n; k++) {
      const slot = this.particles[(this.cursor + k) % n];
      if (slot.p.active) continue;
      this.cursor = (this.cursor + k + 1) % n;
      const p = slot.p;
      p.active = true;
      p.x = p.y = p.vx = p.vy = p.age = p.rotation = p.spin = p.gravity = p.wobble = 0;
      p.life = 1;
      p.scale = p.scaleEnd = p.alpha = p.drag = 1;
      p.tint = 0xffffff;
      p.twinkle = false;
      return p;
    }
    return null;
  }

  /** Converts a continuous rate (particles/sec) into whole spawns this frame. */
  emitCount(ratePerSecond: number, dt: number): number {
    this.spawnDebt += Math.max(0, ratePerSecond) * dt;
    const count = Math.floor(this.spawnDebt);
    this.spawnDebt -= count;
    return count;
  }

  update(dt: number): void {
    for (const { p, sprite } of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        sprite.visible = false;
        continue;
      }
      const damp = p.drag === 1 ? 1 : Math.pow(p.drag, dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt + (p.wobble ? Math.sin(p.age * 3 + p.life * 10) * p.wobble * dt : 0);
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      const t = p.age / p.life;
      sprite.visible = true;
      sprite.position.set(p.x, p.y);
      sprite.rotation = p.rotation;
      sprite.scale.set(p.scale + (p.scaleEnd - p.scale) * t);
      sprite.alpha = p.alpha * (p.twinkle ? Math.sin(Math.PI * t) : 1 - t);
      if (sprite.tint !== p.tint) sprite.tint = p.tint;
    }
  }

  clear(): void {
    for (const { p, sprite } of this.particles) {
      p.active = false;
      sprite.visible = false;
    }
  }
}
