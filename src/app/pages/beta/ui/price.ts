/** `fixed` always shows cents (balances, the bill); `short` drops trailing zeros (list prices such as $16, $2.5). */
export type PriceDigits = 'fixed' | 'short';

/** An amount as text without its unit, rounded to cents; float noise and -0 never show. */
export function formatPrice(amount: number, digits: PriceDigits = 'fixed'): string {
  const cents = Math.round(amount * 100);
  const text = (Object.is(cents, -0) ? 0 : cents / 100).toFixed(2);
  return digits === 'fixed' ? text : text.replace(/\.?0+$/, '');
}
