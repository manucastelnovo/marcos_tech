import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { costToString, lineCost, sumCosts, weightedAverageCost } from "./cost";

describe("weightedAverageCost", () => {
  it("uses the incoming price when there is nothing on hand", () => {
    const average = weightedAverageCost({
      currentQuantity: 0,
      currentAverage: "0",
      incomingQuantity: 5,
      incomingUnitCost: "310000",
    });
    expect(average.toString()).toBe("310000");
  });

  it("blends two purchases by quantity, not by price", () => {
    // 5 at 300.000 and 5 at 310.000 average to 305.000.
    const average = weightedAverageCost({
      currentQuantity: 5,
      currentAverage: "300000",
      incomingQuantity: 5,
      incomingUnitCost: "310000",
    });
    expect(average.toString()).toBe("305000");
  });

  it("weights an uneven purchase correctly", () => {
    // 9 at 300.000 and 1 at 400.000 is 310.000, not 350.000.
    const average = weightedAverageCost({
      currentQuantity: 9,
      currentAverage: "300000",
      incomingQuantity: 1,
      incomingUnitCost: "400000",
    });
    expect(average.toString()).toBe("310000");
  });

  it("keeps sub-unit precision instead of drifting", () => {
    // 2 at 100 and 1 at 101 is 100.3333..., which must not round to 100.
    const average = weightedAverageCost({
      currentQuantity: 2,
      currentAverage: "100",
      incomingQuantity: 1,
      incomingUnitCost: "101",
    });
    expect(costToString(average)).toBe("100.3333");
  });

  it("does not drift across many small purchases", () => {
    let quantity = 0;
    let average = new Decimal(0);

    for (let index = 0; index < 100; index += 1) {
      average = weightedAverageCost({
        currentQuantity: quantity,
        currentAverage: average,
        incomingQuantity: 1,
        incomingUnitCost: "100.5",
      });
      quantity += 1;
    }

    expect(average.toString()).toBe("100.5");
  });

  it("treats a negative count as no basis at all", () => {
    // Parts were used before their purchase was recorded. The old average
    // describes nothing, so the incoming price becomes the basis.
    const average = weightedAverageCost({
      currentQuantity: -3,
      currentAverage: "999999",
      incomingQuantity: 10,
      incomingUnitCost: "250000",
    });
    expect(average.toString()).toBe("250000");
  });

  it("ignores a purchase of nothing", () => {
    const average = weightedAverageCost({
      currentQuantity: 4,
      currentAverage: "300000",
      incomingQuantity: 0,
      incomingUnitCost: "999999",
    });
    expect(average.toString()).toBe("300000");
  });
});

describe("lineCost and sumCosts", () => {
  it("multiplies a frozen unit cost by the quantity", () => {
    expect(lineCost("310000", 3).toString()).toBe("930000");
  });

  it("adds up the real cost of a repair's parts", () => {
    const total = sumCosts([
      { unitCost: "310000.0000", quantity: 1 },
      { unitCost: "45000.0000", quantity: 2 },
    ]);
    expect(total.toString()).toBe("400000");
  });

  it("returns zero for a repair with no parts", () => {
    expect(sumCosts([]).toString()).toBe("0");
  });
});
