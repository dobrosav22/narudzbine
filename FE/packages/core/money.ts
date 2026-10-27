/**
 * Exact arithmetic on contract money strings ("12.50"). Amounts are handled as integer cents
 * (BigInt), never binary floats, and returned in the backend's two-decimal form. The backend
 * remains the authority for every price and total; these helpers only compare, sum, divide and
 * validate display values (cart estimate, average order value, form checks).
 */

const MONEY = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;

/** Integer cents of a decimal string with at most two decimals ("12.5" → 1250n). Throws otherwise. */
export function moneyToCents(amount: string): bigint {
  const match = MONEY.exec(amount.trim());
  if (!match) throw new Error(`Not a money amount: ${amount}`);
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

export function centsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export function sumMoney(amounts: readonly string[]): string {
  return centsToMoney(amounts.reduce((total, amount) => total + moneyToCents(amount), 0n));
}

/** Negative when a < b, 0 when equal, positive when a > b. */
export function compareMoney(a: string, b: string): number {
  const diff = moneyToCents(a) - moneyToCents(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

/** `amount / divisor` rounded half-up to two decimals; null for a non-positive or fractional divisor. */
export function divideMoney(amount: string, divisor: number): string | null {
  if (!Number.isInteger(divisor) || divisor <= 0) return null;
  const cents = moneyToCents(amount);
  const d = BigInt(divisor);
  const abs = cents < 0n ? -cents : cents;
  const rounded = (abs * 2n + d) / (2n * d);
  return centsToMoney(cents < 0n ? -rounded : rounded);
}

/** `amount × (1 + percent/100)` rounded half-up to cents; percent is a decimal string ("-10.00"). */
export function applyPercent(amount: string, percent: string): string {
  const base = moneyToCents(amount);
  const hundredths = moneyToCents(percent);
  const numerator = base * (10_000n + hundredths);
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const rounded = (abs * 2n + 10_000n) / 20_000n;
  return centsToMoney(negative ? -rounded : rounded);
}
