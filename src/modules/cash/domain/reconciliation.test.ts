import { describe, expect, it } from "vitest";
import { currenciesInPlay, hasDifference, reconcile } from "./reconciliation";

describe("reconcile", () => {
  it("adds the opening count to the cash movements", () => {
    const [line] = reconcile({
      currencies: ["PYG"],
      openingCounts: { PYG: "500000" },
      closingCounts: { PYG: "1300000" },
      movements: [
        { currency: "PYG", amount: "1000000" },
        { currency: "PYG", amount: "-200000" },
      ],
    });

    expect(line.expected).toBe("1300000");
    expect(line.counted).toBe("1300000");
    expect(line.difference).toBe("0");
    expect(hasDifference(line)).toBe(false);
  });

  it("reports a shortfall as a negative difference", () => {
    const [line] = reconcile({
      currencies: ["PYG"],
      openingCounts: { PYG: "0" },
      closingCounts: { PYG: "950000" },
      movements: [{ currency: "PYG", amount: "1000000" }],
    });

    expect(line.difference).toBe("-50000");
    expect(hasDifference(line)).toBe(true);
  });

  it("keeps each currency on its own, without converting", () => {
    const lines = reconcile({
      currencies: ["PYG", "USD"],
      openingCounts: { PYG: "500000", USD: "100" },
      closingCounts: { PYG: "500000", USD: "150.50" },
      movements: [{ currency: "USD", amount: "50.50" }],
    });

    const pyg = lines.find((line) => line.currency === "PYG");
    const usd = lines.find((line) => line.currency === "USD");

    expect(pyg?.expected).toBe("500000");
    expect(pyg?.difference).toBe("0");
    expect(usd?.expected).toBe("150.50");
    expect(usd?.difference).toBe("0.00");
  });

  it("leaves the difference unknown until someone counts", () => {
    const [line] = reconcile({
      currencies: ["PYG"],
      openingCounts: { PYG: "0" },
      closingCounts: {},
      movements: [{ currency: "PYG", amount: "300000" }],
    });

    expect(line.expected).toBe("300000");
    expect(line.counted).toBeNull();
    expect(line.difference).toBeNull();
    expect(hasDifference(line)).toBe(false);
  });

  it("expects zero for a currency that never moved", () => {
    const [line] = reconcile({
      currencies: ["BRL"],
      openingCounts: {},
      closingCounts: { BRL: "0" },
      movements: [],
    });

    expect(line.expected).toBe("0.00");
    expect(line.difference).toBe("0.00");
  });
});

describe("currenciesInPlay", () => {
  it("includes currencies opened with money and currencies that moved", () => {
    const currencies = currenciesInPlay({ PYG: "500000", USD: "0" }, [
      { currency: "BRL", amount: "100" },
    ]);

    expect(currencies).toContain("PYG");
    expect(currencies).toContain("BRL");
    expect(currencies).not.toContain("USD");
  });

  it("returns nothing for an untouched drawer", () => {
    expect(currenciesInPlay({}, [])).toEqual([]);
  });
});
