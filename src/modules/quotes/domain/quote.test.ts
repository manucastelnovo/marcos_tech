import { describe, expect, it } from "vitest";
import { BusinessRuleError } from "@/shared/domain/errors";
import {
  allowedQuoteTransitions,
  assertQuoteTransition,
  formatQuoteNumber,
  isExpired,
  parseQuoteNumber,
  quoteTotal,
} from "./quote";

describe("quote numbering", () => {
  it("uses its own series, separate from repairs and sales", () => {
    expect(formatQuoteNumber(2026, 1)).toBe("PR-2026-00001");
    expect(parseQuoteNumber("PR-2026-00007")).toEqual({ year: 2026, sequence: 7 });
    expect(parseQuoteNumber("OT-2026-00007")).toBeNull();
    expect(parseQuoteNumber("VT-2026-00007")).toBeNull();
  });
});

describe("quoteTotal", () => {
  it("adds parts and labour, the way the client wrote the example", () => {
    // iPhone 13, screen: repuesto 80, mano de obra 20, total 100.
    expect(quoteTotal("80", "20", "USD")).toBe("100.00");
  });

  it("treats a missing component as zero", () => {
    expect(quoteTotal("450000", null, "PYG")).toBe("450000");
    expect(quoteTotal(null, "150000", "PYG")).toBe("150000");
    expect(quoteTotal(null, null, "PYG")).toBe("0");
  });
});

describe("quote status", () => {
  it("can be accepted or rejected while pending", () => {
    expect(allowedQuoteTransitions("PENDING")).toEqual(["ACCEPTED", "REJECTED"]);
  });

  it("is terminal once accepted, so a second work order cannot be created", () => {
    expect(allowedQuoteTransitions("ACCEPTED")).toHaveLength(0);
    expect(() => assertQuoteTransition("ACCEPTED", "PENDING")).toThrow(BusinessRuleError);
  });

  it("lets a rejected quote come back, because customers change their mind", () => {
    expect(allowedQuoteTransitions("REJECTED")).toEqual(["PENDING"]);
  });
});

describe("isExpired", () => {
  const now = new Date("2026-09-10T12:00:00Z");

  it("is stale once the date passed", () => {
    expect(isExpired(new Date("2026-09-09T12:00:00Z"), now)).toBe(true);
  });

  it("is fine before the date", () => {
    expect(isExpired(new Date("2026-09-20T12:00:00Z"), now)).toBe(false);
  });

  it("never expires without a date", () => {
    expect(isExpired(null, now)).toBe(false);
  });
});
