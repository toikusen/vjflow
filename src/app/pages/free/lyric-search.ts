import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LyricHit, searchLyrics } from '../../lyric-vj/lyric-lookup';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** How far an entry's length may be from the audio's before it is probably another edit, s. */
const FAR = 3;

/** Optional search of the public lyric database; nothing is used until the person has read it and said so. */
@Component({
  selector: 'app-lyric-search',
  imports: [FormsModule],
  templateUrl: './lyric-search.html',
  styleUrl: './lyric-search.scss',
})
export class LyricSearch {
  /** The audio's length, to say which entries fit it. */
  readonly seconds = input(0);
  readonly chosen = output<LyricHit>();

  protected readonly clock = clock;
  protected readonly track = signal('');
  protected readonly artist = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly hits = signal<LyricHit[] | undefined>(undefined);
  protected readonly open = signal<LyricHit | undefined>(undefined);

  protected async search() {
    if (this.busy() || !this.track().trim()) return;
    this.busy.set(true);
    this.error.set('');
    this.open.set(undefined);
    try {
      this.hits.set(await searchLyrics(this.track(), this.artist()));
    } catch (e) {
      this.hits.set(undefined);
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected far(h: LyricHit) {
    return this.seconds() > 0 && h.duration > 0 && Math.abs(h.duration - this.seconds()) > FAR;
  }
}
