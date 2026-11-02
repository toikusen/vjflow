import { Component, input, output } from '@angular/core';
import type { StyleCard } from '../../lyric-vj/free-styles';

/** The styles as pictures of themselves. Thumbnails are real frames, made by scripts/lyric-vj/free-thumbs.mts. */
@Component({
  selector: 'app-style-picker',
  templateUrl: './style-picker.html',
  styleUrl: './style-picker.scss',
})
export class StylePicker {
  readonly groups = input.required<{ name: string; cards: StyleCard[] }[]>();
  readonly selected = input('');
  /** Each group a sideways rail on narrow screens, for a page that has more below the picker. */
  readonly rails = input(false);
  readonly picked = output<string>();
}
