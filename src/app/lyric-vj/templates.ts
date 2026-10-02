// Template catalog: the only presentation choices the director has. Rendering lives in the renderer; this is the contract.
import { TemplateSpec } from './treatment';

export const TEMPLATES: Record<string, TemplateSpec> = {
  punch: {
    id: 'punch',
    description: '關鍵字衝擊：強調範圍內的字滿版放大、在踩拍時彈跳與閃光；其餘字以小字排在上下。適合副歌關鍵句、短句。',
    defaultEnter: 'slam',
    defaultExit: 'burst',
    params: {
      keywordWidth: { type: 'number', min: 0.4, max: 0.92, default: 0.8, description: '關鍵字佔畫面寬度比例' },
      bounce: { type: 'number', min: 0, max: 1, default: 0.6, description: '踩拍彈跳強度' },
      flash: { type: 'boolean', default: true, description: '踩拍時白閃' },
      tilt: { type: 'number', min: -12, max: 12, default: 0, description: '整組文字傾斜角度（度）' },
      outline: { type: 'boolean', default: true, description: '關鍵字加描邊殘影' },
      dim: { type: 'number', min: 0, max: 0.8, default: 0.35, description: '背景壓暗程度（確保可讀）' },
      lift: { type: 'number', min: -200, max: 260, default: 0, description: '整組文字上移的像素（避開素材主體，例如人物在下方就往上）' },
    },
  },
  'frame-split': {
    id: 'frame-split',
    description: '框線分割：細線框與角括號先畫出，主句在框內，其餘行以小字排在框外下方。適合主歌、敘事句、長句。',
    defaultEnter: 'wipe',
    defaultExit: 'rise',
    params: {
      frameWidth: { type: 'number', min: 0.4, max: 0.92, default: 0.7, description: '框寬佔畫面寬度比例' },
      frameHeight: { type: 'number', min: 0.18, max: 0.6, default: 0.32, description: '框高佔畫面高度比例' },
      lineWidth: { type: 'number', min: 1, max: 6, default: 2, description: '線寬（px，1080p）' },
      brackets: { type: 'boolean', default: true, description: '四角加角括號' },
      drawSec: { type: 'number', min: 0.2, max: 1.2, default: 0.45, description: '框線畫出所需秒數' },
      align: { type: 'enum', values: ['center', 'left', 'right'], default: 'center', description: '框在畫面的位置' },
      dim: { type: 'number', min: 0, max: 0.8, default: 0.25, description: '背景壓暗程度' },
      lift: { type: 'number', min: -200, max: 260, default: 0, description: '框與文字整組上移的像素（避開素材主體）' },
    },
  },
};
