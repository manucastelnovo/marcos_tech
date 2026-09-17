import { Money, currencyScale, parseAmountInput, type Currency } from "@/shared/domain/money";
import { computeTotals, convertAmount, discountFromPercent, type SaleTotals } from "./sale";

export type Rates = Partial<Record<Currency, string>>;

/** The part of a product the cart needs. */
export type CartProduct = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  salePrice: string | null;
  averageCost: string;
  currency: Currency;
};

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  /** What the seller sees and may edit, written the way the counter types. */
  unitPrice: string;
  /** List price and cost in the product's own currency. */
  listPrice: string | null;
  averageCost: string;
  productCurrency: Currency;
  /** Stock when the product was added, for the warning only. */
  available: number;
};

/**
 * An amount as the counter writes it, without the currency symbol:
 * "2.500.000" or "100,50". `parseAmountInput` reads it back exactly.
 */
export function formatAmountInput(amount: string, currency: Currency): string {
  const scale = currencyScale(currency);
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(Money.of(amount, currency).toNumber());
}

/** The list price in the sale's currency, or null when it cannot be known. */
export function listPriceIn(
  line: Pick<CartLine, "listPrice" | "productCurrency">,
  currency: Currency,
  rates: Rates,
): string | null {
  if (line.listPrice === null) return null;
  return convertAmount(line.listPrice, line.productCurrency, currency, rates);
}

export function costIn(
  line: Pick<CartLine, "averageCost" | "productCurrency">,
  currency: Currency,
  rates: Rates,
): string | null {
  return convertAmount(line.averageCost, line.productCurrency, currency, rates);
}

/**
 * A new line, with the price already filled in.
 *
 * The seller must see what he is charging before he charges it. When no price
 * can be worked out (none set, or no rate for the conversion) the cell is left
 * empty and the server gives the specific reason on confirm.
 */
export function newCartLine(product: CartProduct, currency: Currency, rates: Rates): CartLine {
  const line: CartLine = {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    quantity: 1,
    unitPrice: "",
    listPrice: product.salePrice,
    averageCost: product.averageCost,
    productCurrency: product.currency,
    available: product.quantity,
  };

  const price = listPriceIn(line, currency, rates);
  return { ...line, unitPrice: price === null ? "" : formatAmountInput(price, currency) };
}

/** Adds one unit, or a new line when the product is not in the cart yet. */
export function addToCart(
  lines: readonly CartLine[],
  product: CartProduct,
  currency: Currency,
  rates: Rates,
): CartLine[] {
  const index = lines.findIndex((line) => line.productId === product.id);
  if (index < 0) return [...lines, newCartLine(product, currency, rates)];

  return lines.map((line, i) =>
    i === index ? { ...line, quantity: line.quantity + 1, available: product.quantity } : line,
  );
}

/**
 * Carries every price across when the sale's currency changes, including the
 * ones the seller typed, so a negotiated price is converted instead of lost.
 */
export function repriceLines(
  lines: readonly CartLine[],
  from: Currency,
  to: Currency,
  rates: Rates,
): CartLine[] {
  if (from === to) return [...lines];

  return lines.map((line) => {
    let typed: Money | null = null;
    try {
      typed = parseAmountInput(line.unitPrice, from);
    } catch {
      typed = null;
    }

    const converted = typed
      ? convertAmount(typed.toDecimalString(), from, to, rates)
      : listPriceIn(line, to, rates);

    return { ...line, unitPrice: converted === null ? "" : formatAmountInput(converted, to) };
  });
}

export type CartPreview = {
  totals: SaleTotals;
  /** False when some cost could not be converted, so the margin is partial. */
  marginKnown: boolean;
};

/**
 * Totals as the server will compute them, or null while a price is missing or
 * unreadable. The server recomputes everything; this is only a preview.
 */
export function previewCart(
  lines: readonly CartLine[],
  discount: string,
  currency: Currency,
  rates: Rates,
): CartPreview | null {
  let marginKnown = true;
  const priced: Array<{ quantity: number; unitPrice: string; unitCost: string }> = [];

  for (const line of lines) {
    const price = safeParse(line.unitPrice, currency);
    if (price === null) return null;

    const cost = costIn(line, currency, rates);
    if (cost === null) marginKnown = false;

    priced.push({
      quantity: line.quantity,
      unitPrice: price.toDecimalString(),
      unitCost: cost ?? "0",
    });
  }

  try {
    return { totals: computeTotals(priced, discount || "0", currency), marginKnown };
  } catch {
    return null;
  }
}

export type DiscountMode = "amount" | "percent";

export type ResolvedDiscount =
  | { ok: true; amount: string }
  | { ok: false; error: string };

/** Turns the discount field into the amount the backend stores. */
export function resolveDiscount(
  mode: DiscountMode,
  input: string,
  subtotal: string,
  currency: Currency,
): ResolvedDiscount {
  if (input.trim() === "") return { ok: true, amount: Money.zero(currency).toDecimalString() };

  if (mode === "percent") {
    const amount = discountFromPercent(subtotal, input, currency);
    return amount === null
      ? { ok: false, error: "El porcentaje va de 0 a 100" }
      : { ok: true, amount };
  }

  const amount = safeParse(input, currency);
  if (amount === null) return { ok: false, error: "Descuento inválido" };
  if (amount.isNegative()) return { ok: false, error: "El descuento no puede ser negativo" };
  return { ok: true, amount: amount.toDecimalString() };
}

export type CashChange =
  | { kind: "change"; amount: string }
  | { kind: "short"; amount: string };

/**
 * Change for a cash payment. Computed on screen only: the sale records what
 * it charged, not the note the customer handed over.
 */
export function cashChange(received: string, total: string, currency: Currency): CashChange | null {
  const paid = safeParse(received, currency);
  if (paid === null) return null;

  const difference = paid.minus(Money.of(total, currency));
  return difference.isNegative()
    ? { kind: "short", amount: Money.zero(currency).minus(difference).toDecimalString() }
    : { kind: "change", amount: difference.toDecimalString() };
}

export type SalePayloadInput = {
  lines: readonly CartLine[];
  customerId: string | null;
  currency: Currency;
  method: string;
  discount: string;
  notes: string;
  invoiceNumber: string;
};

/**
 * Exactly what `createSaleAction` has always received, plus the invoice
 * number. Prices travel as typed; the server parses them in the sale currency.
 */
export function toSalePayload(input: SalePayloadInput) {
  return {
    customerId: input.customerId ?? "",
    currency: input.currency,
    method: input.method,
    discount: input.discount,
    notes: input.notes,
    invoiceNumber: input.invoiceNumber,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  };
}

function safeParse(value: string, currency: Currency): Money | null {
  try {
    return parseAmountInput(value, currency);
  } catch {
    return null;
  }
}
