import { Container, Renderer, Sprite, Texture } from 'pixi.js';
import { Rng } from '../../seeded-random';
import { VJStyle } from '../../styles/vj-style.interface';
import { VJScene } from '../../vj-project.model';
import { FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
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
  /** For layers that render offscreen (feedback); absent in tests. */
  renderer?: Renderer;
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
