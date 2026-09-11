import { describe, expect, it } from "vitest";
import { formatPhone, isPlausiblePhone, normalizePhone, toWhatsAppNumber } from "./phone";

describe("normalizePhone", () => {
  it("keeps only digits, however the number was typed", () => {
    expect(normalizePhone("0981 123-456")).toBe("0981123456");
    expect(normalizePhone("+595 981 123456")).toBe("595981123456");
    expect(normalizePhone("(0981) 123.456")).toBe("0981123456");
  });
});

describe("toWhatsAppNumber", () => {
  it("drops the local trunk zero and adds the country code", () => {
    expect(toWhatsAppNumber("0981123456")).toBe("595981123456");
    expect(toWhatsAppNumber("0981 123-456")).toBe("595981123456");
  });

  it("leaves an already international number alone", () => {
    expect(toWhatsAppNumber("+595981123456")).toBe("595981123456");
    expect(toWhatsAppNumber("595981123456")).toBe("595981123456");
  });

  it("does not double the country code", () => {
    const once = toWhatsAppNumber("0981123456");
    expect(toWhatsAppNumber(once)).toBe(once);
  });
});

describe("formatPhone", () => {
  it("formats a Paraguayan mobile", () => {
    expect(formatPhone("0981123456")).toBe("0981 123-456");
  });

  it("formats an international number", () => {
    expect(formatPhone("595981123456")).toBe("+595 981 123-456");
  });

  it("returns anything unexpected untouched instead of mangling it", () => {
    expect(formatPhone("021 555 000")).toBe("021 555 000");
  });
});

describe("isPlausiblePhone", () => {
  it("accepts mobiles and landlines", () => {
    expect(isPlausiblePhone("0981123456")).toBe(true);
    expect(isPlausiblePhone("021555000")).toBe(true);
  });

  it("rejects fragments and absurd lengths", () => {
    expect(isPlausiblePhone("123")).toBe(false);
    expect(isPlausiblePhone("1234567890123456789")).toBe(false);
  });
});
