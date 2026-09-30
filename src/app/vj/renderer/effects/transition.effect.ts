import { Container, Sprite, Texture } from 'pixi.js';
import { TransitionType } from '../../vj-project.model';
import { CENTER_X, CENTER_Y, easeInOut, STAGE_HEIGHT, STAGE_WIDTH } from '../frame-context';
import { fullRect } from '../layers/vj-layer';

const GLITCH_BARS = 8;

/** Deterministic pseudo-random in [0,1) from an integer — keeps glitches repeatable on seek. */
const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Blends two scene slots (containers pivoted at stage center) plus an overlay.
 * Stateless per frame: the picture depends only on (type, progress).
 */
export class TransitionEffect {
  readonly overlay = new Container();
  private readonly flash = fullRect(0xffffff, 0);
  private readonly wipeMask = new Sprite(Texture.WHITE);
  private readonly wipeEdge = new Sprite(Texture.WHITE);
  private readonly bars: Sprite[] = [];

  constructor() {
    this.flash.blendMode = 'add';
    this.wipeMask.height = STAGE_HEIGHT;
    this.wipeEdge.height = STAGE_HEIGHT;
    this.wipeEdge.width = 18;
    this.wipeEdge.anchor.set(0.5, 0);
    this.wipeEdge.blendMode = 'add';
    for (let i = 0; i < GLITCH_BARS; i++) {
      const bar = new Sprite(Texture.WHITE);
      bar.width = STAGE_WIDTH;
      this.bars.push(bar);
    }
    this.overlay.addChild(this.wipeMask, this.flash, this.wipeEdge, ...this.bars);
    this.reset();
  }

  apply(type: TransitionType, progress: number, from: Container, to: Container, colors: number[]): void {
    this.resetSlot(from, type !== 'wipe');
    this.resetSlot(to, type !== 'wipe');
    this.resetOverlay();
    const p = Math.min(1, Math.max(0, progress));
    const e = easeInOut(p);
    switch (type) {
      case 'fade':
        from.alpha = 1 - e;
        to.alpha = e;
        break;
      case 'flash':
        from.visible = p < 0.5;
        to.visible = p >= 0.5;
        this.flash.alpha = 1 - Math.abs(2 * p - 1);
        break;
      case 'zoom':
        from.scale.set(1 + e * 0.8);
        from.alpha = 1 - e;
        to.scale.set(0.7 + 0.3 * e);
        to.alpha = e;
        break;
      case 'wipe': {
        const x = STAGE_WIDTH * e;
        this.wipeMask.scale.x = Math.max(1, x) / Texture.WHITE.width;
        if (to.mask !== this.wipeMask) to.mask = this.wipeMask;
        this.wipeEdge.visible = p > 0 && p < 1;
        this.wipeEdge.x = x;
        this.wipeEdge.tint = colors[2] ?? 0xffffff;
        break;
      }
      case 'glitch': {
        const step = Math.floor(p * 16);
        const r = hash01(step);
        const showTo = p > 0.5 ? r > 0.2 : r > 0.8;
        from.visible = !showTo;
        to.visible = showTo;
        const jitter = p > 0.1 && p < 0.9 ? (hash01(step + 7) - 0.5) * 90 : 0;
        (showTo ? to : from).x += jitter;
        this.bars.forEach((bar, i) => {
          bar.visible = p > 0.1 && p < 0.9 && hash01(step * 13 + i) > 0.35;
          bar.y = hash01(step * 31 + i) * STAGE_HEIGHT;
          bar.height = 6 + hash01(step * 17 + i) * 70;
          bar.tint = colors[(i % 3) + 1] ?? 0xffffff;
          bar.alpha = 0.75;
        });
        this.flash.alpha = Math.abs(p - 0.5) < 0.05 ? 0.4 : 0;
        break;
      }
    }
  }

  /** Restores slots and hides the overlay. */
  reset(...slots: Container[]): void {
    slots.forEach((s) => this.resetSlot(s, true));
    this.resetOverlay();
  }

  private resetSlot(s: Container, clearMask: boolean): void {
    s.alpha = 1;
    s.visible = true;
    s.scale.set(1);
    s.position.set(CENTER_X, CENTER_Y);
    // Only touch the mask when it changes; re-assigning every frame churns mask effects.
    if (clearMask && s.mask) s.mask = null;
  }

  private resetOverlay(): void {
    this.flash.alpha = 0;
    // The mask sprite stays in the tree (so its transform updates); zero width hides it when unused.
    this.wipeMask.scale.x = 0;
    this.wipeEdge.visible = false;
    this.bars.forEach((b) => (b.visible = false));
  }
}
