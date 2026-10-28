import { BetaMe } from '../beta';

/** What a person has left and the share of their limit still left (the pill's 4 px bar), never below 0 or past 100. */
export function balance(me: Pick<BetaMe, 'limitUsd' | 'spentUsd'>): { left: number; pct: number } {
  const left = Math.max(0, Math.round((me.limitUsd - me.spentUsd) * 100) / 100);
  const pct = me.limitUsd > 0 ? Math.round(Math.min(100, (left / me.limitUsd) * 100) * 100) / 100 : 0;
  return { left, pct };
}
