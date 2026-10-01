import { Container, Sprite, Texture } from 'pixi.js';
import { CENTER_X, CENTER_Y, FrameContext } from '../../renderer/frame-context';
import { centeredSprite } from '../../renderer/layers/vj-layer';
import { BaseElement, ElementDef, ElementDeps } from '../element';

/** A big bouncing icon in the middle with smaller copies orbiting around it. */
class OrbitIcons extends BaseElement {
  private readonly center = new Container();
  private readonly hero: Sprite;
  private readonly orbit: Sprite[] = [];
  private readonly isHeart: boolean;

  constructor(deps: ElementDeps) {
    super(deps);
    this.isHeart = this.str('icon') === 'heart';
    const texture: Texture = this.isHeart ? deps.textures.heart : deps.textures.star;
    this.center.position.set(CENTER_X, CENTER_Y);
    for (let i = 0; i < this.num('count'); i++) this.orbit.push(centeredSprite(texture, 0, 0, i % 2 ? this.color(2) : 0xffffff));
    this.hero = centeredSprite(texture, 0, 0, this.isHeart ? this.color(1) : this.color(2));
    this.center.addChild(...this.orbit, this.hero);
    this.view.addChild(this.center);
  }

  update(ctx: FrameContext, strength: number): void {
    const { time, bass } = ctx;
    const pulse = this.pulse(ctx);
    this.hero.scale.set((this.isHeart ? 2.4 : 2) * (1 + pulse * 0.18 + bass * 0.08) * (0.6 + 0.4 * strength));
    this.hero.rotation = this.isHeart ? Math.sin(time * 2) * 0.06 : time * 0.4 * this.deps.speed;
    this.hero.alpha = strength;
    const radius = this.num('radius') + pulse * 30;
    this.orbit.forEach((s, i) => {
      const a = (i / this.orbit.length) * Math.PI * 2 + time * 0.5 * this.deps.speed;
      s.position.set(Math.cos(a) * radius, Math.sin(a) * radius * 0.8);
      s.scale.set(0.55 + 0.15 * Math.sin(time * 4 + i));
      s.rotation = Math.sin(time * 3 + i) * 0.3;
      s.alpha = strength;
    });
  }
}

export const ORBIT_ICONS: ElementDef = {
  id: 'orbitIcons',
  slot: 'figure',
  energy: 0.5,
  traits: ['iconic', 'rotation'],
  params: {
    icon: { kind: 'choice', options: ['heart', 'star'] },
    count: { kind: 'range', min: 6, max: 12, int: true },
    radius: { kind: 'range', min: 260, max: 360 },
  },
  create: (d) => new OrbitIcons(d),
};
