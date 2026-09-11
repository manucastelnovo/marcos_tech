import Decimal from "decimal.js";

/**
 * Currencies the shop operates with.
 *
 * Kept as a plain union rather than importing the Prisma enum: the domain must
 * not depend on the persistence layer.
 */
export const CURRENCIES = ["PYG", "USD", "ARS", "BRL"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Minor-unit precision per currency. Guaraníes have no cents; the others do.
 * Every amount is rounded to its currency scale on construction, so a value
 * that reaches the database can always be rendered exactly.
 */
const CURRENCY_SCALE: Record<Currency, number> = {
  PYG: 0,
  USD: 2,
  ARS: 2,
  BRL: 2,
};

/**
 * Every amount is formatted the way the people reading it write numbers, which
 * is Paraguayan convention regardless of the currency: period groups thousands,
 * comma marks decimals. Rendering dollars as "1,234.56" next to guaraníes as
 * "1.234" would ask the counter to switch conventions mid-screen, and that is
 * exactly how a hundred becomes a hundred thousand.
 *
 * `parseAmountInput` accepts both conventions on the way in, so nobody is
 * punished for typing a number the other way.
 */
const DISPLAY_LOCALE = "es-PY";

export class CurrencyMismatchError extends Error {
  constructor(left: Currency, right: Currency) {
    super(`Cannot operate on ${left} and ${right} without an explicit conversion`);
    this.name = "CurrencyMismatchError";
  }
}

export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Not a valid monetary amount: ${String(value)}`);
    this.name = "InvalidAmountError";
  }
}

export type MoneyInput = string | number | Decimal;

/**
 * An immutable monetary amount bound to its currency.
 *
 * Never use a JavaScript number to hold money. `0.1 + 0.2` is not `0.3`, and a
 * repair priced at 2.000.000 guaraníes must still be 2.000.000 guaraníes after
 * it round-trips through the database.
 */
export class Money {
  private constructor(
    private readonly value: Decimal,
    readonly currency: Currency,
  ) {}

  static of(input: MoneyInput, currency: Currency): Money {
    const decimal = input instanceof Decimal ? input : new Decimal(String(input).trim());
    if (!decimal.isFinite()) throw new InvalidAmountError(input);
    return new Money(round(decimal, currency), currency);
  }

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  /** Parses user input, tolerating empty strings. Returns null when blank. */
  static parse(input: string | null | undefined, currency: Currency): Money | null {
    if (input === null || input === undefined) return null;
    const trimmed = String(input).trim();
    if (trimmed === "") return null;
    return Money.of(trimmed, currency);
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(round(this.value.plus(other.value), this.currency), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(round(this.value.minus(other.value), this.currency), this.currency);
  }

  times(factor: MoneyInput): Money {
    const multiplier = factor instanceof Decimal ? factor : new Decimal(String(factor));
    return new Money(round(this.value.times(multiplier), this.currency), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.greaterThan(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  /** Canonical string for persistence. Always at the currency scale. */
  toDecimalString(): string {
    return this.value.toFixed(CURRENCY_SCALE[this.currency]);
  }

  toNumber(): number {
    return this.value.toNumber();
  }

  /** Localised string for display, e.g. "Gs. 2.000.000" or "USD 100,00". */
  format(): string {
    const scale = CURRENCY_SCALE[this.currency];
    const formatted = new Intl.NumberFormat(DISPLAY_LOCALE, {
      minimumFractionDigits: scale,
      maximumFractionDigits: scale,
    }).format(this.value.toNumber());
    return `${CURRENCY_SYMBOL[this.currency]} ${formatted}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  PYG: "Gs.",
  USD: "USD",
  ARS: "ARS",
  BRL: "R$",
};

export const CURRENCY_LABEL: Record<Currency, string> = {
  PYG: "Guaraníes",
  USD: "Dólares",
  ARS: "Pesos argentinos",
  BRL: "Reales",
};

function round(value: Decimal, currency: Currency): Decimal {
  return value.toDecimalPlaces(CURRENCY_SCALE[currency], Decimal.ROUND_HALF_UP);
}

/**
 * Turns what a person actually types into a Money.
 *
 * The counter writes "2.000.000" for two million guaraníes and "100,50" for a
 * hundred and fifty cents of a dollar. Feeding either straight to a numeric
 * parser produces silent nonsense, so separators are resolved against the
 * currency's own scale:
 *
 * - Zero-decimal currencies (PYG): every separator is a thousands separator.
 * - Two-decimal currencies: the last "." or "," followed by one or two digits
 *   is the decimal point; everything else is grouping.
 *
 * Returns null for blank input, and throws InvalidAmountError for input that
 * cannot be read as a number at all.
 */
export function parseAmountInput(
  raw: string | null | undefined,
  currency: Currency,
): Money | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;

  if (!/^[\d.,\s]+$/.test(body)) throw new InvalidAmountError(raw);

  const digitsAndSeparators = body.replace(/\s/g, "");
  let canonical: string;

  if (CURRENCY_SCALE[currency] === 0) {
    canonical = digitsAndSeparators.replace(/[.,]/g, "");
  } else {
    const decimalMatch = /[.,](\d{1,2})$/.exec(digitsAndSeparators);
    if (decimalMatch) {
      const separatorIndex = digitsAndSeparators.length - decimalMatch[0].length;
      const whole = digitsAndSeparators.slice(0, separatorIndex).replace(/[.,]/g, "");
      canonical = `${whole || "0"}.${decimalMatch[1]}`;
    } else {
      canonical = digitsAndSeparators.replace(/[.,]/g, "");
    }
  }

  if (canonical === "" || !/^\d+(\.\d+)?$/.test(canonical)) throw new InvalidAmountError(raw);

  return Money.of(negative ? `-${canonical}` : canonical, currency);
}

export function currencyScale(currency: Currency): number {
  return CURRENCY_SCALE[currency];
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}
