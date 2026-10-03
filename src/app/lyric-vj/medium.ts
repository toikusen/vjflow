// Medium: the physical material a song's video pretends to be made of, applied as a post layer over everything
// (AI plates included) so the frame stops reading as a clean digital render. Techniques after ReelMimic's engines
// (MIT, github.com/edenfunf/reelmimic): held frames (on twos / 8–12 fps), line boil, paper tooth, exposure flicker,
// per-step grain, ordered dither, misregistered ink. Reimplemented here as one shader (engine.ts FINAL_SHADER).

export type MediumId = 'clean' | 'film' | 'paper' | 'crayon' | 'cutout' | 'riso' | 'xerox' | 'pixel';

export interface Medium {
  label: string;
  /** Background motion (plates, motes, motif) held at this many fps; 0 = every frame. Lyrics stay smooth. */
  step: number;
  /** Line boil: the whole frame wobbles this many px, re-drawn `boilRate` times a second. */
  boil: number;
  boilRate: number;
  /** Paper fibres/blotches 0..1 and tooth (highlights skip the paper's grooves) 0..1. */
  paper: number;
  tooth: number;
  /** Exposure flicker ± per held frame, and gate weave (whole-frame jitter) px. */
  flicker: number;
  weave: number;
  /** Paper showing through the darks 0..1 (a dark frame hides paper texture otherwise). */
  lift: number;
  /** Film grain added on top of the design's grain. */
  grain: number;
  /** Ink treatments (0 = off): halftone in two misregistered inks; photocopy threshold; pixel dither. */
  riso: number;
  xerox: number;
  pixel: number;
}

const BASE: Medium = { label: '', step: 0, boil: 0, boilRate: 12, paper: 0, tooth: 0, lift: 0, flicker: 0, weave: 0, grain: 0, riso: 0, xerox: 0, pixel: 0 };

export const MEDIA: Record<MediumId, Medium> = {
  clean: { ...BASE, label: '數位乾淨：不加媒材（電子、未來、光感強的歌）' },
  film: { ...BASE, label: '底片：顆粒、曝光閃爍、畫面微晃（懷舊、電影感、樂團）', flicker: 0.03, weave: 1.2, grain: 0.06 },
  paper: { ...BASE, label: '紙上手繪：背景一秒 12 張、線條微抖、紙纖維（溫柔、敘事、抒情）', step: 12, boil: 1.4, paper: 0.8, tooth: 0.3, lift: 0.05 },
  crayon: { ...BASE, label: '蠟筆繪本：一秒 8 張、抖動較大、紙齒明顯（可愛、童趣、輕快）', step: 8, boil: 2.2, boilRate: 8, paper: 0.6, tooth: 0.75, lift: 0.06, grain: 0.03 },
  cutout: { ...BASE, label: '剪紙定格：一秒 12 張、每格微晃與曝光閃爍（手作、俏皮、獨立）', step: 12, paper: 0.5, lift: 0.04, flicker: 0.035, weave: 1.6, grain: 0.05 },
  riso: { ...BASE, label: '孔版印刷：雙色網點、套色錯位（偶像、流行、潮流感）', step: 12, riso: 1, paper: 0.4, grain: 0.03 },
  xerox: { ...BASE, label: '影印拼貼：高反差黑白、碳粉雜訊、一秒 12 張（龐克、搖滾、強烈）', step: 12, xerox: 1, flicker: 0.05, weave: 1, grain: 0.05 },
  pixel: { ...BASE, label: '像素點陣：低解析網格與有序抖色（遊戲、電音、復古數位）', step: 12, pixel: 1 },
};

/** Time held to the medium's frame rate (t itself when step is 0). */
export const stepTime = (t: number, step: number) => (step > 0 ? Math.floor(t * step + 1e-6) / step : t);
