import { AfterViewInit, Component, computed, input, output, viewChild } from '@angular/core';
import { InstantStage, StageSong } from '../free/instant-stage';
import type { SongTimeline } from '../../lyric-vj/timeline';
import { BetaSong } from './beta';
import { loadPick, paidLine, readProblem, savePick, songAudioUrl, songTimingUrl } from './song-flow';

/**
 * 做影片 on a song's page, for its owner: the song's confirmed lyrics and audio from the server on the instant stage.
 * Everything after those two GETs happens in the tab: no job, no render on the server, no credit, no upload.
 */
@Component({
  selector: 'app-song-flow',
  imports: [InstantStage],
  templateUrl: './song-flow.component.html',
  styleUrl: './song-flow.component.scss',
})
export class SongFlowComponent implements AfterViewInit {
  readonly song = input.required<BetaSong>();
  /** Paid concepts waiting for a decision further down the page. */
  readonly pending = input(0);
  /** 看付費方案. */
  readonly paid = output<void>();

  protected readonly stage = viewChild.required(InstantStage);
  protected readonly paidLine = computed(() => paidLine(this.pending()));
  protected readonly timingHref = computed(() => `/timing?beta=${this.song().id}`);
  protected readonly timingNote = computed(() => (this.song().timingSkipped ? '這首歌的歌詞時間沒有檢查過，影片裡可能有對不上的地方。' : ''));

  ngAfterViewInit() {
    const pick = loadPick(this.song().id);
    if (!pick) return;
    this.stage().styleId.set(pick.styleId);
    this.stage().seed.set(pick.seed);
  }

  protected readonly source = async (): Promise<StageSong> => {
    const { id } = this.song();
    const r = await fetch(songTimingUrl(id), { cache: 'no-store' });
    if (!r.ok) throw new Error(readProblem(r.status));
    const song = (await r.json()) as SongTimeline;
    if (!song.cues?.length) throw new Error('這首歌沒有歌詞時間，請先到「編輯歌詞時間」。');
    const { audio } = this.stage();
    if (!audio.src.endsWith(songAudioUrl(id))) audio.src = songAudioUrl(id);
    return { song };
  };

  protected readonly audioFile = async () => {
    const r = await fetch(songAudioUrl(this.song().id));
    if (!r.ok) throw new Error(readProblem(r.status));
    return r.arrayBuffer();
  };

  protected remember() {
    const stage = this.stage();
    savePick(this.song().id, { styleId: stage.styleId(), seed: stage.seed() });
  }
}
