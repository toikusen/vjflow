import { Component, computed, input, signal } from '@angular/core';
import { acceptance, AdminJob, AdminStyle, EMPTY_COUNTS, styleCounts, StyleFilter, styleFilterCounts, StyleTier, TIER_LABEL, TIERS } from './admin';
import { StripGrid, stripGrid, stripTiles } from './make';

/**
 * 管理 · 風格表 (3e): every design language with its tier (✓ 已驗證 / ? 候選 / — 未上架, `PUT /beta/admin/styles/:id`)
 * and how its concepts were received (accepted / adjusted / redone, from the concept jobs' decisions).
 */
@Component({
  selector: 'app-admin-styles',
  templateUrl: './admin-styles.component.html',
  styleUrl: './admin-styles.component.scss',
})
export class AdminStylesComponent {
  /** All jobs (`GET /beta/admin/jobs`): the concept jobs among them carry the decisions. */
  readonly jobs = input<AdminJob[]>([]);
  protected readonly styles = signal<AdminStyle[]>([]);
  protected readonly filter = signal<StyleFilter>('all');
  protected readonly message = signal('');
  protected readonly grids = signal<Record<string, StripGrid>>({});
  protected readonly tiers = TIERS;
  protected readonly tierLabel = TIER_LABEL;
  protected readonly chips: { id: StyleFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'proven', label: '✓ 已驗證' },
    { id: 'candidate', label: '? 候選' },
    { id: 'unlisted', label: '— 未上架' },
  ];
  protected readonly counts = computed(() => styleFilterCounts(this.styles()));
  protected readonly decisions = computed(() => styleCounts(this.jobs()));
  protected readonly rows = computed(() => {
    const f = this.filter();
    return this.styles().filter((s) => f === 'all' || s.tier === f).map((s) => {
      const c = this.decisions()[s.id] ?? EMPTY_COUNTS;
      return { ...s, counts: c, rate: acceptance(c) };
    });
  });

  constructor() {
    this.load();
  }

  protected readonly tiles = (id: string) => {
    const g = this.grids()[id];
    return g ? stripTiles(g).map((t) => ({ ...t, ...g })) : null;
  };

  protected readGrid(id: string, img: HTMLImageElement) {
    this.grids.update((m) => ({ ...m, [id]: stripGrid(img.naturalWidth, img.naturalHeight) }));
  }

  /** Style ids whose tier change is still being saved; their select is disabled so a second change cannot race the rollback. */
  protected readonly saving = signal<Set<string>>(new Set());

  /** Change a style's tier; the row updates at once and falls back if the server refuses. */
  protected async setTier(s: AdminStyle, tier: StyleTier) {
    if (this.saving().has(s.id)) return;
    const before = s.tier;
    this.saving.update((set) => new Set(set).add(s.id));
    this.styles.update((list) => list.map((x) => (x.id === s.id ? { ...x, tier } : x)));
    try {
      const r = await fetch(`/beta/admin/styles/${encodeURIComponent(s.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
      this.message.set('');
    } catch (e) {
      this.styles.update((list) => list.map((x) => (x.id === s.id ? { ...x, tier: before } : x)));
      this.message.set(`分級沒有存成功：${(e as Error).message}`);
    } finally {
      this.saving.update((set) => {
        const next = new Set(set);
        next.delete(s.id);
        return next;
      });
    }
  }

  private async load() {
    try {
      const r = await fetch('/beta/admin/styles', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 403 ? '只有管理者可以使用' : `HTTP ${r.status}`);
      this.styles.set(await r.json());
    } catch (e) {
      this.message.set(`讀取風格失敗：${(e as Error).message}`);
    }
  }
}
