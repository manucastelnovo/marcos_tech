import { describe, expect, it } from "vitest";
import { parseAmountInput } from "@/shared/domain/money";
import { createSaleSchema } from "../application/schemas";
import {
  addToCart,
  cashChange,
  formatAmountInput,
  newCartLine,
  previewCart,
  repriceLines,
  resolveDiscount,
  toSalePayload,
  type CartProduct,
} from "./cart";

const rates = { USD: "7500" };

const glass: CartProduct = {
  id: "p-glass",
  sku: "VID-13",
  name: "Vidrio templado",
  quantity: 3,
  salePrice: "45000",
  averageCost: "20000",
  currency: "PYG",
};

const screen: CartProduct = {
  id: "p-screen",
  sku: "PAN-13",
  name: "Pantalla iPhone 13",
  quantity: 1,
  salePrice: "120.00",
  averageCost: "80.00",
  currency: "USD",
};

describe("formatAmountInput", () => {
  it("writes amounts the way the counter types them, and reads back exactly", () => {
    expect(formatAmountInput("2500000", "PYG")).toBe("2.500.000");
    expect(formatAmountInput("1234.5", "USD")).toBe("1.234,50");
    expect(parseAmountInput("2.500.000", "PYG")?.toDecimalString()).toBe("2500000");
    expect(parseAmountInput("1.234,50", "USD")?.toDecimalString()).toBe("1234.50");
  });
});

describe("newCartLine", () => {
  it("fills in the list price so the seller sees what he charges", () => {
    expect(newCartLine(glass, "PYG", rates).unitPrice).toBe("45.000");
  });

  it("converts a dollar price into guaraníes", () => {
    expect(newCartLine(screen, "PYG", rates).unitPrice).toBe("900.000");
  });

  it("leaves the cell empty when the price cannot be known", () => {
    expect(newCartLine(screen, "PYG", {}).unitPrice).toBe("");
    expect(newCartLine({ ...glass, salePrice: null }, "PYG", rates).unitPrice).toBe("");
  });
});

describe("addToCart", () => {
  it("adds a unit to an existing line instead of a second line", () => {
    const once = addToCart([], glass, "PYG", rates);
    const twice = addToCart(once, glass, "PYG", rates);

    expect(twice).toHaveLength(1);
    expect(twice[0].quantity).toBe(2);
  });

  it("keeps a price the seller already changed", () => {
    const once = addToCart([], glass, "PYG", rates);
    const edited = [{ ...once[0], unitPrice: "40.000" }];

    expect(addToCart(edited, glass, "PYG", rates)[0].unitPrice).toBe("40.000");
  });
});

describe("repriceLines", () => {
  it("converts a negotiated price instead of resetting it", () => {
    const line = { ...newCartLine(glass, "PYG", rates), unitPrice: "37.500" };

    expect(repriceLines([line], "PYG", "USD", rates)[0].unitPrice).toBe("5,00");
  });

  it("falls back to the list price when the typed one is unreadable", () => {
    const line = { ...newCartLine(screen, "PYG", rates), unitPrice: "abc" };

    expect(repriceLines([line], "PYG", "USD", rates)[0].unitPrice).toBe("120,00");
  });
});

describe("previewCart", () => {
  it("matches what the server computes, margin included", () => {
    const lines = addToCart(addToCart([], glass, "PYG", rates), screen, "PYG", rates);
    const preview = previewCart(lines, "5000", "PYG", rates);

    expect(preview?.totals.subtotal).toBe("945000");
    expect(preview?.totals.total).toBe("940000");
    // 940.000 minus costs of 20.000 and 600.000.
    expect(preview?.totals.margin).toBe("320000");
    expect(preview?.marginKnown).toBe(true);
  });

  it("waits while a price is missing", () => {
    const line = { ...newCartLine(glass, "PYG", rates), unitPrice: "" };
    expect(previewCart([line], "0", "PYG", rates)).toBeNull();
  });

  it("says when the margin is partial because a cost could not be converted", () => {
    const line = { ...newCartLine(screen, "PYG", {}), unitPrice: "900.000" };
    expect(previewCart([line], "0", "PYG", {})?.marginKnown).toBe(false);
  });
});

describe("resolveDiscount", () => {
  it("turns a percentage into an amount at the currency scale", () => {
    expect(resolveDiscount("percent", "10", "45005", "PYG")).toEqual({ ok: true, amount: "4501" });
  });

  it("reads an amount the way it was typed", () => {
    expect(resolveDiscount("amount", "5.000", "45000", "PYG")).toEqual({
      ok: true,
      amount: "5000",
    });
    expect(resolveDiscount("amount", "", "45000", "PYG")).toEqual({ ok: true, amount: "0" });
  });

  it("explains what is wrong", () => {
    expect(resolveDiscount("percent", "150", "45000", "PYG").ok).toBe(false);
    expect(resolveDiscount("amount", "-5", "45000", "PYG").ok).toBe(false);
    expect(resolveDiscount("amount", "cinco", "45000", "PYG").ok).toBe(false);
  });
});

describe("cashChange", () => {
  it("gives change, or says how much is missing", () => {
    expect(cashChange("100.000", "80000", "PYG")).toEqual({ kind: "change", amount: "20000" });
    expect(cashChange("50.000", "80000", "PYG")).toEqual({ kind: "short", amount: "30000" });
    expect(cashChange("", "80000", "PYG")).toBeNull();
  });
});

describe("toSalePayload", () => {
  it("builds exactly what the sale action validates", () => {
    const lines = addToCart([], screen, "PYG", rates);
    const payload = toSalePayload({
      lines,
      customerId: null,
      currency: "PYG",
      method: "CASH",
      discount: resolveDiscount("percent", "10", "900000", "PYG").ok ? "90000" : "",
      notes: "",
      invoiceNumber: "1-2-4",
    });

    const parsed = createSaleSchema.parse(payload);
    expect(parsed.lines).toEqual([{ productId: "p-screen", quantity: 1, unitPrice: "900.000" }]);
    expect(parsed.customerId).toBe("");
    expect(parsed.discount).toBe("90000");
    expect(parsed.invoiceNumber).toBe("001-002-0000004");
  });
});
