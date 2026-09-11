import { Money, type Currency } from "@/shared/domain/money";

/**
 * Renders a stored decimal string in its currency. Amounts travel as strings
 * from the server; formatting happens here so no float ever exists.
 */
export function formatMoney(amount: string | null | undefined, currency: Currency): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  try {
    return Money.of(amount, currency).format();
  } catch {
    return "—";
  }
}

export function MoneyText({
  amount,
  currency,
  className,
}: {
  amount: string | null | undefined;
  currency: Currency;
  className?: string;
}) {
  return <span className={className}>{formatMoney(amount, currency)}</span>;
}

/** Price minus deposit. Returns null when there is no price to work from. */
export function balanceOf(
  finalPrice: string | null,
  deposit: string,
  currency: Currency,
): string | null {
  if (!finalPrice) return null;
  try {
    return Money.of(finalPrice, currency).minus(Money.of(deposit, currency)).toDecimalString();
  } catch {
    return null;
  }
}
