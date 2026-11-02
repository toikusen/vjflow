import { Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { BetaMe } from '../beta';
import { balance, PanelEvent, panelAfter, QUOTA_HELP } from './balance';
import { PriceComponent } from './price.component';

/**
 * The balance pill: what is left, a 4 px bar of the share left, and 「額度」, which opens a small panel under the pill
 * (balance and limit, who provides the quota, whom to ask). `full` sits in a desktop page header, `compact` in a song
 * hero, `phone` in the shell's 56 px top bar. `drop="up"` opens the panel above the pill (the phone 我 sheet sits at the bottom).
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
    <button class="top-up" type="button" [attr.aria-expanded]="open()" (click)="on('toggle')">額度</button>
    @if (open()) {
      <div class="panel" role="region" aria-label="額度">
        <p class="line">餘額 <app-price [amount]="b().left" /> ／ 額度 <app-price [amount]="me().limitUsd" /></p>
        @for (t of help; track t) {
          <p>{{ t }}</p>
        }
      </div>
    }
  `,
  host: { '[class]': 'look()', '[class.up]': "drop() === 'up'", '(document:click)': 'outside($event)', '(document:keydown.escape)': "on('escape')" },
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
    // anchored to the pill's right edge, which sits at a page's right gutter, so it never runs off a 390 px screen
    .panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: max-content;
      max-width: min(300px, calc(100vw - 32px));
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.5;
      text-align: left;
      color: var(--text-2);
      background: var(--surface-2);
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      box-shadow: var(--shadow-float);
      p {
        margin: 0;
      }
      .line {
        font-size: 13px;
        font-weight: 700;
        color: var(--text);
      }
    }
    :host(.up) .panel {
      top: auto;
      bottom: calc(100% + 6px);
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
  readonly drop = input<'down' | 'up'>('down');
  protected readonly b = computed(() => balance(this.me()));
  protected readonly open = signal(false);
  protected readonly help = QUOTA_HELP;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected on(e: PanelEvent) {
    this.open.update((o) => panelAfter(o, e));
  }

  protected outside(e: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.on('outside');
  }
}
