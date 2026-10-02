// Style presets: the fixed design rules of a style. The director only works inside them (which line gets which
// template, emphasis, accents, camera, and the song-specific scenery/palette). Derived from what the user approved.
import { sceneCount, Tier, TIERS } from './tiers';
import { SongTimeline } from './timeline';
import { cuesIn, TreatmentV3, Window } from './treatment';

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  templates: string[];
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
    templates: ['punch', 'frame-split', 'typewriter', 'vertical', 'scatter', 'handwrite'],
    shotSec: [3.5, 8],
    rules: [
      '素材只畫風景與氛圍（天空、雲、光、海、城市、街道、自然景物），依歌詞意象決定場景與時段；不要畫人物，最多只能是很小、靜止的遠景剪影。',
      '影片只要自然的動態：雲流動、星星閃爍、光線變化、雨或霧、鏡頭緩慢推進或平移；不要奇幻特效（電光、爆炸、從手中噴出的光、魔法粒子）。特效由渲染器負責。',
      '一個鏡頭大約涵蓋 2 句歌詞（3.5–8 秒），不要每句換一次版型；整體節奏要有呼吸。',
      'transitionIn 的 flash 只用在段落轉換（例如副歌第一句），大約每個段落一次、不可連續；其他鏡頭用 cut、wipe 或 dissolve。',
      '版型：關鍵句用 punch 或 scatter，敘事句用 frame-split 或 typewriter，抒情、留白的句子用 vertical 直排或 handwrite 手寫。同一首歌要用到至少 4 種版型，相鄰兩個鏡頭不要用同一種；不必死板輪流。',
      '配色依歌詞意象決定（例如夜空→靛藍、黃昏→橘紅、雨夜→灰藍），背景暗、文字亮，對比要夠。',
      '色彩要飽和、暗部要深、地平線或光源處有明亮的光帶；不可灰濛濛、低對比。歌詞說「褪色」「黯淡」時，只用在構圖或光量上，不要把整張圖畫成灰色。',
      '雲的移動是這個風格最重要的畫面質感：影片裡的雲要明顯在動（鏡頭緩慢往地平線推進、雲層被風吹過、雲層散開露出星空），看得出速度與方向；可以有一兩顆流星，但不要變成特效秀。',
      '構圖參考：上方大片深色天空、下方地平線有發光的城市或景物輪廓，中間留給文字。',
      '文字壓在畫面主體上沒有關係，不需要刻意避開。',
    ],
    assetSuffix: 'Background art for a lyric video: scenery and atmosphere only, no people or characters in focus, natural subtle motion, painterly anime background style, rich saturated colors, deep shadows, luminous horizon, clearly drifting clouds.',
  },
};

/** Style-level checks the director must satisfy (counts and pacing); returned as feedback errors. */
export function checkStyle(t: TreatmentV3, style: StylePreset, song: SongTimeline, win: Window, tier: Tier = 'standard'): string[] {
  const errors: string[] = [];
  const images = t.assets.filter((a) => a.kind === 'image').length;
  const videos = t.assets.filter((a) => a.kind === 'video').length;
  const g = sceneCount(tier, win);
  const name = TIERS[tier].name;
  // rich must actually use its scenes: at least 60 % of the allowance
  const min = tier === 'rich' ? Math.max(1, Math.ceil(g * 0.6)) : 1;
  if (images < min || images > g) errors.push(`「${name}」版本在這個長度要 ${min}–${g} 張 image，目前 ${images}`);
  if (TIERS[tier].video && (videos < min || videos > images)) errors.push(`「${name}」版本每張 image 都要有 video（${min}–${images} 段），目前 ${videos}`);
  if (!TIERS[tier].video && videos > 0) errors.push(`「${name}」版本不可有 video 素材`);
  for (const s of t.shots) {
    if (!style.templates.includes(s.template)) errors.push(`鏡頭 ${s.id} 的模板 ${s.template} 不屬於風格「${style.name}」`);
    if (!s.asset) errors.push(`鏡頭 ${s.id} 沒有素材；這個風格每個鏡頭都要有素材`);
  }
  // variety: no template twice in a row, and use most of the style's templates over a longer window
  t.shots.forEach((s, i) => {
    if (i > 0 && s.template === t.shots[i - 1].template) errors.push(`鏡頭 ${t.shots[i - 1].id}、${s.id} 連續使用 ${s.template}，相鄰鏡頭要換版型`);
  });
  const used = new Set(t.shots.map((s) => s.template)).size;
  const want = Math.min(4, style.templates.length, t.shots.length - 1);
  if (used < want) errors.push(`只用了 ${used} 種版型，這個長度至少要 ${want} 種`);
  // pacing: interior shots must fall in the range (the first/last may be clipped by the window)
  t.shots.forEach((s, i) => {
    const len = s.end - s.start;
    // the first/last shot may be cut short by the window, never longer than the maximum
    const edge = i === 0 || i === t.shots.length - 1;
    if ((!edge && len < style.shotSec[0] - 0.3) || len > style.shotSec[1] + 0.3) {
      errors.push(`鏡頭 ${s.id} 長 ${len.toFixed(1)} 秒，這個風格要 ${style.shotSec[0]}–${style.shotSec[1]} 秒（約 2 句一個鏡頭）`);
    }
  });
  // flashes are rationed, not pinned to detected section starts (the analyser's boundaries can be off by bars)
  const sections = song.sections.filter((s) => s.end > win.start && s.start < win.end).length || 1;
  const flashes = t.shots.filter((s) => s.transitionIn === 'flash');
  if (flashes.length > sections) errors.push(`flash 用了 ${flashes.length} 次，這個範圍最多 ${sections} 次（約每個段落一次）`);
  t.shots.forEach((s, i) => {
    if (i > 0 && s.transitionIn === 'flash' && t.shots[i - 1].transitionIn === 'flash') errors.push(`鏡頭 ${t.shots[i - 1].id}、${s.id} 連續使用 flash`);
  });
  const cues = cuesIn(song, win);
  if (!cues.length) errors.push('範圍內沒有歌詞');
  return errors;
}
