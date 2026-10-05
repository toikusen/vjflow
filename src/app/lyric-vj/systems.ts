// Design systems: the visual language a song is built in. Four songs made in the same system (a centred line-art
// motif over a picture) read as one person's template, so the director picks a system per song, different from the
// songs made just before, and each system constrains templates, motif, media, peaks and how much picture shows.
import type { PeakStyle, TechniqueId } from './design';
import type { MediumId } from './medium';

export type SystemId = 'stage' | 'cinema' | 'poster' | 'notebook';

export interface DesignSystem {
  name: string;
  /** For the director: what the system looks like and what kind of song it suits. */
  desc: string;
  templates: string[];
  /** Whether a program-drawn motif carries the song. */
  motif: boolean;
  /** Letterbox bars for the whole song. */
  letterbox: boolean;
  media: MediumId[];
  peaks: PeakStyle[];
  /** Range for colour stops' `image` (how much of the picture shows). */
  image: [number, number];
  techniques: TechniqueId[];
}

const ALL_TECHNIQUES: TechniqueId[] = ['echo', 'skeleton', 'title-hook', 'flash', 'quiet'];

export const SYSTEMS: Record<SystemId, DesignSystem> = {
  stage: {
    name: '舞台',
    desc: '一個程式畫的發光線條主題物件（時鐘／多邊形／軌道）貫穿全曲，歌詞以它為舞台，副歌時物件變成隧道或碎片。適合有一個明確象徵物、偏電子或舞台感的歌',
    templates: ['punch', 'stair', 'quiet', 'frame-split', 'typewriter', 'vertical', 'scatter', 'handwrite', 'title-card', 'beat-cut'],
    motif: true, letterbox: false, media: ['clean', 'film', 'paper', 'crayon', 'cutout', 'pixel'], peaks: ['rays', 'beams', 'vacuum', 'burst'], image: [0, 1], techniques: ALL_TECHNIQUES,
  },
  cinema: {
    name: '電影',
    desc: '像一部電影：全曲上下黑邊的寬銀幕，背景照片完整露出、慢慢運鏡，沒有任何圖形物件；歌詞像字幕或片名，細字、偏下方或側邊、直排，靠留白與溶接說故事。適合敘事、抒情、季節感、有具體場景的歌',
    templates: ['typewriter', 'quiet', 'vertical', 'handwrite', 'frame-split', 'stair', 'title-card'],
    motif: false, letterbox: true, media: ['film', 'clean', 'paper'], peaks: ['vacuum', 'beams'], image: [0.7, 1], techniques: ['quiet', 'title-hook', 'skeleton'],
  },
  poster: {
    name: '海報',
    desc: '文字就是畫面：背景照片幾乎看不見，只剩大膽的平面雙色，每段換一組顏色；巨字、直排、階梯、逐詞切換撐滿畫面，像一張張動起來的音樂海報。沒有圖形物件。適合節奏強、歌詞有力、口號感的歌',
    templates: ['beat-cut', 'stair', 'vertical', 'scatter', 'punch', 'title-card', 'quiet'],
    motif: false, letterbox: false, media: ['clean', 'pixel', 'cutout', 'film'], peaks: ['vacuum', 'beams'], image: [0, 0.25], techniques: ALL_TECHNIQUES,
  },
  notebook: {
    name: '手帳',
    desc: '手作的筆記本或繪本：紙、蠟筆或剪紙的質地，手寫字與打字機字，構圖偏左右、留大量白，像寫在紙上的日記；沒有發光線條與圖形物件。適合溫柔、青春、日常、可愛的歌',
    templates: ['handwrite', 'typewriter', 'vertical', 'stair', 'quiet', 'scatter', 'title-card'],
    motif: false, letterbox: false, media: ['paper', 'crayon', 'cutout'], peaks: ['vacuum', 'beams'], image: [0.5, 1], techniques: ['quiet', 'title-hook', 'skeleton'],
  },
};

/** What a song was made with, kept so the next songs can be told apart from it. */
export interface DesignRecord {
  song: string;
  system: SystemId;
  font: string;
  medium?: MediumId;
  motif?: string;
  peak?: PeakStyle;
}

/** Systems the director may pick: not one of the `recent` songs' systems, unless that leaves none. */
export function availableSystems(recent: DesignRecord[]): SystemId[] {
  const used = new Set(recent.map((r) => r.system));
  const free = (Object.keys(SYSTEMS) as SystemId[]).filter((s) => !used.has(s));
  return free.length ? free : (Object.keys(SYSTEMS) as SystemId[]);
}
