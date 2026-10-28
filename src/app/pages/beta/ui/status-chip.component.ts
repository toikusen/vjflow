import { Component, input } from '@angular/core';
import { StatusChip } from './status';

/**
 * A status chip: Mono icon + label in the tone's colour.
 * `tag` = tinted pill (4a), `overlay` = dark pill on a cover, `text` = coloured text only (phone rows).
 */
@Component({
  selector: 'app-status-chip',
  template: `<span class="icon" aria-hidden="true">{{ chip().icon }}</span>{{ chip().label }}`,
  host: { '[class]': "chip().tone + ' ' + look()" },
  styles: `
    :host {
      --c: var(--muted);
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 11px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
      color: var(--c);
      background: var(--c-bg, var(--surface-2));
      border: 1px solid var(--c-border, var(--border));
      border-radius: 999px;
    }
    .icon {
      font: 700 11px var(--font-mono);
    }
    :host(.info) { --c: var(--info); --c-bg: var(--info-bg); --c-border: var(--info-border); }
    :host(.warn) { --c: var(--warn); --c-bg: var(--warn-bg); --c-border: var(--warn-border); }
    :host(.ok) { --c: var(--ok); --c-bg: var(--ok-bg); --c-border: var(--ok-border); }
    :host(.bad) { --c: var(--bad); --c-bg: var(--bad-bg); --c-border: var(--bad-border); }
    :host(.making) { --c: var(--making); --c-bg: var(--making-bg); --c-border: var(--making-border); }
    :host(.overlay) {
      gap: 6px;
      padding: 6px 10px;
      background: #0f1114e6;
      border-color: transparent;
    }
    :host(.text) {
      gap: 6px;
      padding: 0;
      background: none;
      border: 0;
    }
  `,
})
export class StatusChipComponent {
  readonly chip = input.required<StatusChip>();
  readonly look = input<'tag' | 'overlay' | 'text'>('tag');
}
