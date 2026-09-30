import { Container, Text, TextStyleOptions } from 'pixi.js';
import { lowerBound } from '../../../audio/audio-analyzer.service';
import { LyricCue, LyricPreset } from '../../../lyrics/lyric.model';
import { Typography } from '../../styles/vj-style.interface';
import { CENTER_X, CENTER_Y, clamp01, easeOutBack, FrameContext } from '../frame-context';

const FADE = 0.35;
const MAX_WIDTH = 1700;
const CHAR_STAGGER = 0.04;

/**
 * Renders the active lyric cue on top of all scenes.
 * Text objects are created only when the cue changes, never per frame.
 */
export class LyricLayer {
  readonly view = new Container();
  private readonly starts: number[];
  private readonly block = new Container();
  private chars: Text[] = [];
  private cueIndex = -1;
  private punch = 0;

  constructor(
    private readonly cues: LyricCue[],
    private readonly preset: LyricPreset,
    private readonly typo: Typography,
  ) {
    this.starts = cues.map((c) => c.start);
    this.block.position.set(CENTER_X, CENTER_Y);
    this.view.addChild(this.block);
  }

  update(ctx: FrameContext, colors: number[]): void {
    const { time } = ctx;
    const i = lowerBound(this.starts, time + 1e-6) - 1;
    const active = i >= 0 && time < this.cues[i].end ? i : -1;
    if (active !== this.cueIndex) {
      this.cueIndex = active;
      this.build(active >= 0 ? this.cues[active].text : '', colors);
    }
    if (active < 0) return;

    const cue = this.cues[active];
    const t = time - cue.start;
    const remaining = cue.end - time;
    const fade = clamp01(Math.min(t / FADE, remaining / FADE));
    if (ctx.hit > 0) this.punch = Math.max(this.punch, ctx.hit);
    this.punch *= Math.exp(-ctx.dt / 0.12);
    this.block.alpha = fade;

    if (this.preset === 'minimal') {
      this.block.position.set(CENTER_X, CENTER_Y + (1 - clamp01(t / FADE)) * 14);
      return;
    }
    if (this.preset === 'kinetic') {
      const dir = active % 2 ? 1 : -1;
      const enter = easeOutBack(clamp01(t / 0.4));
      const exit = clamp01(1 - remaining / 0.3);
      this.block.position.set(CENTER_X + dir * (1 - enter) * 320 - dir * exit * 220, CENTER_Y);
      this.block.scale.set(0.9 + 0.1 * enter + ctx.beatPulse * 0.08 + this.punch * 0.12);
      this.block.rotation = dir * 0.035 + Math.sin(time * 1.7) * 0.01;
      return;
    }
    const fit = this.block.scale.x;
    this.chars.forEach((c, k) => {
      const local = t - k * CHAR_STAGGER;
      const s = local <= 0 ? 0 : easeOutBack(clamp01(local / 0.25));
      c.scale.set(s * (1 + ctx.beatPulse * 0.06));
      c.y = -this.punch * 18 * (k % 2 ? 1 : -1) / fit;
    });
  }

  private build(text: string, colors: number[]): void {
    this.block.removeChildren().forEach((c) => c.destroy());
    this.chars = [];
    this.block.scale.set(1);
    this.block.rotation = 0;
    if (!text) return;
    const content = this.typo.uppercase ? text.toUpperCase() : text;

    if (this.preset !== 'idol') {
      const t = new Text({ text: content, style: this.textStyle(this.preset === 'minimal' ? 64 : 96, colors) });
      t.anchor.set(0.5);
      this.block.addChild(t);
      return;
    }

    const style = this.textStyle(118, colors);
    let x = 0;
    for (const ch of Array.from(content)) {
      if (ch.trim() === '') {
        x += 118 * 0.35;
        continue;
      }
      const t = new Text({ text: ch, style });
      t.anchor.set(0.5);
      t.x = x + t.width / 2;
      x += t.width + this.typo.letterSpacing;
      this.chars.push(t);
      this.block.addChild(t);
    }
    this.chars.forEach((c) => (c.x -= x / 2));
    if (x > MAX_WIDTH) this.block.scale.set(MAX_WIDTH / x);
  }

  private textStyle(fontSize: number, colors: number[]): TextStyleOptions {
    const base: TextStyleOptions = {
      fontFamily: this.typo.fontFamily,
      fontWeight: this.typo.fontWeight,
      fontStyle: this.typo.fontStyle,
      letterSpacing: this.typo.letterSpacing,
      fontSize,
      fill: 0xffffff,
      align: 'center',
      wordWrap: this.preset !== 'idol',
      wordWrapWidth: MAX_WIDTH,
      breakWords: true,
      padding: 24,
    };
    if (this.preset === 'minimal') {
      return { ...base, dropShadow: { color: 0x000000, alpha: 0.6, blur: 14, distance: 0, angle: 0 } };
    }
    if (this.preset === 'kinetic') {
      return { ...base, stroke: { color: 0x000000, width: 6, join: 'round' }, dropShadow: { color: colors[1] ?? 0xff00ff, alpha: 0.9, blur: 18, distance: 0, angle: 0 } };
    }
    return {
      ...base,
      // Dark outline keeps it readable on any palette; the colored offset shadow gives the idol/anime pop.
      stroke: { color: 0x111111, width: 12, join: 'round' },
      dropShadow: { color: colors[1] ?? 0xff4fa3, alpha: 1, blur: 0, distance: 9, angle: Math.PI / 4 },
    };
  }

  reset(): void {
    this.cueIndex = -1;
    this.punch = 0;
    this.build('', []);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
