/** What the confirm dialog (2b) shows before a paying action; `go` runs only after 確認. */
export interface Ask {
  /** Small coral line above the title, e.g. 「夜航 · 故事版」. */
  eyebrow?: string;
  title: string;
  body: string;
  cost: number;
  go: () => void;
}

export interface Bill { cost: number; left?: number; after?: number; short: boolean }

/** The dialog's amount rows, in cents so float noise never makes a balance look short. */
export function bill(cost: number, left: number | null): Bill {
  if (left === null) return { cost, short: false };
  const c = Math.round(cost * 100);
  const l = Math.round(left * 100);
  return { cost, left, after: (l - c) / 100, short: c > l };
}
