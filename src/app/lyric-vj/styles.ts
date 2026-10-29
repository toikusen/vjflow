// Style presets: the fixed design rules of a style. The director only works inside them (which line gets which
// template, emphasis, accents, camera, and the song-specific scenery/palette). Derived from what the user approved.
import { type DesignLanguage, LANGUAGES, type LanguageId } from './languages';
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
/** Time an input field takes to type a line out before the whole line can be read (s). */
const INPUT_TYPING = 0.4;

/**
 * The templates a treatment may use: an interface language's own list (it has its own layout); otherwise the ones both
 * the style and the language allow (the two lists used to be checked apart, and 138 of the director's retries were
 * templates one list allowed and the other refused). The director's schema offers this same set.
 */
export function templatesFor(style: Pick<StylePreset, 'templates'>, lang?: Pick<DesignLanguage, 'templates' | 'layout'>): string[] {
  if (!lang) return style.templates;
  if (lang.layout) return lang.templates;
  return style.templates.filter((x) => lang.templates.includes(x));
}

export function checkStyle(t: TreatmentV3, style: StylePreset, song: SongTimeline, win: Window, tier: Tier = 'standard', titleCards: TitleCards = 'ends'): string[] {
  // a storyboard design is drawn by its parts and checked by its own rules (scene.ts) and on its frames: the caption
  // rules here (pictures per tier, templates per shot, shot lengths) do not apply to it
  if (t.storyboard?.length) return [];
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
  // a chosen design language brings its own templates and its own picture rules: the style's list left out the phone's
  // chat, notify and input, and the two checks sent 天文対話 back and forth until it failed
  const lang = LANGUAGES[((t as { language?: string }).language ?? t.design?.language) as LanguageId];
  const templates = templatesFor(style, lang);
  for (const s of t.shots) {
    if (!templates.includes(s.template)) errors.push(`鏡頭 ${s.id} 的模板 ${s.template} 不屬於${lang ? `設計語言「${lang.name}」${lang.layout ? '' : `在風格「${style.name}」裡`}` : `風格「${style.name}」`}（可用：${templates.join('、')}）`);
    if (!s.asset && !(lang?.photos === false || lang?.photos === 'attached')) errors.push(`鏡頭 ${s.id} 沒有素材；這個風格每個鏡頭都要有素材`);
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
  // a language with its own layout rules (an interface: a chat runs many shots) replaces the generic ones below
  const own = lang?.layout;
  // a repeated line reuses its scene but not its layout: the same words in the same template read as a copy
  if (!own?.repeatOk) {
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
  if (!own?.repeatOk) t.shots.forEach((s, i) => {
    if (i > 0 && s.template === t.shots[i - 1].template && s.template !== 'title-card') errors.push(`鏡頭 ${t.shots[i - 1].id}、${s.id} 連續使用 ${s.template}，相鄰鏡頭要換版型`);
  });
  // an interface's lyrics live in its own templates, each line marked with who says it on the screen
  if (own) {
    // every shot that carries lyrics counts, whatever its template (a quiet shot full of lines dodged the share)
    const lyricShots = t.shots.filter((s) => t.cues.some((c) => c.shot === s.id));
    const inUi = lyricShots.filter((s) => own.lyrics.includes(s.template));
    if (lyricShots.length && inUi.length < own.share * lyricShots.length)
      errors.push(`有歌詞的鏡頭只有 ${inUi.length}/${lyricShots.length} 個用介面版型（${own.lyrics.join('、')}），至少要 ${Math.round(own.share * 100)}%：先決定每句在螢幕上是傳出、收到、輸入還是通知，再選版型`);
    errors.push(...attachmentErrors(t, false));
    // an input field shows one line at a time and the next replaces it, and is read only once typed out: a line sung
    // faster than it reads plus its typing (いっせーので: 1.69 s sung, 1.5 s to read, readable 1.39 s) is gone
    // before it is read there (天文対話's いっせーので／言ってみたい), while a chat keeps it up in the thread
    const byId = new Map(song.cues.map((c) => [c.id, c]));
    const rushed = t.cues.filter((c) => t.shots.find((s) => s.id === c.shot)?.template === 'input').map((c) => byId.get(c.cueId)).filter((c): c is NonNullable<typeof c> => !!c && c.end - c.start < [...c.text.replace(/\s/g, '')].length / 12 + 1 + INPUT_TYPING);
    if (rushed.length) errors.push(`這些句子唱得太快，放在 input（一次一句、下一句就換掉）來不及讀，改用 chat（訊息會留在對話串）：${rushed.map((c) => `${c.id}「${c.text}」`).join('、')}`);
    const unmarked = t.cues.filter((c) => inUi.some((s) => s.id === c.shot) && !c.voice).map((c) => c.cueId);
    if (unmarked.length) errors.push(`介面鏡頭裡的歌詞要填 voice（me 自己／them 對方）：${unmarked.slice(0, 8).join('、')}${unmarked.length > 8 ? ` 等 ${unmarked.length} 句` : ''}`);
  }
  const used = new Set(t.shots.map((s) => s.template)).size;
  const want = Math.min(own?.minTemplates ?? 4, templates.length, t.shots.length - 1);
  if (used < want) errors.push(`只用了 ${used} 種版型，這個長度至少要 ${want} 種`);
  // pacing: interior shots must fall in the range (the first/last may be clipped by the window)
  t.shots.forEach((s, i) => {
    const len = s.end - s.start;
    // the first/last shot may be cut short by the window, never longer than the maximum
    const edge = i === 0 || i === t.shots.length - 1;
    // a title card spans its whole gap without lyrics, however long
    if (s.template === 'title-card') return;
    const [lo, hi] = own?.shotSec ?? style.shotSec;
    if ((!edge && len < lo - 0.3) || len > hi + 0.3) {
      errors.push(`鏡頭 ${s.id} 長 ${len.toFixed(1)} 秒，這個風格要 ${lo}–${hi} 秒${own ? '' : '（約 2 句一個鏡頭）'}`);
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

/**
 * What is wrong with a design's chat attachments: a photo must be one of the song's pictures, and (once the design
 * has written its story props, `withProps`) a sticker must be one of its props — a missing one was simply not drawn.
 */
export function attachmentErrors(t: Pick<TreatmentV3, 'shots' | 'assets' | 'graphics'>, withProps: boolean): string[] {
  const out: string[] = [];
  for (const s of t.shots) {
    const kind = s.params['attachKind'];
    const id = String(s.params['attach'] ?? '').trim().replace(/^spr:/, '');
    if (kind !== 'photo' && kind !== 'sticker') continue;
    if (!id) out.push(`鏡頭 ${s.id} 的附件（${kind}）沒有填 attach`);
    else if (kind === 'photo' && !t.assets.some((a) => a.id === id)) out.push(`鏡頭 ${s.id} 傳的照片 ${id} 不在 assets 裡：先在 assets 加上這張照片（手機隨手拍的樣子），或改用已有的`);
    else if (kind === 'sticker' && withProps && !(t.graphics?.storyProps ?? []).some((p) => p.id === id)) out.push(`鏡頭 ${s.id} 傳的貼圖 ${id} 沒有列在 story 的 props：要列出它（what 寫貼圖的樣子），不然畫不出來`);
  }
  return out;
}
