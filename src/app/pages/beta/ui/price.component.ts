import { Component, computed, input } from '@angular/core';
import { formatPrice, PriceDigits } from './price';

/**
 * A fixed price: `<span class="unit">$</span><span class="num">14.50</span>` in tabular numbers.
 * Every amount a person sees goes through here, so a switch to tokens changes only `unit` and the format.
 * `plain` keeps the unit in the surrounding colour and size (inside buttons and sentences).
 */
@Component({
  selector: 'app-price',
  template: `<span class="unit">{{ unit() }}</span><span class="num">{{ text() }}</span>`,
  host: { '[class.plain]': 'plain()' },
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .unit {
      margin-right: 2px;
      font-size: max(12px, 0.6em);
      color: var(--muted);
    }
    :host(.plain) .unit {
      margin-right: 0;
      font-size: inherit;
      color: inherit;
    }
  `,
})
export class PriceComponent {
  readonly amount = input.required<number>();
  readonly unit = input('$');
  readonly digits = input<PriceDigits>('fixed');
  readonly plain = input(false);
  protected readonly text = computed(() => formatPrice(this.amount(), this.digits()));
}
