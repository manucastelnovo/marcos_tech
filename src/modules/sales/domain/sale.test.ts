import { describe, expect, it } from "vitest";
import {
  computeTotals,
  convertAmount,
  discountFromPercent,
  formatSaleNumber,
  normalizeInvoiceNumber,
  parseSaleNumber,
} from "./sale";

describe("sale numbering", () => {
  it("uses its own prefix on the same counter machinery as repairs", () => {
    expect(formatSaleNumber(2026, 1)).toBe("VT-2026-00001");
    expect(parseSaleNumber("VT-2026-00042")).toEqual({ year: 2026, sequence: 42 });
  });

  it("does not accept a repair number", () => {
    expect(parseSaleNumber("OT-2026-00042")).toBeNull();
  });
});

describe("computeTotals", () => {
  const lines = [
    { quantity: 2, unitPrice: "45000", unitCost: "20000" },
    { quantity: 1, unitPrice: "120000", unitCost: "80000" },
  ];

  it("adds up the ticket and the margin", () => {
    const totals = computeTotals(lines, "0", "PYG");
    expect(totals.subtotal).toBe("210000");
    expect(totals.total).toBe("210000");
    // Revenue 210.000 minus cost 120.000.
    expect(totals.margin).toBe("90000");
    expect(totals.belowCost).toBe(false);
  });

  it("takes the discount off the whole sale, not off each line", () => {
    const totals = computeTotals(lines, "10000", "PYG");
    expect(totals.total).toBe("200000");
    expect(totals.margin).toBe("80000");
  });

  it("flags a sale below cost without refusing it", () => {
    const totals = computeTotals([{ quantity: 1, unitPrice: "50000", unitCost: "80000" }], "0", "PYG");
    expect(totals.margin).toBe("-30000");
    expect(totals.belowCost).toBe(true);
  });

  it("handles an empty ticket", () => {
    const totals = computeTotals([], "0", "PYG");
    expect(totals.subtotal).toBe("0");
    expect(totals.total).toBe("0");
  });

  it("keeps dollar cents exact", () => {
    const totals = computeTotals(
      [{ quantity: 3, unitPrice: "19.99", unitCost: "12.50" }],
      "0.97",
      "USD",
    );
    expect(totals.subtotal).toBe("59.97");
    expect(totals.total).toBe("59.00");
    expect(totals.margin).toBe("21.50");
  });
});

describe("convertAmount", () => {
  const rates = { USD: "7350", BRL: "1450" };

  it("returns the same amount when nothing changes", () => {
    expect(convertAmount("100", "USD", "USD", rates)).toBe("100.00");
  });

  it("converts a foreign amount into guaraníes", () => {
    expect(convertAmount("100", "USD", "PYG", rates)).toBe("735000");
  });

  it("converts guaraníes into a foreign amount", () => {
    expect(convertAmount("735000", "PYG", "USD", rates)).toBe("100.00");
  });

  it("pivots through guaraníes between two foreign currencies", () => {
    // 10 USD is 73.500 guaraníes, which at 1.450 is 50,69 reales.
    expect(convertAmount("10", "USD", "BRL", rates)).toBe("50.69");
  });

  it("refuses to guess when no rate is configured", () => {
    expect(convertAmount("100", "ARS", "PYG", rates)).toBeNull();
    expect(convertAmount("100", "PYG", "ARS", rates)).toBeNull();
  });

  it("does not lose precision at the pivot", () => {
    // Rounding to whole guaraníes midway would drift the result.
    const there = convertAmount("1", "USD", "PYG", rates);
    expect(convertAmount(there as string, "PYG", "USD", rates)).toBe("1.00");
  });
});

describe("discountFromPercent", () => {
  it("rounds guaraníes to whole units, half up", () => {
    // 10% of 45.005 is 4.500,5.
    expect(discountFromPercent("45005", "10", "PYG")).toBe("4501");
  });

  it("keeps cents for dollars", () => {
    expect(discountFromPercent("99.99", "15", "USD")).toBe("15.00");
    expect(discountFromPercent("10.00", "12,5", "USD")).toBe("1.25");
  });

  it("accepts the whole range and nothing outside it", () => {
    expect(discountFromPercent("1000", "0", "PYG")).toBe("0");
    expect(discountFromPercent("1000", "100", "PYG")).toBe("1000");
    expect(discountFromPercent("1000", "100.5", "PYG")).toBeNull();
    expect(discountFromPercent("1000", "-5", "PYG")).toBeNull();
    expect(discountFromPercent("1000", "diez", "PYG")).toBeNull();
    expect(discountFromPercent("1000", "", "PYG")).toBeNull();
  });
});

describe("normalizeInvoiceNumber", () => {
  it("keeps the canonical form", () => {
    expect(normalizeInvoiceNumber("001-002-0000004")).toBe("001-002-0000004");
  });

  it("pads the short form and splits the bare digits", () => {
    expect(normalizeInvoiceNumber(" 1-2-4 ")).toBe("001-002-0000004");
    expect(normalizeInvoiceNumber("0010020000004")).toBe("001-002-0000004");
  });

  it("refuses anything it would have to guess", () => {
    expect(normalizeInvoiceNumber("001-002")).toBeNull();
    expect(normalizeInvoiceNumber("001-002-00000004")).toBeNull();
    expect(normalizeInvoiceNumber("A01-002-0000004")).toBeNull();
    expect(normalizeInvoiceNumber("001-002-0000000")).toBeNull();
    expect(normalizeInvoiceNumber("0010020000000")).toBeNull();
    expect(normalizeInvoiceNumber("12345")).toBeNull();
  });
});
