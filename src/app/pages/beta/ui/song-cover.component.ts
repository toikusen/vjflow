import { Component, computed, input, signal } from '@angular/core';
import { BetaSong, songCover } from '../beta';

/**
 * A song's tile: a frame of its own video filling it, or (no cover yet, or the image failed) the full title in the
 * display face on the song's gradient, two lines at most. The tile's size is the host's; the type follows it.
 */
@Component({
  selector: 'app-song-cover',
  template: `
    @if (image(); as src) {
      <img [src]="src" alt="" loading="lazy" decoding="async" (error)="failed.set(src)" />
    } @else {
      <span class="type" [style.background]="fallback().background"><span class="name">{{ fallback().title }}</span></span>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      container-type: inline-size;
      background: var(--surface-2);
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .type {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 8cqi;
      box-sizing: border-box;
    }
    .name {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      font: 700 clamp(9px, 11cqi, 30px) / 1.2 var(--font-display);
      color: #fff;
      text-align: center;
      text-wrap: balance;
      overflow-wrap: anywhere;
      text-shadow: 0 1px 8px #0006;
    }
  `,
})
export class SongCoverComponent {
  readonly song = input.required<Pick<BetaSong, 'id' | 'title' | 'coverAt'>>();
  /** The image that failed to load: the title stands in until a newer cover comes. */
  protected readonly failed = signal('');
  private readonly cover = computed(() => songCover(this.song()));
  protected readonly image = computed(() => {
    const c = this.cover();
    return 'image' in c && c.image !== this.failed() ? c.image : '';
  });
  protected readonly fallback = computed(() => songCover({ ...this.song(), coverAt: undefined }) as { title: string; background: string });
}
