// Treatment v3: the director owns presentation only. Lyric text and timing come from the SongTimeline and are
// never read from the treatment; this module validates a treatment and repairs what it safely can.
import type { GraphicsLook } from './render/graphics';
import type { CustomSceneSpec } from './render/custom-scene';
import { Fonts } from './fonts';
import type { ArcPoint, Moment } from './moments';
import { Design, validateDesign } from './design';
import { MotifPlan, validateMotif } from './motif';
import { validateMoments } from './moments';
import { phraseBoundaries } from './phrases';
import { COLOR_SHARE, keyWords, sameLines } from './structure';
import { SongTimeline } from './timeline';

export type EnterKind = 'pop' | 'slam' | 'wipe' | 'fade' | 'cut';
export type ExitKind = 'burst' | 'fade' | 'rise' | 'cut';
export type Camera = 'static' | 'push' | 'pan' | 'parallax';
export type TransitionIn = 'cut' | 'flash' | 'wipe' | 'dissolve';
export type EmphasisMethod = 'scale' | 'color' | 'glow' | 'shake';

export const ENTER_KINDS: EnterKind[] = ['pop', 'slam', 'wipe', 'fade', 'cut'];
export const EXIT_KINDS: ExitKind[] = ['burst', 'fade', 'rise', 'cut'];
export const CAMERAS: Camera[] = ['static', 'push', 'pan', 'parallax'];
export const TRANSITIONS: TransitionIn[] = ['cut', 'flash', 'wipe', 'dissolve'];
export const EMPHASIS_METHODS: EmphasisMethod[] = ['scale', 'color', 'glow', 'shake'];

export interface Palette {
  background: string;
  text: string;
  accent: string;
  line: string;
  glow: string;
}

export interface AssetSpec {
  id: string;
  kind: 'image' | 'video';
  /** Must not ask for any text in the picture. */
  prompt: string;
  /** video: the image used as the first frame. */
  from?: string;
  layering?: 'single' | 'depth';
}

export type ParamValue = number | string | boolean;

export interface Shot {
  id: string;
  start: number;
  end: number;
  template: string;
  params: Record<string, ParamValue>;
  asset?: string;
  /** Seconds into a video asset where this shot starts playing (lets several shots reuse one clip differently). */
  clipStart?: number;
  camera: Camera;
  transitionIn: TransitionIn;
}

export interface Emphasis {
  /** Character range [from, to) in the cue text. */
  from: number;
  to: number;
  method: EmphasisMethod;
}

export interface CueStyle {
  cueId: string;
  shot: string;
  /** Line breaks as character indexes into the cue text, ascending. */
  rows?: number[];
  emphasis?: Emphasis[];
  /** Beats to hit, counted from the first beat at or after the cue start (0 = that beat). */
  accents?: number[];
  enter: EnterKind;
  exit: ExitKind;
  variant?: string;
  /** 'word': characters appear as they are sung (needs charStarts); 'line' (default): the line enters at once. */
  reveal?: 'line' | 'word';
}

export interface TreatmentV3 {
  concept: string;
  styleAnchor: { prompt: string; palette: Palette; fonts?: Fonts };
  assets: AssetSpec[];
  shots: Shot[];
  cues: CueStyle[];
  /** Intensity 0..3 through the song (see moments.ts). */
  arc?: ArcPoint[];
  /** Build-ups, drops, breaks, holds and the finale at section boundaries. */
  moments?: Moment[];
  /** Per-song type and colour system (design.ts). */
  design?: Design;
  /** The song's motif drawn by the engine (motif.ts). */
  motif?: MotifPlan;
  /** Procedural backgrounds the director wrote for key moments (render/custom-scene.ts); they replace the plate. */
  scenes?: CustomSceneSpec[];
  /** Program-drawn graphic look (render/graphics.ts); when set it is the background instead of full-bleed plates. */
  graphics?: GraphicsLook;
}

export type ParamSpec =
  | { type: 'number'; min: number; max: number; default: number; description: string }
  | { type: 'enum'; values: string[]; default: string; description: string }
  | { type: 'boolean'; default: boolean; description: string };

export interface TemplateSpec {
  id: string;
  description: string;
  params: Record<string, ParamSpec>;
  defaultEnter: EnterKind;
  defaultExit: ExitKind;
}

export interface Window {
  start: number;
  end: number;
}

export interface ValidationResult {
  treatment: TreatmentV3;
  /** Problems the director must fix (sent back as feedback). */
  errors: string[];
  /** Repairs the program made on its own (kept as review items). */
  fixes: string[];
}

/** Max distance a shot boundary may sit from a cue start or downbeat before it is snapped. */
export const SNAP_SEC = 0.15;

/** Validates against the timeline and the template catalog; repairs boundaries, ranges and missing styles. */
export function validateTreatment(input: TreatmentV3, song: SongTimeline, win: Window, templates: Record<string, TemplateSpec>): ValidationResult {
  const t: TreatmentV3 = structuredClone(input);
  const errors: string[] = [];
  const fixes: string[] = [];
  const cues = cuesIn(song, win);
  const cueById = new Map(cues.map((c) => [c.id, c]));
  const assetIds = new Set(t.assets.map((a) => a.id));

  for (const a of t.assets) {
    if (!a.prompt?.trim()) errors.push(`素材 ${a.id} 沒有 prompt`);
    if (a.kind === 'video' && !t.assets.some((b) => b.id === a.from && b.kind === 'image')) errors.push(`影片素材 ${a.id} 的 from 必須是一張圖片素材`);
  }

  // shots: known template, params within schema, boundaries snapped and tiling the window
  const anchors = [...cues.map((c) => c.start), ...song.downbeats, win.start, win.end];
  const snap = (x: number) => anchors.reduce((best, a) => (Math.abs(a - x) < Math.abs(best - x) ? a : best), anchors[0]);
  t.shots.sort((a, b) => a.start - b.start);
  if (!t.shots.length) errors.push('至少要有一個鏡頭');
  t.shots.forEach((s, i) => {
    const spec = templates[s.template];
    if (!spec) {
      errors.push(`鏡頭 ${s.id} 使用未知模板 ${s.template}`);
      return;
    }
    s.params = repairParams(s.id, s.params ?? {}, spec, errors, fixes);
    if (s.asset && !assetIds.has(s.asset)) errors.push(`鏡頭 ${s.id} 引用不存在的素材 ${s.asset}`);
    if (s.clipStart !== undefined && !(s.clipStart >= 0 && s.clipStart < 8)) errors.push(`鏡頭 ${s.id} 的 clipStart 必須在 0–8 秒之間`);
    if (!CAMERAS.includes(s.camera)) errors.push(`鏡頭 ${s.id} 的 camera 必須是 ${CAMERAS.join('/')}`);
    if (!TRANSITIONS.includes(s.transitionIn)) errors.push(`鏡頭 ${s.id} 的 transitionIn 必須是 ${TRANSITIONS.join('/')}`);
    if (i > 0) {
      const b = snap(s.start);
      if (Math.abs(b - s.start) > 1e-6) {
        if (Math.abs(b - s.start) > SNAP_SEC) fixes.push(`鏡頭 ${s.id} 起點 ${s.start.toFixed(2)}s 不在句首或強拍附近，吸附到 ${b.toFixed(2)}s`);
        s.start = b;
      }
    }
  });
  if (t.shots.length) {
    if (t.shots[0].start !== win.start) t.shots[0].start = win.start;
    t.shots.forEach((s, i) => (s.end = i + 1 < t.shots.length ? t.shots[i + 1].start : win.end));
    const empty = t.shots.filter((s) => s.end - s.start < 0.5);
    if (empty.length) errors.push(`鏡頭太短（< 0.5 秒）：${empty.map((s) => s.id).join(', ')}`);
  }
  const shotAt = (time: number) => t.shots.find((s) => s.start <= time && time < s.end) ?? t.shots[t.shots.length - 1];

  // cue styles: only known cues, valid ranges; cues without a style get the template default
  const seen = new Set<string>();
  t.cues = t.cues.filter((cs) => {
    const cue = cueById.get(cs.cueId);
    if (!cue) {
      errors.push(`未知或不在範圍內的歌詞 ${cs.cueId}`);
      return false;
    }
    seen.add(cs.cueId);
    const len = [...cue.text].length;
    if (!t.shots.some((s) => s.id === cs.shot) || shotAt(cue.start)?.id !== cs.shot) {
      const right = shotAt(cue.start)?.id;
      if (right) {
        if (cs.shot !== right) fixes.push(`歌詞 ${cs.cueId} 改掛到開始時間所在的鏡頭 ${right}`);
        cs.shot = right;
      }
    }
    for (const e of cs.emphasis ?? []) {
      if (!(Number.isInteger(e.from) && Number.isInteger(e.to) && 0 <= e.from && e.from < e.to && e.to <= len)) {
        errors.push(`歌詞 ${cs.cueId} 的強調範圍 [${e.from}, ${e.to}) 超出文字長度 ${len}`);
      }
      if (!EMPHASIS_METHODS.includes(e.method)) errors.push(`歌詞 ${cs.cueId} 的強調方式 ${e.method} 不存在`);
      // widen a range that cuts a word to the whole phrase(s) it touches
      const b = [...phraseBoundaries(cue.text)].sort((x, y) => x - y);
      const from = b.filter((x) => x <= e.from).pop() ?? 0;
      const to = b.find((x) => x >= e.to) ?? len;
      if (from !== e.from || to !== e.to) {
        fixes.push(`歌詞 ${cs.cueId} 的強調範圍 [${e.from}, ${e.to}) 切開了一個詞，擴展為 [${from}, ${to})`);
        e.from = from;
        e.to = to;
      }
    }
    if (cs.rows && !cs.rows.every((r, i) => Number.isInteger(r) && r > 0 && r < len && (i === 0 || r > cs.rows![i - 1]))) {
      errors.push(`歌詞 ${cs.cueId} 的換行位置必須是 1..${len - 1} 之間遞增的整數`);
    } else if (cs.rows?.some((r) => !phraseBoundaries(cue.text).has(r))) {
      const b = [...phraseBoundaries(cue.text)].filter((x) => x > 0 && x < len);
      const rows = [...new Set(cs.rows.map((r) => b.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), b[0] ?? r)))];
      fixes.push(`歌詞 ${cs.cueId} 的換行 ${cs.rows.join(',')} 切開了一個詞，移到 ${rows.join(',')}`);
      cs.rows = rows.length ? rows : undefined;
    }
    if (cs.accents) {
      const beatsIn = beatsDuring(song.beats, cue.start, cue.end);
      const ok = cs.accents.filter((k) => Number.isInteger(k) && k >= 0 && k < beatsIn.length);
      if (ok.length !== cs.accents.length) fixes.push(`歌詞 ${cs.cueId} 移除顯示期間外的踩拍 ${cs.accents.filter((k) => !ok.includes(k)).join(', ')}`);
      cs.accents = ok;
    }
    if (!ENTER_KINDS.includes(cs.enter)) errors.push(`歌詞 ${cs.cueId} 的 enter 必須是 ${ENTER_KINDS.join('/')}`);
    if (!EXIT_KINDS.includes(cs.exit)) errors.push(`歌詞 ${cs.cueId} 的 exit 必須是 ${EXIT_KINDS.join('/')}`);
    return true;
  });
  for (const c of cues) {
    if (seen.has(c.id)) continue;
    const shot = shotAt(c.start);
    const spec = shot && templates[shot.template];
    if (!shot || !spec) continue;
    t.cues.push({ cueId: c.id, shot: shot.id, enter: spec.defaultEnter, exit: spec.defaultExit });
    fixes.push(`歌詞 ${c.id} 沒有樣式，套用模板 ${spec.id} 預設`);
  }
  // interpolated timing must not drive beat effects (spec 1.1)
  for (const cs of t.cues) {
    const cue = cueById.get(cs.cueId);
    if (cue?.confidence === 'interpolated' && (cs.accents?.length || cs.enter === 'slam' || cs.enter === 'pop')) {
      cs.accents = [];
      cs.enter = 'fade';
      fixes.push(`歌詞 ${cs.cueId} 時間是內插的，改為淡入且不踩拍`);
    }
  }
  t.cues.sort((a, b) => (cueById.get(a.cueId)?.start ?? 0) - (cueById.get(b.cueId)?.start ?? 0));
  // the same words read the same way every time: a repeated line takes its first occurrence's emphasis and breaks
  const same = sameLines(song);
  for (const cs of t.cues) {
    const src = same.get(cs.cueId);
    const s0 = src && t.cues.find((x) => x.cueId === src);
    if (!s0) continue;
    if (JSON.stringify(s0.emphasis ?? null) !== JSON.stringify(cs.emphasis ?? null) || JSON.stringify(s0.rows ?? null) !== JSON.stringify(cs.rows ?? null)) {
      cs.emphasis = s0.emphasis && structuredClone(s0.emphasis);
      cs.rows = s0.rows && [...s0.rows];
      fixes.push(`歌詞 ${cs.cueId} 和 ${src} 相同，沿用它的強調與換行`);
    }
  }
  // colour is for the words that matter (title words, hook words); the rest are emphasised by size only, and at most
  // COLOR_SHARE of the lines change colour at all
  const keys = keyWords(song);
  const budget = Math.max(1, Math.round(COLOR_SHARE * t.cues.length));
  let coloured = 0;
  for (const cs of t.cues) {
    const text = [...(cueById.get(cs.cueId)?.text ?? '')];
    for (const e of cs.emphasis ?? []) {
      if (e.method !== 'color' && e.method !== 'glow') continue;
      const words = text.slice(e.from, e.to).join('');
      const isKey = keys.some((k) => words.replace(/[\s　]/g, '').toLowerCase().includes(k) || k.includes(words.replace(/[\s　]/g, '').toLowerCase()));
      if (isKey && coloured < budget) {
        coloured++;
        continue;
      }
      fixes.push(`歌詞 ${cs.cueId} 的「${words}」${isKey ? '超過換色額度' : '不是關鍵詞'}，改為放大強調`);
      e.method = 'scale';
    }
  }
  const mo = validateMotif(t.motif, win);
  t.motif = mo.motif;
  errors.push(...mo.errors);
  fixes.push(...mo.fixes);
  const dv = validateDesign(t.design, win);
  t.design = dv.design;
  fixes.push(...dv.fixes);
  const mv = validateMoments(t.moments, t.arc, song, win);
  t.moments = mv.moments;
  t.arc = mv.arc;
  errors.push(...mv.errors);
  fixes.push(...mv.fixes);
  return { treatment: t, errors, fixes };
}

function repairParams(shotId: string, params: Record<string, ParamValue>, spec: TemplateSpec, errors: string[], fixes: string[]) {
  // set by the composition pass, never by the director: kept as is on every template
  const out: Record<string, ParamValue> = params['echo'] === true ? { echo: true } : {};
  for (const k of Object.keys(params)) if (!(k in spec.params) && k !== 'echo') errors.push(`鏡頭 ${shotId}：模板 ${spec.id} 沒有參數 ${k}`);
  for (const [k, p] of Object.entries(spec.params)) {
    const v = params[k];
    if (v === undefined) {
      out[k] = p.default;
    } else if (p.type === 'number') {
      const n = typeof v === 'number' ? v : NaN;
      if (!Number.isFinite(n)) {
        errors.push(`鏡頭 ${shotId}：參數 ${k} 必須是數字`);
        out[k] = p.default;
      } else {
        out[k] = Math.min(p.max, Math.max(p.min, n));
        if (out[k] !== n) fixes.push(`鏡頭 ${shotId}：參數 ${k}=${n} 超出 [${p.min}, ${p.max}]，夾到 ${out[k]}`);
      }
    } else if (p.type === 'enum') {
      if (typeof v !== 'string' || !p.values.includes(v)) {
        errors.push(`鏡頭 ${shotId}：參數 ${k} 必須是 ${p.values.join('/')}`);
        out[k] = p.default;
      } else out[k] = v;
    } else {
      if (typeof v !== 'boolean') errors.push(`鏡頭 ${shotId}：參數 ${k} 必須是布林值`);
      out[k] = typeof v === 'boolean' ? v : p.default;
    }
  }
  return out;
}

/** Cues that start inside the window (a cue ending just after the window start belongs to the previous clip). */
export function cuesIn(song: SongTimeline, win: Window) {
  return song.cues.filter((c) => c.start >= win.start - 0.5 && c.start < win.end);
}

/** Beats inside [start, end), starting with the first beat at or after `start`. */
export function beatsDuring(beats: number[], start: number, end: number): number[] {
  return beats.filter((b) => b >= start - 1e-6 && b < end);
}
