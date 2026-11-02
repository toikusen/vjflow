import { BetaMe } from '../beta';

/** What a person has left and the share of their limit still left (the pill's 4 px bar), never below 0 or past 100. */
export function balance(me: Pick<BetaMe, 'limitUsd' | 'spentUsd'>): { left: number; pct: number } {
  const left = Math.max(0, Math.round((me.limitUsd - me.spentUsd) * 100) / 100);
  const pct = me.limitUsd > 0 ? Math.round(Math.min(100, (left / me.limitUsd) * 100) * 100) / 100 : 0;
  return { left, pct };
}

/** What the 額度 panel says under the balance line. */
export const QUOTA_HELP = ['封測額度由邀請你的人提供（美元），不需要付款。', '需要協助或額度用完：請聯絡邀請你的人。'] as const;

export type PanelEvent = 'toggle' | 'escape' | 'outside';
/** The 額度 panel after an event: its button toggles it, Escape or a click outside the pill closes it. */
export const panelAfter = (open: boolean, e: PanelEvent): boolean => e === 'toggle' && !open;
