import { afterRenderEffect, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { BetaJob, BetaSong, CONCEPT_PRICE, JOB_STEPS, TIER_INFO } from './beta';
import { acceptBlock, adjustBlock, conceptHead, interludeLines, MAX_NOTE, redoBlock, stillLabel } from './concept';
import { feelingLength } from './make';
import { Ask } from './ui/confirm';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { PriceComponent } from './ui/price.component';

type Decision = 'accept' | 'adjust' | 'redo';
const stepsMin = (k: keyof typeof JOB_STEPS) => Math.round(JOB_STEPS[k].reduce((s, x) => s + x.min, 0));

/**
 * 概念卡 (2a): the director's concept for one version, waiting for the person. 接受 starts the make at the tier's rest
 * price; 依意見調整 (with a note) and 換一個方向 start another concept at $2.5 while fewer than 3 attempts were made.
 * Every decision goes through the confirm dialog (2b); one request at a time.
 */
@Component({
  selector: 'app-concept-card',
  imports: [ConfirmDialogComponent, PriceComponent],
  templateUrl: './concept-card.component.html',
  styleUrl: './concept-card.component.scss',
})
export class ConceptCardComponent {
  readonly song = input.required<BetaSong>();
  /** The finished concept job nobody has decided on yet. */
  readonly job = input.required<BetaJob>();
  readonly jobs = input.required<readonly BetaJob[]>();
  /** Whether a job of this song is queued or running (the server would refuse any decision). */
  readonly active = input(false);
  /** What the person has left; null while unknown. */
  readonly left = input<number | null>(null);
  /** A decision was accepted by the server; the text is for the page's toast. */
  readonly decided = output<string>();

  protected readonly maxNote = MAX_NOTE;
  protected readonly conceptPrice = CONCEPT_PRICE;
  /** 「我了解，仍要用這個風格」. */
  protected readonly confirmed = signal(false);
  protected readonly note = signal('');
  protected readonly submitting = signal(false);
  /** The server's refusal of the last decision (shown under the buttons). */
  protected readonly error = signal('');
  protected readonly ask = signal<Ask | null>(null);
  /** The still shown full screen, by file name. */
  protected readonly zoomed = signal<string | null>(null);
  private readonly lightbox = viewChild<ElementRef<HTMLDialogElement>>('lightbox');

  protected readonly summary = computed(() => this.job().concept);
  protected readonly head = computed(() => conceptHead(this.job(), this.jobs()));
  protected readonly tierName = computed(() => TIER_INFO[this.job().tier ?? 'none'].name);
  protected readonly concerns = computed(() => this.summary()?.concerns?.trim() ?? '');
  protected readonly interludes = computed(() => {
    const s = this.summary();
    return s ? interludeLines(s) : [];
  });
  protected readonly noteCount = computed(() => feelingLength(this.note()));
  private readonly common = computed(() => ({ active: this.active(), left: this.left(), submitting: this.submitting() }));
  protected readonly acceptWhy = computed(() => acceptBlock({ ...this.common(), concerns: !!this.concerns(), confirmed: this.confirmed(), rest: this.head().rest }));
  protected readonly adjustWhy = computed(() => adjustBlock({ ...this.common(), note: this.note() }));
  protected readonly redoWhy = computed(() => redoBlock(this.common()));
  protected readonly stillUrl = (name: string) => `/beta/jobs/${this.job().id}/stills/${name}`;
  protected readonly label = stillLabel;

  constructor() {
    afterRenderEffect(() => {
      const d = this.lightbox()?.nativeElement;
      if (d && !d.open) d.showModal?.();
    });
  }

  /** The checkbox and the note clear the last refusal: the person is changing what they will send. */
  protected tick(on: boolean) {
    this.confirmed.set(on);
    this.error.set('');
  }

  protected edit(text: string) {
    this.note.set(text);
    this.error.set('');
  }

  protected closeZoom() {
    this.lightbox()?.nativeElement.close?.();
    this.zoomed.set(null);
  }

  protected zoomBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) this.closeZoom();
  }

  protected confirm(kind: Decision) {
    const why = kind === 'accept' ? this.acceptWhy() : kind === 'adjust' ? this.adjustWhy() : this.redoWhy();
    if (why) return;
    const name = this.tierName();
    const eyebrow = `${this.song().title} · ${name}`;
    const conceptMin = stepsMin('concept');
    if (kind === 'accept') {
      const style = this.summary()?.languageName;
      const kept = this.concerns() && style ? `你已確認導演的顧慮，仍用「${style}」。` : '';
      return this.ask.set({
        eyebrow,
        title: '接受概念，開始製作',
        body: `${kept}導演會照這個概念製作完整影片（${name}），約 ${stepsMin(this.job().tier ?? 'none')} 分鐘，可以離開頁面。中途不會另外收費。`,
        cost: this.head().rest,
        go: () => this.send('accept'),
      });
    }
    if (kind === 'adjust') {
      return this.ask.set({
        eyebrow,
        title: '依意見調整',
        body: `導演會保留這個方向，照你的意見重新提出風格、配色和三張示意畫面。約 ${conceptMin} 分鐘，可以離開頁面。`,
        cost: CONCEPT_PRICE,
        go: () => this.send('adjust'),
      });
    }
    this.ask.set({
      eyebrow,
      title: '換一個方向',
      body: `導演會重新提一個完全不同的概念和三張示意畫面。約 ${conceptMin} 分鐘，可以離開頁面。`,
      cost: CONCEPT_PRICE,
      go: () => this.send('redo'),
    });
  }

  private async send(kind: Decision) {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set('');
    const body = kind === 'accept' ? { confirmConcerns: this.confirmed() } : kind === 'adjust' ? { note: this.note().trim() } : {};
    try {
      const r = await fetch(`/beta/jobs/${this.job().id}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      // a proxy error page (502) is not JSON
      const b = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) return this.error.set(b?.error ?? `無法送出（HTTP ${r.status}）`);
      const title = this.song().title;
      const name = this.tierName();
      this.note.set('');
      this.decided.emit(
        kind === 'accept' ? `「${title}」已開始製作${name}，完成後會出現在成品。`
          : kind === 'adjust' ? `導演正在依你的意見調整「${title}」的概念，好了會請你確認。`
            : `導演正在為「${title}」重新提一個概念，好了會請你確認。`,
      );
    } catch {
      this.error.set('無法連線，請稍後再試');
    } finally {
      this.submitting.set(false);
    }
  }
}
