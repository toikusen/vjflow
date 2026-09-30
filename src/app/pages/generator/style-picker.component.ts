import { Component, input, output } from '@angular/core';
import { VJ_STYLE_LIST } from '../../vj/styles';
import { VJStyleId } from '../../vj/vj-project.model';

@Component({
  selector: 'app-style-picker',
  template: `
    <div class="grid" role="radiogroup" aria-label="VJ 風格">
      @for (style of styles; track style.id) {
        <button
          type="button"
          role="radio"
          class="card"
          [class.selected]="style.id === selected()"
          [attr.aria-checked]="style.id === selected()"
          [disabled]="disabled()"
          (click)="select.emit(style.id)"
        >
          <span class="swatch" [style.background]="style.cardBackground"></span>
          <span class="name">{{ style.name }}</span>
          <span class="tagline">{{ style.tagline }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .card {
      display: grid; gap: 6px; padding: 10px; text-align: left; cursor: pointer;
      background: var(--surface-2); color: inherit; border: 2px solid transparent; border-radius: 12px;
      transition: transform 0.15s, border-color 0.15s;
    }
    .card:hover:not(:disabled) { transform: translateY(-2px); }
    .card.selected { border-color: var(--accent); box-shadow: 0 0 0 4px rgb(255 61 154 / 0.15); }
    .card:disabled { opacity: 0.5; cursor: not-allowed; }
    .swatch { aspect-ratio: 16 / 9; border-radius: 8px; }
    .name { font-weight: 700; }
    .tagline { font-size: 12px; color: var(--muted); }
  `,
})
export class StylePickerComponent {
  readonly selected = input.required<VJStyleId>();
  readonly disabled = input(false);
  readonly select = output<VJStyleId>();
  protected readonly styles = VJ_STYLE_LIST;
}
