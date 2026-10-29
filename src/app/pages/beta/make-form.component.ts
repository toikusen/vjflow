import { Component, computed, effect, ElementRef, inject, input, model, output, signal } from '@angular/core';
import { BetaJob, BetaSong, BetaTier, CONCEPT_PRICE, stepsMin, TIER_INFO } from './beta';
import { defaultTier, feelingLength, makeBlock, makeBody, MAX_FEELING, MAX_REFS, refProblem, REF_TYPES, StripGrid, stripGrid, stripTiles } from './make';
import { Ask, bill } from './ui/confirm';
import { ConfirmDialogComponent } from './ui/confirm-dialog.component';
import { formatPrice } from './ui/price';
import { PriceComponent } from './ui/price.component';

/** A style on the menu (`GET /beta/styles`); `image` is its kit or sample strip, null when it has none. */
export interface BetaStyle { id: string; name: string; suits: string; image: string | null }

const TIERS = Object.keys(TIER_INFO) as BetaTier[];
/** Up to this many cards (交給導演 included) the grid shows them all; past it, a scroller and the range hint. */
const GRID_CARDS = 6;
const CONCEPT_MIN = stepsMin('concept');

/**
 * 製作新版本 (1b-2 lower part, 2e): tier, 想要的感覺, references and style, then 產生概念 through the confirm dialog (2b).
 * `tier` and `feeling` are models so the page can preselect them (a redo from a report) before calling `reveal()`.
 */
@Component({
  selector: 'app-make-form',
  imports: [ConfirmDialogComponent, PriceComponent],
  templateUrl: './make-form.component.html',
  styleUrl: './make-form.component.scss',
})
export class MakeFormComponent {
  readonly song = input.required<BetaSong>();
  readonly jobs = input.required<readonly BetaJob[]>();
  /** Whether a job of this song is queued or running. */
  readonly active = input(false);
  /** What the person has left; null while unknown. */
  readonly left = input<number | null>(null);
  /** Tiers this song already has a result for; the default choice skips them. */
  readonly made = input<readonly (BetaTier | undefined)[]>([]);
  /** The chosen tier; undefined until the person (or the page) picks one. */
  readonly tier = model<BetaTier | undefined>(undefined);
  readonly feeling = model('');
  /** A concept was queued; the text is for the page's toast. */
  readonly started = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly tiers = TIERS.map((id) => ({ id, ...TIER_INFO[id] }));
  protected readonly conceptPrice = CONCEPT_PRICE;
  protected readonly maxFeeling = MAX_FEELING;
  protected readonly maxRefs = MAX_REFS;
  protected readonly accept = REF_TYPES.join(',');
  /** 想要的感覺 and 參考圖 are folded until opened (or a redo fills them in). */
  protected readonly wishOpen = signal(false);
  protected readonly styles = signal<BetaStyle[]>([]);
  /** The picked style id; null is 交給導演 (the default). */
  protected readonly style = signal<string | null>(null);
  protected readonly refs = signal<string[]>([]);
  protected readonly uploading = signal(false);
  /** The make request is on its way; the button stays off so a second click sends nothing. */
  protected readonly submitting = signal(false);
  protected readonly stylesFailed = signal(false);
  protected readonly refError = signal('');
  /** The server's answer when it refused the make (shown above the bar). */
  protected readonly error = signal('');
  protected readonly ask = signal<Ask | null>(null);
  /** Each style picture's frame grid, read once the image has loaded. */
  protected readonly grids = signal<Readonly<Record<string, StripGrid>>>({});

  /** The tier the person picked, else the pending concept's tier, else the first one this song has no result for yet. */
  protected readonly chosen = computed<BetaTier>(() => {
    return this.tier() ?? defaultTier(this.jobs(), this.song().id, this.made());
  });
  protected readonly info = computed(() => TIER_INFO[this.chosen()]);
  protected readonly count = computed(() => feelingLength(this.feeling()));
  protected readonly many = computed(() => this.styles().length + 1 > GRID_CARDS);
  protected readonly block = computed(() =>
    makeBlock({ songId: this.song().id, tier: this.chosen(), jobs: this.jobs(), active: this.active(), left: this.left(), uploading: this.uploading(), submitting: this.submitting(), feeling: this.feeling() }),
  );
  protected readonly bill = computed(() => bill(CONCEPT_PRICE, this.left()));
  protected readonly refUrl = (name: string) => `/beta/songs/${this.song().id}/refs/${name}`;
  protected readonly tiles = (id: string) => {
    const g = this.grids()[id];
    return g ? stripTiles(g).map((t) => ({ ...t, ...g })) : null;
  };

  constructor() {
    let loadedFor = '';
    effect(() => {
      const id = this.song().id;
      if (id === loadedFor) return;
      loadedFor = id;
      void this.loadRefs();
    });
    void this.loadStyles();
  }

  /** Scrolls the form into view and puts the cursor in 想要的感覺 (after a redo from a report). */
  reveal() {
    this.wishOpen.set(true);
    this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // the textarea is inside the folded <details>: focus once the open state has rendered
    setTimeout(() => this.host.nativeElement.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }));
  }

  private async loadStyles() {
    try {
      const r = await fetch('/beta/styles');
      if (!r.ok) return this.stylesFailed.set(true);
      this.styles.set((await r.json()) as BetaStyle[]);
    } catch {
      this.stylesFailed.set(true);
    }
  }

  private async loadRefs() {
    try {
      const r = await fetch(`/beta/songs/${this.song().id}/refs`, { cache: 'no-store' });
      if (r.ok) this.refs.set((await r.json()) as string[]);
    } catch {
      // the refs are optional
    }
  }

  protected readGrid(id: string, img: HTMLImageElement) {
    this.grids.update((m) => ({ ...m, [id]: stripGrid(img.naturalWidth, img.naturalHeight) }));
  }

  /** Arrow keys move the choice inside a radio group (tiers or styles). */
  protected move(e: KeyboardEvent, ids: readonly (string | null)[], cur: string | null, pick: (id: string | null) => void) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = ids[(ids.indexOf(cur) + step + ids.length) % ids.length];
    pick(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${next ?? ''}"]`)?.focus();
  }

  protected moveTier(e: KeyboardEvent) {
    this.move(e, TIERS, this.chosen(), (id) => this.tier.set(id as BetaTier));
  }

  protected moveStyle(e: KeyboardEvent) {
    this.move(e, [null, ...this.styles().map((s) => s.id)], this.style(), (id) => this.style.set(id));
  }

  protected async upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const why = refProblem(file, this.refs().length);
    this.refError.set(why ?? '');
    if (why) return;
    this.uploading.set(true);
    try {
      const r = await fetch(`/beta/songs/${this.song().id}/refs`, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      const b = (await r.json().catch(() => null)) as { name?: string; error?: string } | null;
      if (!r.ok || !b?.name) return this.refError.set(b?.error ?? `上傳失敗（HTTP ${r.status}）`);
      const name = b.name;
      this.refs.update((l) => [...l, name]);
    } catch {
      this.refError.set('上傳失敗，請稍後再試');
    } finally {
      this.uploading.set(false);
    }
  }

  protected async remove(name: string) {
    this.refError.set('');
    try {
      const r = await fetch(this.refUrl(name), { method: 'DELETE' });
      // 404: already gone
      if (r.ok || r.status === 404) this.refs.update((l) => l.filter((n) => n !== name));
      else this.refError.set(`刪除失敗（HTTP ${r.status}）`);
    } catch {
      this.refError.set('刪除失敗，請稍後再試');
    }
  }

  protected confirm() {
    if (this.block()) return;
    const tier = this.chosen();
    const t = TIER_INFO[tier];
    this.ask.set({
      eyebrow: `${this.song().title} · ${t.name}`,
      title: '先產生概念',
      body: `導演會依你的選擇提出風格、配色和三張示意畫面，你確認後才會開始製作完整影片（${t.name}，再 $${formatPrice(t.rest, 'short')}）。產生概念約 ${CONCEPT_MIN} 分鐘，可以離開頁面。`,
      cost: CONCEPT_PRICE,
      go: () => this.make(tier),
    });
  }

  private async make(tier: BetaTier) {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set('');
    const body = makeBody({ tier, feeling: this.feeling(), style: this.style(), refs: this.refs() });
    try {
      const r = await fetch(`/beta/songs/${this.song().id}/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      // a proxy error page (502) is not JSON
      const b = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) return this.error.set(b?.error ?? `無法開始（HTTP ${r.status}）`);
      this.feeling.set('');
      this.started.emit(`「${this.song().title}」已開始產生${TIER_INFO[tier].name}的概念，好了會請你確認。`);
    } catch {
      this.error.set('無法連線，請稍後再試');
    } finally {
      this.submitting.set(false);
    }
  }
}
