import { Sprite, Texture } from 'pixi.js';
import { FrameContext, STAGE_HEIGHT, STAGE_WIDTH } from '../../renderer/frame-context';
import { BaseElement, ElementDef, ElementDeps, hash01 } from '../element';

/**
 * LED matrix: each column is a level meter for its frequency band, plus random cells
 * sparking on the beat. Rounded skins draw soft dots instead of hard squares.
 */
class LedWall extends BaseElement {
  private readonly cells: Sprite[] = [];
  private readonly cols: number;
  private readonly rows: number;

  constructor(deps: ElementDeps) {
    super(deps);
    this.cols = this.num('cols');
    const pitch = STAGE_WIDTH / this.cols;
    this.rows = Math.floor(STAGE_HEIGHT / pitch);
    const round = this.skin.roundness > 0.5;
    const texture = round ? deps.textures.glow : Texture.WHITE;
    const size = pitch * (round ? 1.1 : 0.78);
    const top = (STAGE_HEIGHT - this.rows * pitch) / 2;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const s = new Sprite(texture);
        s.anchor.set(0.5);
        s.width = s.height = size;
        s.position.set((c + 0.5) * pitch, top + (r + 0.5) * pitch);
        s.blendMode = this.skin.blend === 'normal' ? 'normal' : 'add';
        this.cells.push(s);
      }
    }
    this.view.addChild(...this.cells);
  }

  update(ctx: FrameContext, strength: number): void {
    const { bass, mid, treble, beatIndex } = ctx;
    const pulse = this.pulse(ctx);
    const mirrored = this.str('layout') === 'mirror';
    for (let c = 0; c < this.cols; c++) {
      const pos = mirrored ? Math.abs(c - (this.cols - 1) / 2) / (this.cols / 2) : c / this.cols;
      const band = pos < 0.33 ? bass : pos < 0.66 ? mid : treble;
      const lit = band * this.rows;
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[r * this.cols + c];
        const level = this.rows - r;
        const on = level <= lit;
        const spark = hash01(beatIndex * 7919 + r * 131 + c) < 0.06 * pulse;
        cell.tint = level > this.rows * 0.8 ? this.color(3) : level > this.rows * 0.5 ? this.color(2) : this.color(1);
        cell.alpha = (on ? 0.9 : spark ? 0.8 : 0.07) * strength;
      }
    }
  }
}

export const LED_WALL: ElementDef = {
  id: 'ledWall',
  slot: 'figure',
  energy: 0.75,
  traits: ['blocky'],
  params: {
    cols: { kind: 'range', min: 14, max: 32, int: true },
    layout: { kind: 'choice', options: ['mirror', 'linear'] },
  },
  create: (d) => new LedWall(d),
};
