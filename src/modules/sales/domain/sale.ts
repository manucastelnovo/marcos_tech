import Decimal from "decimal.js";
import { Money, type Currency } from "@/shared/domain/money";
import {
  formatSequenceNumber,
  parseSequenceNumber,
  sequencePattern,
} from "@/shared/domain/sequence-number";

/** "Venta". Repairs use "OT" on the same counter machinery. */
export const SALE_NUMBER_PREFIX = "VT";

export function formatSaleNumber(year: number, sequence: number): string {
  return formatSequenceNumber(SALE_NUMBER_PREFIX, year, sequence);
}

export function parseSaleNumber(value: string): { year: number; sequence: number } | null {
  return parseSequenceNumber(SALE_NUMBER_PREFIX, value);
}

export function looksLikeSaleNumber(value: string): boolean {
  return sequencePattern(SALE_NUMBER_PREFIX).test(value.trim().toUpperCase());
}

export type SaleLineInput = {
  quantity: number;
  unitPrice: string;
  unitCost: string;
};

export type SaleTotals = {
  subtotal: string;
  discount: string;
  total: string;
  /** Revenue minus the frozen cost of what was sold. */
  margin: string;
  /** True when the shop is selling for less than it paid. */
  belowCost: boolean;
};

/**
 * Adds up a ticket.
 *
 * The discount is applied to the whole sale rather than to each line, which is
 * how a counter actually negotiates: "te lo dejo en un millón" is one number,
 * not a recalculation of every item.
 */
export function computeTotals(
  lines: readonly SaleLineInput[],
  discountInput: string,
  currency: Currency,
): SaleTotals {
  const zero = Money.zero(currency);

  const subtotal = lines.reduce(
    (total, line) => total.plus(Money.of(line.unitPrice, currency).times(line.quantity)),
    zero,
  );

  const cost = lines.reduce(
    (total, line) => total.plus(Money.of(line.unitCost, currency).times(line.quantity)),
    zero,
  );

  const discount = Money.of(discountInput || "0", currency);
  const total = subtotal.minus(discount);
  const margin = total.minus(cost);

  return {
    subtotal: subtotal.toDecimalString(),
    discount: discount.toDecimalString(),
    total: total.toDecimalString(),
    margin: margin.toDecimalString(),
    // Selling below cost is allowed and warned about, never blocked: clearing
    // old inventory is a legitimate decision the system does not get to veto.
    belowCost: margin.isNegative(),
  };
}

export function lineTotal(unitPrice: string, quantity: number, currency: Currency): string {
  return Money.of(unitPrice, currency).times(quantity).toDecimalString();
}

/**
 * Converts an amount between currencies using guaraníes as the pivot, since
 * every rate is expressed in guaraníes per unit.
 *
 * The arithmetic runs in Decimal rather than through `Money`, because rounding
 * to the currency scale at the pivot would throw away the precision the second
 * half of the conversion needs. Only the final result is rounded.
 *
 * Returns null when no rate is known. That is a refusal to guess, not a zero: a
 * product silently priced at nothing is far worse than a blocked sale.
 */
export function convertAmount(
  amount: string,
  from: Currency,
  to: Currency,
  rates: Partial<Record<Currency, string>>,
): string | null {
  if (from === to) return Money.of(amount, to).toDecimalString();

  const value = new Decimal(amount);

  let inGuaranies: Decimal;
  if (from === "PYG") {
    inGuaranies = value;
  } else {
    const sourceRate = rates[from];
    if (!sourceRate) return null;
    inGuaranies = value.times(new Decimal(sourceRate));
  }

  if (to === "PYG") return Money.of(inGuaranies, "PYG").toDecimalString();

  const targetRate = rates[to];
  if (!targetRate) return null;

  const divisor = new Decimal(targetRate);
  if (divisor.isZero()) return null;

  return Money.of(inGuaranies.dividedBy(divisor), to).toDecimalString();
}

/**
 * Turns a percentage typed at the counter into the amount the backend stores.
 *
 * The sale keeps storing an amount, as it always has: "10%" is a way of typing
 * a discount, not a different kind of discount. The result is rounded once, at
 * the currency scale, so 10% of Gs. 45.005 is Gs. 4.501 and never a fraction.
 *
 * Returns null for anything that is not a percentage between 0 and 100.
 */
export function discountFromPercent(
  subtotal: string,
  percentInput: string,
  currency: Currency,
): string | null {
  const normalized = percentInput.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const percent = new Decimal(normalized);
  if (percent.greaterThan(100)) return null;

  return Money.of(subtotal, currency).times(percent.dividedBy(100)).toDecimalString();
}

/**
 * Canonical form of a preprinted invoice number: establishment, point of
 * issue and sequence, "001-002-0000004".
 *
 * The counter types it in whatever way is fastest, so "1-2-4" and the thirteen
 * bare digits are both accepted and padded. Anything else returns null rather
 * than a guess, because a wrong number points to someone else's invoice.
 */
export function normalizeInvoiceNumber(raw: string): string | null {
  const trimmed = raw.trim();

  const parts =
    /^(\d{3})(\d{3})(\d{7})$/.exec(trimmed) ?? /^(\d{1,3})-(\d{1,3})-(\d{1,7})$/.exec(trimmed);
  if (!parts) return null;

  const [, establishment, point, sequence] = parts;
  if (Number(sequence) === 0) return null;

  return `${establishment.padStart(3, "0")}-${point.padStart(3, "0")}-${sequence.padStart(7, "0")}`;
}
