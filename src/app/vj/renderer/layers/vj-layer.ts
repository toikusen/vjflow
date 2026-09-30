import { Color, Container, Sprite, Texture } from 'pixi.js';
import { Rng } from '../../seeded-random';
import { VJStyle } from '../../styles/vj-style.interface';
import { VJScene } from '../../vj-project.model';
import { CENTER_X, CENTER_Y, FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { VjTextures } from '../textures';

/** A full-screen visual for one scene. Built on scene enter, destroyed after its transition out. */
export interface VjLayer {
  readonly view: Container;
  update(ctx: FrameContext): void;
  destroy(): void;
}

export interface LayerDeps {
  scene: VJScene;
  style: VJStyle;
  textures: VjTextures;
  rng: Rng;
}

export type LayerFactory = (deps: LayerDeps) => VjLayer;

/** Shared plumbing: centered pivot (so transitions can scale around center) and palette as numbers. */
export abstract class BaseLayer implements VjLayer {
  readonly view = new Container();
  /** palette[0] background, [1] primary, [2] highlight, [3] accent. */
  protected readonly colors: number[];
  protected readonly variant: number;
  protected readonly speed: number;

  constructor(protected readonly deps: LayerDeps) {
    this.view.pivot.set(CENTER_X, CENTER_Y);
    this.view.position.set(CENTER_X, CENTER_Y);
    this.colors = deps.scene.palette.map((c) => new Color(c).toNumber());
    this.variant = Number(deps.scene.parameters['variant'] ?? 0);
    this.speed = Number(deps.scene.parameters['speed'] ?? 1);
  }

  abstract update(ctx: FrameContext): void;

  protected get preset(): string {
    return this.deps.scene.preset;
  }

  protected color(i: number): number {
    return this.colors[i % this.colors.length];
  }

  protected rand(min: number, max: number): number {
    return min + (max - min) * this.deps.rng();
  }

  destroy(): void {
    // Textures are shared; destroy display objects only.
    this.view.destroy({ children: true });
  }
}

export function fullRect(color: number, alpha = 1): Sprite {
  const s = new Sprite(Texture.WHITE);
  s.width = STAGE_WIDTH;
  s.height = STAGE_HEIGHT;
  s.tint = color;
  s.alpha = alpha;
  return s;
}

/** Vertical gradient from `color` (top) to transparent; `fromBottom` flips it. */
export function gradientRect(tex: Texture, color: number, alpha: number, fromBottom = false): Sprite {
  const s = new Sprite(tex);
  s.width = STAGE_WIDTH;
  s.height = STAGE_HEIGHT;
  s.tint = color;
  s.alpha = alpha;
  if (fromBottom) {
    s.scale.y *= -1;
    s.y = STAGE_HEIGHT;
  }
  return s;
}

export function centeredSprite(tex: Texture, x: number, y: number, tint = 0xffffff): Sprite {
  const s = new Sprite(tex);
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.tint = tint;
  return s;
}
