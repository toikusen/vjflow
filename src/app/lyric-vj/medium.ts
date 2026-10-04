// Medium: the physical material a song's video pretends to be made of, applied as a post layer over everything
// (AI plates included) so the frame stops reading as a clean digital render. Techniques after ReelMimic's engines
// (MIT, github.com/edenfunf/reelmimic): held frames (on twos / 8–12 fps), line boil, paper tooth, exposure flicker,
// per-step grain, ordered dither. Reimplemented here as one shader (engine.ts FINAL_SHADER).

export type MediumId = 'clean' | 'film' | 'paper' | 'crayon' | 'cutout' | 'pixel';

export interface Medium {
  label: string;
  /** How the background images are rendered (English, appended to every image prompt): the medium is the whole picture, not a filter over an anime plate. */
  look: string;
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
  /** Pixel grid + ordered dither 0..1. */
  pixel: number;
}

const BASE: Medium = { label: '', look: '', step: 0, boil: 0, boilRate: 12, paper: 0, tooth: 0, lift: 0, flicker: 0, weave: 0, grain: 0, pixel: 0 };

export const MEDIA: Record<MediumId, Medium> = {
  clean: { ...BASE, look: 'crisp digital matte painting, clean gradients, cinematic lighting', label: '數位乾淨：不加媒材（電子、未來、光感強的歌）' },
  film: { ...BASE, look: '35mm film photograph of a real place, Kodak Portra 400 colours, natural film grain, slight halation, documentary framing', label: '底片：顆粒、曝光閃爍、畫面微晃（懷舊、電影感、樂團）', flicker: 0.03, weave: 1.2, grain: 0.06 },
  paper: { ...BASE, look: 'gouache and watercolour painting on textured paper, visible brush strokes and paper grain, hand-painted', label: '紙上手繪：背景一秒 12 張、線條微抖、紙纖維（溫柔、敘事、抒情）', step: 12, boil: 1.4, paper: 0.8, tooth: 0.3, lift: 0.05 },
  crayon: { ...BASE, look: 'wax crayon and coloured pencil illustration on rough paper, picture-book style, visible strokes', label: '蠟筆繪本：一秒 8 張、抖動較大、紙齒明顯（可愛、童趣、輕快）', step: 8, boil: 2.2, boilRate: 8, paper: 0.6, tooth: 0.75, lift: 0.06, grain: 0.03 },
  cutout: { ...BASE, look: 'layered paper cut-out diorama photographed on a table, cardstock and kraft paper, soft shadows between layers, handmade', label: '剪紙定格：一秒 12 張、每格微晃與曝光閃爍（手作、俏皮、獨立）', step: 12, paper: 0.5, lift: 0.04, flicker: 0.035, weave: 1.6, grain: 0.05 },
  pixel: { ...BASE, look: '16-bit pixel art background, limited palette, crisp square pixels', label: '像素點陣：低解析網格與有序抖色（遊戲、電音、復古數位）', step: 12, pixel: 1 },
};

/** Time held to the medium's frame rate (t itself when step is 0). */
export const stepTime = (t: number, step: number) => (step > 0 ? Math.floor(t * step + 1e-6) / step : t);
