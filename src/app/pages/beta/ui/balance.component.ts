import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { BetaMe } from '../beta';
import { balance } from './balance';
import { PriceComponent } from './price.component';

const NOTE_MS = 2500;

/**
 * The balance pill: what is left, a 4 px bar of the share left, and 「儲值」 (not built yet: it shows 「即將推出」).
 * `full` sits in a desktop page header, `compact` in a song hero, `phone` in the shell's 56 px top bar.
 */
@Component({
  selector: 'app-balance',
  imports: [PriceComponent],
  template: `
    @if (look() !== 'phone') {
      <span class="label">餘額</span>
    }
    <app-price class="amount" [amount]="b().left" [plain]="true" [title]="'已用 $' + me().spentUsd.toFixed(2) + ' ／ 額度 $' + me().limitUsd.toFixed(2)" />
    @if (look() === 'full') {
      <span class="bar" aria-hidden="true"><i [style.width.%]="b().pct"></i></span>
    }
    <button class="top-up" type="button" (click)="showNote()">儲值</button>
    @if (note()) {
      <span class="note" role="status">即將推出</span>
    }
  `,
  host: { '[class]': 'look()' },
  styles: `
    :host {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 14px;
      padding: 8px 8px 8px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
    }
    .amount {
      font: 700 18px var(--font-display);
      letter-spacing: -0.02em;
    }
    .bar {
      width: 72px;
      height: 4px;
      overflow: hidden;
      background: var(--border);
      border-radius: 2px;
      i {
        display: block;
        height: 100%;
        background: var(--accent);
        transition: width 0.3s ease;
      }
    }
    .top-up {
      padding: 7px 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      color: var(--text);
      background: var(--border);
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.15s;
      &:hover {
        background: var(--border-strong);
      }
    }
    .note {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      color: var(--text-2);
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-radius: 10px;
    }
    :host(.compact) {
      gap: 10px;
      padding: 6px 6px 6px 14px;
      background: #0f1114b3;
      border-radius: 10px;
      .amount {
        font-size: 15px;
        letter-spacing: 0;
      }
      .top-up {
        padding: 6px 10px;
        border-radius: 7px;
      }
    }
    :host(.phone) {
      gap: 8px;
      padding: 5px 6px 5px 12px;
      border-radius: 999px;
      .amount {
        font-size: 13px;
        letter-spacing: 0;
      }
      .top-up {
        padding: 4px 9px;
        font-size: 11px;
        border-radius: 999px;
      }
    }
  `,
})
export class BalanceComponent {
  readonly me = input.required<BetaMe>();
  readonly look = input<'full' | 'compact' | 'phone'>('full');
  protected readonly b = computed(() => balance(this.me()));
  protected readonly note = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected showNote() {
    this.note.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.note.set(false), NOTE_MS);
  }
}
