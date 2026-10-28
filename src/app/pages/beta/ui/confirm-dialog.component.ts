import { afterRenderEffect, Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import { PriceComponent } from './price.component';
import { Ask, askRows } from './confirm';

/**
 * The shared confirm dialog (2b) every paying action goes through. A native modal `<dialog>`: the page behind is inert
 * (focus stays inside), Esc and a click on the backdrop cancel, focus returns to the button that opened it.
 * 確認 runs `ask.go()`; both answers emit `closed` so the page clears its `ask`.
 */
@Component({
  selector: 'app-confirm',
  imports: [PriceComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly ask = input<Ask | null>(null);
  /** What the person has left; null while unknown (then only the cost row shows). */
  readonly left = input<number | null>(null);
  readonly closed = output<void>();
  protected readonly rows = computed(() => {
    const a = this.ask();
    return a ? askRows(a, this.left()) : null;
  });
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const d = this.dialog()?.nativeElement;
      if (d && !d.open) d.showModal?.();
    });
  }

  protected cancel() {
    this.dialog()?.nativeElement.close?.();
    this.closed.emit();
  }

  protected confirm() {
    const a = this.ask();
    if (!a || this.rows()?.short) return;
    this.cancel();
    a.go();
  }

  protected backdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) this.cancel();
  }
}
