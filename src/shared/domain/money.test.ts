import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidAmountError,
  Money,
  parseAmountInput,
} from "./money";

describe("Money", () => {
  it("keeps guaraníes as whole numbers", () => {
    expect(Money.of("2000000", "PYG").toDecimalString()).toBe("2000000");
    expect(Money.of("2000000.4", "PYG").toDecimalString()).toBe("2000000");
    expect(Money.of("2000000.5", "PYG").toDecimalString()).toBe("2000001");
  });

  it("keeps two decimals for dollars", () => {
    expect(Money.of("100", "USD").toDecimalString()).toBe("100.00");
    expect(Money.of("100.005", "USD").toDecimalString()).toBe("100.01");
  });

  it("does not drift the way binary floating point does", () => {
    // 0.1 + 0.2 !== 0.3 with numbers. It must be exact here.
    const sum = Money.of("0.1", "USD").plus(Money.of("0.2", "USD"));
    expect(sum.toDecimalString()).toBe("0.30");
  });

  it("survives a large guaraní sum without precision loss", () => {
    const total = Money.of("999999999999", "PYG").plus(Money.of("1", "PYG"));
    expect(total.toDecimalString()).toBe("1000000000000");
  });

  it("refuses to mix currencies", () => {
    expect(() => Money.of("1", "PYG").plus(Money.of("1", "USD"))).toThrow(CurrencyMismatchError);
  });

  it("computes a balance as price minus deposit", () => {
    const price = Money.of("2000000", "PYG");
    const deposit = Money.of("500000", "PYG");
    expect(price.minus(deposit).toDecimalString()).toBe("1500000");
  });

  it("formats every currency the way Paraguayans write numbers", () => {
    // Period groups thousands, comma marks decimals, whatever the currency.
    // A dollar amount shown as "1,234.56" beside "Gs. 2.000.000" is how a
    // hundred gets read as a hundred thousand.
    expect(Money.of("2000000", "PYG").format()).toBe("Gs. 2.000.000");
    expect(Money.of("1234.56", "USD").format()).toBe("USD 1.234,56");
    expect(Money.of("1234.56", "BRL").format()).toBe("R$ 1.234,56");
    expect(Money.of("100", "USD").format()).toBe("USD 100,00");
  });

  it("rejects values that are not numbers", () => {
    expect(() => Money.of("abc", "PYG")).toThrow();
    expect(() => Money.of(Number.NaN, "PYG")).toThrow(InvalidAmountError);
  });
});

describe("parseAmountInput", () => {
  it("treats every separator as grouping for guaraníes", () => {
    expect(parseAmountInput("2.000.000", "PYG")?.toDecimalString()).toBe("2000000");
    expect(parseAmountInput("2,000,000", "PYG")?.toDecimalString()).toBe("2000000");
    expect(parseAmountInput("2 000 000", "PYG")?.toDecimalString()).toBe("2000000");
    expect(parseAmountInput("2000000", "PYG")?.toDecimalString()).toBe("2000000");
  });

  it("reads the trailing separator as a decimal point for dollars", () => {
    expect(parseAmountInput("100,50", "USD")?.toDecimalString()).toBe("100.50");
    expect(parseAmountInput("100.50", "USD")?.toDecimalString()).toBe("100.50");
    expect(parseAmountInput("1.234,56", "USD")?.toDecimalString()).toBe("1234.56");
    expect(parseAmountInput("1,234.56", "USD")?.toDecimalString()).toBe("1234.56");
  });

  it("treats a trailing group of three digits as grouping, not decimals", () => {
    expect(parseAmountInput("1.234", "USD")?.toDecimalString()).toBe("1234.00");
  });

  it("returns null for blank input", () => {
    expect(parseAmountInput("", "PYG")).toBeNull();
    expect(parseAmountInput("   ", "PYG")).toBeNull();
    expect(parseAmountInput(null, "PYG")).toBeNull();
    expect(parseAmountInput(undefined, "PYG")).toBeNull();
  });

  it("rejects text", () => {
    expect(() => parseAmountInput("mil quinientos", "PYG")).toThrow(InvalidAmountError);
    expect(() => parseAmountInput("100 USD", "USD")).toThrow(InvalidAmountError);
  });
});
