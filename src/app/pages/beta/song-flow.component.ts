import { AfterViewInit, Component, computed, input, output, viewChild } from '@angular/core';
import { audioReadingOf, decodeMono } from '../../lyric-vj/free-audio';
import { InstantStage, StageSong } from '../free/instant-stage';
import type { SongTimeline } from '../../lyric-vj/timeline';
import { BetaSong } from './beta';
import { DRAFT_HOLD, draftSong, loadPick, paidLine, readProblem, savePick, songAudioUrl, songLyricsUrl, songTimingUrl, songUploadUrl } from './song-flow';

/**
 * 做影片 on a song's page, for its owner: the song's lyrics and audio from the server on the instant stage. While the
 * song is prepared (`draft`) the times are guessed in the tab from the upload; after, they are the aligned ones.
 * Everything after the GETs happens in the tab: no job, no render on the server, no credit, no upload.
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
  /** The song is still being prepared: a draft from its upload, no export. */
  readonly draft = input(false);
  /** 看付費方案. */
  readonly paid = output<void>();

  protected readonly stage = viewChild.required(InstantStage);
  // the optional query: the heading reads it before the stage exists
  private readonly stageNow = viewChild(InstantStage);
  protected readonly styleNow = computed(() => this.stageNow()?.styleName() ?? '');
  protected readonly paidLine = computed(() => paidLine(this.pending()));
  protected readonly timingHref = computed(() => `/timing?beta=${this.song().id}`);
  protected readonly timingNote = computed(() =>
    this.draft() ? '' : this.song().timingSkipped || !this.song().confirmedAt ? '這首歌的歌詞時間是自動對的，還沒檢查過，影片裡可能有對不上的地方。' : '',
  );
  protected readonly exportHold = computed(() => (this.draft() ? DRAFT_HOLD : ''));
  /** The draft's reading of the upload, made once: 換一版 and a style change reuse it. */
  private drafted?: Promise<StageSong>;

  ngAfterViewInit() {
    const pick = loadPick(this.song().id);
    if (pick) {
      this.stage().styleId.set(pick.styleId);
      this.stage().seed.set(pick.seed);
    }
    // the free video is built on arrival (in the browser, a second or so) and waits for 播放; 立即生成 stays as the retry
    void this.stage().generate();
  }

  protected readonly source = async (): Promise<StageSong> => {
    if (this.draft()) return (this.drafted ??= this.readDraft()).catch((e) => {
      this.drafted = undefined;
      throw e;
    });
    const { id } = this.song();
    const r = await fetch(songTimingUrl(id), { cache: 'no-store' });
    if (!r.ok) throw new Error(readProblem(r.status));
    const song = (await r.json()) as SongTimeline;
    if (!song.cues?.length) throw new Error('這首歌沒有歌詞時間，請先到「編輯歌詞時間」。');
    const { audio } = this.stage();
    if (!audio.src.endsWith(songAudioUrl(id))) audio.src = songAudioUrl(id);
    return { song };
  };

  private async readDraft(): Promise<StageSong> {
    const { id, title } = this.song();
    const [lr, ar] = await Promise.all([fetch(songLyricsUrl(id), { cache: 'no-store' }), fetch(songUploadUrl(id))]);
    if (!lr.ok) throw new Error(readProblem(lr.status));
    if (!ar.ok) throw new Error(readProblem(ar.status));
    const { samples, seconds } = await decodeMono(await ar.blob());
    const song = draftSong(((await lr.json()) as { lyrics: string }).lyrics, title, seconds, await audioReadingOf(samples));
    const { audio } = this.stage();
    if (!audio.src.endsWith(songUploadUrl(id))) audio.src = songUploadUrl(id);
    return { song };
  }

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
