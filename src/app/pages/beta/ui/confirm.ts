/** What the confirm dialog (2b) shows before a paying action; `go` runs only after 確認. */
export interface Ask {
  /** Small coral line above the title, e.g. 「夜航 · 故事版」. */
  eyebrow?: string;
  title: string;
  body: string;
  /** What the action charges now; 0 for a warning that charges nothing (the bill rows stay out). */
  cost: number;
  /** The 確認 button's words; the default is 「確認，扣 $X」, or 「確認」 when nothing is charged. */
  confirmLabel?: string;
  go: () => void;
}

/** The dialog's amount rows for an ask, or null when it charges nothing (a warning): then no bill shows and nothing can be short. */
export const askRows = (a: Pick<Ask, 'cost'>, left: number | null): Bill | null => (a.cost > 0 ? bill(a.cost, left) : null);

export interface Bill { cost: number; left?: number; after?: number; short: boolean }

/** The dialog's amount rows, in cents so float noise never makes a balance look short. */
export function bill(cost: number, left: number | null): Bill {
  if (left === null) return { cost, short: false };
  const c = Math.round(cost * 100);
  const l = Math.round(left * 100);
  return { cost, left, after: (l - c) / 100, short: c > l };
}
