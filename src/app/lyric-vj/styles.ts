// Style presets: the fixed design rules of a style. The director only works inside them (which line gets which
// template, emphasis, accents, camera, and the song-specific scenery/palette). Derived from what the user approved.
import { SongTimeline } from './timeline';
import { cuesIn, TreatmentV3, Window } from './treatment';

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  templates: string[];
  assets: { images: [number, number]; videos: [number, number] };
  /** Shot length range in seconds. */
  shotSec: [number, number];
  /** Rules written into the director prompt (Traditional Chinese). */
  rules: string[];
  /** Appended to every asset prompt. */
  assetSuffix: string;
}

export const STYLES: Record<string, StylePreset> = {
  emotional: {
    id: 'emotional',
    name: '情緒型',
    description: '抒情、帶故事感的歌詞 VJ：風景與氛圍為底，大字與框線交替，動態自然、特效對拍。',
    templates: ['punch', 'frame-split'],
    assets: { images: [1, 1], videos: [1, 1] },
    shotSec: [3.5, 8],
    rules: [
      '素材只畫風景與氛圍（天空、雲、光、海、城市、街道、自然景物），依歌詞意象決定場景與時段；不要畫人物，最多只能是很小、靜止的遠景剪影。',
      '影片只要自然的動態：雲流動、星星閃爍、光線變化、雨或霧、鏡頭緩慢推進或平移；不要奇幻特效（電光、爆炸、從手中噴出的光、魔法粒子）。特效由渲染器負責。',
      '恰好 1 張 image 與 1 段 video（from 那張 image）。同一段 video 可以給多個鏡頭使用，用 clipStart（影片內開始秒數）與不同運鏡做出變化。',
      '一個鏡頭大約涵蓋 2 句歌詞（3.5–8 秒），不要每句換一次版型；整體節奏要有呼吸。',
      'transitionIn 的 flash 只用在段落開始的鏡頭；其他鏡頭用 cut、wipe 或 dissolve。',
      '字體：關鍵句用 punch 滿版大字，敘事句用 frame-split；兩者交替但不必死板輪流。',
      '配色依歌詞意象決定（例如夜空→靛藍、黃昏→橘紅、雨夜→灰藍），背景暗、文字亮，對比要夠。',
      '文字壓在畫面主體上沒有關係，不需要刻意避開。',
    ],
    assetSuffix: 'Background art for a lyric video: scenery and atmosphere only, no people or characters in focus, natural subtle motion, painterly anime background style.',
  },
};

/** Style-level checks the director must satisfy (counts and pacing); returned as feedback errors. */
export function checkStyle(t: TreatmentV3, style: StylePreset, song: SongTimeline, win: Window): string[] {
  const errors: string[] = [];
  const images = t.assets.filter((a) => a.kind === 'image').length;
  const videos = t.assets.filter((a) => a.kind === 'video').length;
  const [i0, i1] = style.assets.images;
  const [v0, v1] = style.assets.videos;
  if (images < i0 || images > i1) errors.push(`風格「${style.name}」需要 ${i0}–${i1} 張 image，目前 ${images}`);
  if (videos < v0 || videos > v1) errors.push(`風格「${style.name}」需要 ${v0}–${v1} 段 video，目前 ${videos}`);
  for (const s of t.shots) {
    if (!style.templates.includes(s.template)) errors.push(`鏡頭 ${s.id} 的模板 ${s.template} 不屬於風格「${style.name}」`);
    if (!s.asset) errors.push(`鏡頭 ${s.id} 沒有素材；這個風格每個鏡頭都要有素材`);
  }
  // pacing: interior shots must fall in the range (the first/last may be clipped by the window)
  t.shots.forEach((s, i) => {
    const len = s.end - s.start;
    const edge = i === 0 || i === t.shots.length - 1;
    if (!edge && (len < style.shotSec[0] - 0.3 || len > style.shotSec[1] + 0.3)) {
      errors.push(`鏡頭 ${s.id} 長 ${len.toFixed(1)} 秒，這個風格要 ${style.shotSec[0]}–${style.shotSec[1]} 秒（約 2 句一個鏡頭）`);
    }
  });
  const sectionStarts = [win.start, ...song.sections.map((s) => s.start)];
  for (const s of t.shots) {
    if (s.transitionIn === 'flash' && !sectionStarts.some((x) => Math.abs(x - s.start) <= 1)) {
      errors.push(`鏡頭 ${s.id} 用了 flash，但不在段落開頭（flash 只用在段落開始）`);
    }
  }
  if (!cuesIn(song, win).length) errors.push('範圍內沒有歌詞');
  return errors;
}
