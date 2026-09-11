import { describe, expect, it } from "vitest";
import { formatOrderNumber, looksLikeOrderNumber, parseOrderNumber } from "./order-number";

describe("formatOrderNumber", () => {
  it("pads the sequence to five digits", () => {
    expect(formatOrderNumber(2026, 1)).toBe("OT-2026-00001");
    expect(formatOrderNumber(2026, 147)).toBe("OT-2026-00147");
  });

  it("does not truncate once the shop passes 99999 orders", () => {
    expect(formatOrderNumber(2026, 100000)).toBe("OT-2026-100000");
  });
});

describe("parseOrderNumber", () => {
  it("reads back what it wrote", () => {
    expect(parseOrderNumber("OT-2026-00147")).toEqual({ year: 2026, sequence: 147 });
  });

  it("is case insensitive and tolerates whitespace", () => {
    expect(parseOrderNumber("  ot-2026-00147 ")).toEqual({ year: 2026, sequence: 147 });
  });

  it("rejects anything else", () => {
    expect(parseOrderNumber("2026-00147")).toBeNull();
    expect(parseOrderNumber("OT-2026-147")).toBeNull();
    expect(looksLikeOrderNumber("iPhone 13")).toBe(false);
  });
});
