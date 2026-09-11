import { Money, type Currency } from "@/shared/domain/money";

export type CurrencyLine = {
  currency: Currency;
  /** What was counted when the session opened. */
  opening: string;
  /** Opening plus every cash movement in this currency. */
  expected: string;
  /** What was physically counted at close, once someone counts it. */
  counted: string | null;
  /** counted minus expected. Negative means money is missing. */
  difference: string | null;
};

export type MovementInput = {
  currency: Currency;
  /** Signed amount. Only cash reaches this function. */
  amount: string;
};

/**
 * Reconciles the drawer, one currency at a time.
 *
 * Nothing is converted here on purpose. Comparing a physical count of dollars
 * against an expectation expressed in guaraníes would manufacture a discrepancy
 * out of whatever rate happened to be configured, and the person counting would
 * be asked to explain an error that only exists in the arithmetic.
 */
export function reconcile(input: {
  currencies: readonly Currency[];
  openingCounts: Partial<Record<Currency, string>>;
  closingCounts: Partial<Record<Currency, string>>;
  movements: readonly MovementInput[];
}): CurrencyLine[] {
  return input.currencies.map((currency) => {
    const opening = Money.of(input.openingCounts[currency] ?? "0", currency);

    const expected = input.movements
      .filter((movement) => movement.currency === currency)
      .reduce((total, movement) => total.plus(Money.of(movement.amount, currency)), opening);

    const rawCounted = input.closingCounts[currency];
    const counted = rawCounted === undefined ? null : Money.of(rawCounted, currency);

    return {
      currency,
      opening: opening.toDecimalString(),
      expected: expected.toDecimalString(),
      counted: counted?.toDecimalString() ?? null,
      difference: counted ? counted.minus(expected).toDecimalString() : null,
    };
  });
}

/** Currencies the drawer actually touched, so the close screen stays short. */
export function currenciesInPlay(
  openingCounts: Partial<Record<Currency, string>>,
  movements: readonly MovementInput[],
): Currency[] {
  const seen = new Set<Currency>();

  for (const [currency, amount] of Object.entries(openingCounts)) {
    if (amount && Number(amount) !== 0) seen.add(currency as Currency);
  }
  for (const movement of movements) {
    seen.add(movement.currency);
  }

  return [...seen];
}

export function hasDifference(line: CurrencyLine): boolean {
  return line.difference !== null && Number(line.difference) !== 0;
}
