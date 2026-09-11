import { Money, type Currency } from "@/shared/domain/money";
import {
  formatSequenceNumber,
  parseSequenceNumber,
  sequencePattern,
} from "@/shared/domain/sequence-number";
import { BusinessRuleError } from "@/shared/domain/errors";

/** "Presupuesto". Repairs use OT and sales use VT on the same counter. */
export const QUOTE_NUMBER_PREFIX = "PR";

export function formatQuoteNumber(year: number, sequence: number): string {
  return formatSequenceNumber(QUOTE_NUMBER_PREFIX, year, sequence);
}

export function parseQuoteNumber(value: string): { year: number; sequence: number } | null {
  return parseSequenceNumber(QUOTE_NUMBER_PREFIX, value);
}

export function looksLikeQuoteNumber(value: string): boolean {
  return sequencePattern(QUOTE_NUMBER_PREFIX).test(value.trim().toUpperCase());
}

export const QUOTE_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  PENDING: "Pendiente de respuesta",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 border-amber-300",
  ACCEPTED: "bg-emerald-100 text-emerald-900 border-emerald-300",
  REJECTED: "bg-rose-100 text-rose-900 border-rose-300",
};

/**
 * Accepting is terminal because it creates a work order, and a second
 * acceptance would create a second one for the same job. A rejection can be
 * undone: customers change their mind, usually after asking somewhere else.
 */
const TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: ["PENDING"],
};

export function allowedQuoteTransitions(from: QuoteStatus): readonly QuoteStatus[] {
  return TRANSITIONS[from];
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new BusinessRuleError(
      `No se puede pasar un presupuesto de "${QUOTE_STATUS_LABEL[from]}" a "${QUOTE_STATUS_LABEL[to]}"`,
    );
  }
}

/**
 * The total is the sum of parts and labour, never typed on its own.
 *
 * The client's own example reads "Repuesto 80, mano de obra 20, total 100". A
 * separately editable total is a number that can silently disagree with the
 * two lines printed above it.
 */
export function quoteTotal(
  partsCost: string | null,
  laborCost: string | null,
  currency: Currency,
): string {
  const parts = partsCost ? Money.of(partsCost, currency) : Money.zero(currency);
  const labor = laborCost ? Money.of(laborCost, currency) : Money.zero(currency);
  return parts.plus(labor).toDecimalString();
}

/** A quote past its date is stale, not invalid: prices move. */
export function isExpired(validUntil: Date | null, now: Date): boolean {
  if (!validUntil) return false;
  return validUntil.getTime() < now.getTime();
}

export const QUOTE_VALIDITY_OPTIONS = [7, 15, 30] as const;
