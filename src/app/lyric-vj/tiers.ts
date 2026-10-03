// Versions the user picks per song, the same for every style: how many scenes and whether they move.
import { Window } from './treatment';

export type Tier = 'still' | 'standard' | 'rich';

export interface TierSpec {
  name: string;
  /** Generate a Veo clip for every image. */
  video: boolean;
  /** One scene (image, plus its clip when video) per `perSec` seconds of the window, at most `max`. */
  perSec: number;
  max: number;
  /** Default asset budget per song (USD). */
  budgetUSD: number;
  /** Director rule for this tier (Traditional Chinese). */
  rule: string;
}

export const TIERS: Record<Tier, TierSpec> = {
  still: {
    name: '純圖片', video: false, perSec: 10, max: 24, budgetUSD: 5,
    rule: '這個版本只有靜態圖（不要 video 素材），只有文字與運鏡會動。每張圖是一個不同的構圖，雲層要有前後景層次，讓推進與平移看得出景深。',
  },
  standard: {
    name: '標準', video: true, perSec: 20, max: 12, budgetUSD: 20,
    rule: '素材以「組」為單位：每組 1 張 image 加 1 段 video（from 那張 image）。大約一個音樂段落用一組，連續使用同一組的鏡頭之間背景會連續播放；副歌的那組可以在之後的副歌重複使用。',
  },
  rich: {
    name: '豐富', video: true, perSec: 8, max: 36, budgetUSD: 60,
    rule: '素材以「組」為單位：每組 1 張 image 加 1 段 video（from 那張 image），每組是一個不同的構圖或鏡位：遠景全景、仰角天空、地平線特寫、街道或屋頂等細節、俯瞰、逆光剪影、不同高度與方向。一個音樂段落用 2–3 組，在句子或強拍處切換構圖，像剪接換鏡頭；同一組的連續鏡頭背景會連續播放。整首歌要像同一個世界、同一晚（同一座城市、天色隨歌曲推進變化）。',
  },
};

/** How many scenes a window may use in a tier; repeated sections (later choruses) reuse scenes and do not count. */
export function sceneCount(tier: Tier, win: Window, repeatSec = 0): number {
  const t = TIERS[tier];
  return Math.max(1, Math.min(t.max, Math.ceil(Math.max(1, win.end - win.start - repeatSec) / t.perSec)));
}
