// Style presets: the fixed design rules of a style. The director only works inside them (which line gets which
// template, emphasis, accents, camera, and the song-specific scenery/palette). Derived from what the user approved.
import { MOVING_FORMS, motifStateAt } from './motif';
import { analyzeStructure, chorusSpans, sameLines, TitleCards, titleGaps, wantedTitleGaps } from './structure';
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
    templates: ['punch', 'stair', 'quiet', 'frame-split', 'typewriter', 'vertical', 'scatter', 'handwrite', 'title-card', 'beat-cut'],
    shotSec: [3.5, 8],
    rules: [
      '素材只畫風景與氛圍（天空、雲、光、海、城市、街道、自然景物），依歌詞意象決定場景與時段；不要畫人物，最多只能是很小、靜止的遠景剪影。',
      '影片只要自然的動態：雲流動、星星閃爍、光線變化、雨或霧、鏡頭緩慢推進或平移；不要奇幻特效（電光、爆炸、從手中噴出的光、魔法粒子）。特效由渲染器負責。',
      '一個鏡頭大約涵蓋 2 句歌詞（3.5–8 秒），不要每句換一次版型；整體節奏要有呼吸。',
      'transitionIn 的 flash 只用在段落轉換（例如副歌第一句），大約每個段落一次、不可連續；其他鏡頭用 cut、wipe 或 dissolve。',
      '版型：副歌與關鍵句優先用 beat-cut 或 scatter，punch（置中三行）整首最多用 2 次；敘事句用 frame-split 或 typewriter，抒情、留白的句子用 vertical 直排或 handwrite 手寫。同一首歌要用到至少 4 種版型，相鄰兩個鏡頭不要用同一種；不必死板輪流。',
      '配色依歌詞意象決定（例如夜空→靛藍、黃昏→橘紅、雨夜→灰藍），背景暗、文字亮，對比要夠。',
      '色彩要飽和、暗部要深、地平線或光源處有明亮的光帶；不可灰濛濛、低對比。歌詞說「褪色」「黯淡」時，只用在構圖或光量上，不要把整張圖畫成灰色。',
      '影片要有看得出速度與方向的自然動態（雲被風吹過、光線移動、水面、街上的燈流）；有天空時雲要明顯在動。不要變成特效秀。',
      '場景要具體到這首歌：從歌詞挑出這首歌獨有的地點與物件（例：施工中的車站、公園的鐘塔、電影院的座位），段落之間換不同的場景與時段；不要每首歌都畫黃昏雲海加城市地平線。構圖留出文字的空間。',
      '素材描述只寫畫什麼（地點、物件、時段、光線、構圖），不要寫畫風（anime、photo、painting 等）：畫風由程式依這首歌的媒材決定。',
      '文字壓在畫面主體上沒有關係，不需要刻意避開。',
      '重複的段落沿用畫面：第 2 次以後的副歌，至少一半的時間使用第 1 次副歌用過的素材組（可以換 clipStart 與運鏡），升級感靠配色、爆點與版型，不靠新素材。換畫面以段落為單位，不要一句換一個畫面。',
    ],
    assetSuffix: 'Background art for a lyric video: scenery and atmosphere only, no people or characters in focus, natural subtle motion, rich colors, deep shadows.',
  },
};

/** Style-level checks the director must satisfy (counts and pacing); returned as feedback errors. */
export function checkStyle(t: TreatmentV3, style: StylePreset, song: SongTimeline, win: Window, tier: Tier = 'standard', titleCards: TitleCards = 'ends'): string[] {
  const errors: string[] = [];
  const images = t.assets.filter((a) => a.kind === 'image').length;
  const videos = t.assets.filter((a) => a.kind === 'video').length;
  const spans = chorusSpans(analyzeStructure(song));
  const repeatSec = spans.slice(1).reduce((s, c) => s + Math.max(0, Math.min(c.end, win.end) - Math.max(c.start, win.start)), 0);
  const g = sceneCount(tier, win, repeatSec);
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
  // title cards over the gaps the user asked for (a design option, not a rule of the style)
  if (style.templates.includes('title-card')) {
    for (const gap of wantedTitleGaps(song, titleCards).filter((x) => x.start >= win.start - 0.5 && x.end <= win.end + 0.5)) {
      const covered = t.shots.filter((s) => s.template === 'title-card').reduce((sum, s) => sum + Math.max(0, Math.min(s.end, gap.end) - Math.max(s.start, gap.start)), 0);
      if (covered < 0.5 * (gap.end - gap.start)) errors.push(`${gap.start.toFixed(1)}–${gap.end.toFixed(1)} 秒沒有歌詞（${gap.kind}），要放 title-card 鏡頭`);
    }
  }
  // gaps without lyrics and without a title card must not be dead air: the motif keeps moving there
  if (t.motif) {
    for (const gap of titleGaps(song).filter((x) => x.start >= win.start - 0.5 && x.end <= win.end + 0.5)) {
      const carded = t.shots.some((s) => s.template === 'title-card' && s.start < gap.end && s.end > gap.start);
      if (carded) continue;
      let moving = 0;
      for (let x = gap.start; x < gap.end; x += 0.5) {
        const st = motifStateAt(t.motif, x).cur;
        if (MOVING_FORMS.includes(st.form) && st.intensity >= 0.6) moving += 0.5;
      }
      if (moving < 0.7 * (gap.end - gap.start)) errors.push(`${gap.start.toFixed(1)}–${gap.end.toFixed(1)} 秒沒有歌詞（${gap.kind}），主題物件要用會動的形態（${MOVING_FORMS.join('/')}，intensity ≥ 0.6），不能只剩背景`);
    }
  }
  // a mask darkens everything outside the motif: lyrics there become hard to read
  if (t.motif) {
    const sung = (a: number, b: number) => song.cues.some((c) => c.start < b && c.end > a);
    t.motif.sections.forEach((s, i) => {
      const end = t.motif!.sections[i + 1]?.start ?? win.end;
      if (s.form === 'mask' && s.intensity > 0 && sung(s.start, end)) errors.push(`主題物件 ${s.start.toFixed(1)}–${end.toFixed(1)} 秒用了 mask，但這段有歌詞；mask 只能用在沒有歌詞的段落`);
    });
  }
  // a repeated line reuses its scene but not its layout: the same words in the same template read as a copy
  {
    const same = sameLines(song);
    const tmpl = (cueId: string) => t.shots.find((s) => s.id === t.cues.find((c) => c.cueId === cueId)?.shot)?.template;
    const pairs = [...same].filter(([id, src]) => tmpl(id) && tmpl(src));
    const copies = pairs.filter(([id, src]) => tmpl(id) === tmpl(src));
    if (pairs.length >= 3 && copies.length > pairs.length / 2) errors.push(`重複的歌詞有 ${copies.length}/${pairs.length} 句用了和第一次相同的版型（${copies.slice(0, 4).map(([id, src]) => `${id}=${src}`).join('、')}）；重複的段落沿用畫面，但版型要換，讓副歌逐次升級`);
  }
  // later choruses reuse the first chorus's scenes for at least half their time
  const assetsIn = (a: number, b: number) => new Set(t.shots.filter((s) => s.asset && s.end > a && s.start < b).map((s) => s.asset!));
  const first = spans[0];
  if (first && first.start >= win.start - 0.5 && first.end <= win.end + 0.5) {
    const source = assetsIn(first.start, first.end);
    spans.slice(1).forEach((c, k) => {
      if (c.start < win.start || c.end > win.end + 0.5) return;
      let reused = 0;
      for (const s of t.shots) if (s.asset && source.has(s.asset)) reused += Math.max(0, Math.min(s.end, c.end) - Math.max(s.start, c.start));
      if (reused < 0.5 * (c.end - c.start)) errors.push(`第 ${k + 2} 次副歌（${c.start.toFixed(1)}–${c.end.toFixed(1)} 秒）只有 ${Math.round((100 * reused) / (c.end - c.start))}% 的時間沿用第 1 次副歌的素材，至少要一半`);
    });
  }
  // variety: no template twice in a row, and use most of the style's templates over a longer window
  t.shots.forEach((s, i) => {
    if (i > 0 && s.template === t.shots[i - 1].template && s.template !== 'title-card') errors.push(`鏡頭 ${t.shots[i - 1].id}、${s.id} 連續使用 ${s.template}，相鄰鏡頭要換版型`);
  });
  const used = new Set(t.shots.map((s) => s.template)).size;
  const want = Math.min(4, style.templates.length, t.shots.length - 1);
  if (used < want) errors.push(`只用了 ${used} 種版型，這個長度至少要 ${want} 種`);
  // pacing: interior shots must fall in the range (the first/last may be clipped by the window)
  t.shots.forEach((s, i) => {
    const len = s.end - s.start;
    // the first/last shot may be cut short by the window, never longer than the maximum
    const edge = i === 0 || i === t.shots.length - 1;
    // a title card spans its whole gap without lyrics, however long
    if (s.template === 'title-card') return;
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
