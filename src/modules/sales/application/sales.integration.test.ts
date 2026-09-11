import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { ForbiddenError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { createProduct, receiveStock } from "@/modules/inventory/application/commands";
import { getProductDetail } from "@/modules/inventory/application/queries";
import { openCashSession } from "@/modules/cash/application/session";
import { getOpenCashSession } from "@/modules/cash/application/queries";
import { setExchangeRate } from "@/modules/cash/application/exchange-rates";
import { createRepair } from "@/modules/repairs/application/create-repair";
import { intakeSchema } from "@/modules/repairs/application/schemas";
import { parseOrderNumber } from "@/modules/repairs/domain/order-number";
import { parseSaleNumber } from "../domain/sale";
import { createSale } from "./create-sale";
import { getSaleDetail, getSalesSummary } from "./queries";

const admin: CurrentUser = {
  id: "sale-admin",
  email: "admin@sale.local",
  name: "Admin Sale",
  role: "ADMIN",
};

const seller: CurrentUser = {
  id: "sale-seller",
  email: "seller@sale.local",
  name: "Seller Sale",
  role: "SELLER",
};

const technician: CurrentUser = {
  id: "sale-tech",
  email: "tech@sale.local",
  name: "Tech Sale",
  role: "TECHNICIAN",
};

async function stockedProduct(
  overrides: Record<string, unknown> = {},
  received = { quantity: 10, unitCost: "20.000" },
) {
  const product = await createProduct(
    {
      sku: `V-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      name: "Vidrio templado",
      category: "GLASS",
      compatibility: "iPhone 13",
      currency: "PYG",
      salePrice: "45.000",
      minStock: 5,
      location: "",
      tracksSerial: false,
      ...overrides,
    } as Parameters<typeof createProduct>[0],
    seller,
  );

  await receiveStock(
    { productId: product.id, quantity: received.quantity, unitCost: received.unitCost },
    seller,
  );

  return product;
}

beforeAll(async () => {
  for (const user of [admin, seller, technician]) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
        passwordHash: "not-used",
      },
      update: {},
    });
  }
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.saleLine.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.repairPayment.deleteMany();
  await prisma.cashCount.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.repairPart.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockSerial.deleteMany();
  await prisma.product.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.saleLine.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.repairPayment.deleteMany();
  await prisma.cashCount.deleteMany();
  await prisma.cashSession.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.product.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany({
    where: { id: { in: [admin.id, seller.id, technician.id] } },
  });
  await prisma.$disconnect();
});

describe("createSale", () => {
  it("moves stock, the till and the ledger in one transaction", async () => {
    await openCashSession({ counts: [], notes: "" }, seller);
    const product = await stockedProduct();

    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 2, unitPrice: "" }],
      },
      seller,
    );

    expect(parseSaleNumber(sale.number)).not.toBeNull();
    expect(sale.total).toBe("90000");

    const stock = await getProductDetail(product.id);
    expect(stock?.quantity).toBe(8);
    expect(stock?.ledgerQuantity).toBe(8);
    expect(stock?.movements.find((entry) => entry.type === "SALE")?.quantity).toBe(-2);

    const session = await getOpenCashSession();
    expect(session?.lines.find((entry) => entry.currency === "PYG")?.expected).toBe("90000");
  });

  it("uses the product list price when none is typed", async () => {
    const product = await stockedProduct();
    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    const detail = await getSaleDetail(sale.saleId);
    expect(detail?.lines[0].unitPrice).toBe("45000");
  });

  it("freezes the cost so the margin survives a later purchase", async () => {
    const product = await stockedProduct();
    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    await receiveStock({ productId: product.id, quantity: 50, unitCost: "40.000" }, seller);

    const detail = await getSaleDetail(sale.saleId);
    expect(detail?.lines[0].unitCost).toBe("20000");
    expect(detail?.margin).toBe("25000");
  });

  it("takes the discount off the whole ticket", async () => {
    const product = await stockedProduct();
    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "10.000",
        notes: "",
        lines: [{ productId: product.id, quantity: 2, unitPrice: "" }],
      },
      seller,
    );

    const detail = await getSaleDetail(sale.saleId);
    expect(detail?.subtotal).toBe("90000");
    expect(detail?.discount).toBe("10000");
    expect(detail?.total).toBe("80000");
  });

  it("refuses a discount larger than the sale", async () => {
    const product = await stockedProduct();
    await expect(
      createSale(
        {
          customerId: "",
          currency: "PYG",
          method: "CASH",
          discount: "100.000",
          notes: "",
          lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
        },
        seller,
      ),
    ).rejects.toThrow(/descuento/i);
  });

  it("allows selling below cost and says so", async () => {
    const product = await stockedProduct();
    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "Liquidación",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "10.000" }],
      },
      seller,
    );

    expect(sale.belowCost).toBe(true);
    const detail = await getSaleDetail(sale.saleId);
    expect(detail?.margin).toBe("-10000");
  });

  it("records the sale even with no register open, without a cash movement", async () => {
    const product = await stockedProduct();
    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    expect(await getSaleDetail(sale.saleId)).not.toBeNull();
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it("rejects a technician", async () => {
    const product = await stockedProduct();
    await expect(
      createSale(
        {
          customerId: "",
          currency: "PYG",
          method: "CASH",
          discount: "",
          notes: "",
          lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
        },
        technician,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("records both movements when two sales take the last unit at once", async () => {
    const product = await stockedProduct({}, { quantity: 1, unitCost: "20.000" });

    await Promise.all([
      createSale(
        {
          customerId: "",
          currency: "PYG",
          method: "CASH",
          discount: "",
          notes: "",
          lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
        },
        seller,
      ),
      createSale(
        {
          customerId: "",
          currency: "PYG",
          method: "CASH",
          discount: "",
          notes: "",
          lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
        },
        seller,
      ),
    ]);

    const stock = await getProductDetail(product.id);
    expect(stock?.quantity).toBe(-1);
    expect(stock?.ledgerQuantity).toBe(-1);
  });
});

describe("selling a product priced in another currency", () => {
  it("converts price and cost at the configured rate", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    const product = await stockedProduct(
      { currency: "USD", salePrice: "100" },
      { quantity: 5, unitCost: "60" },
    );

    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    const detail = await getSaleDetail(sale.saleId);
    expect(detail?.lines[0].unitPrice).toBe("735000");
    expect(detail?.lines[0].unitCost).toBe("441000");
    expect(detail?.margin).toBe("294000");
  });

  it("refuses rather than guessing when no rate is configured", async () => {
    const product = await stockedProduct(
      { currency: "USD", salePrice: "100" },
      { quantity: 5, unitCost: "60" },
    );

    await expect(
      createSale(
        {
          customerId: "",
          currency: "PYG",
          method: "CASH",
          discount: "",
          notes: "",
          lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
        },
        seller,
      ),
    ).rejects.toThrow(/cotización/i);
  });
});

describe("numbering", () => {
  it("keeps sales and repairs on separate series", async () => {
    const product = await stockedProduct();

    const repair = await createRepair(
      intakeSchema.parse({
        customerPhone: "0981555444",
        customerName: "Cliente Serie",
        brandName: "Apple",
        modelName: "iPhone 13",
        reportedProblem: "No enciende",
        currency: "PYG",
      }),
      seller,
    );

    const sale = await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    // Both start at one because they are different series on the same counter.
    expect(parseOrderNumber(repair.orderNumber)?.sequence).toBe(1);
    expect(parseSaleNumber(sale.number)?.sequence).toBe(1);
    expect(repair.orderNumber.startsWith("OT-")).toBe(true);
    expect(sale.number.startsWith("VT-")).toBe(true);
  });

  it("never hands two simultaneous sales the same number", async () => {
    const product = await stockedProduct({}, { quantity: 50, unitCost: "20.000" });

    const sales = await Promise.all(
      Array.from({ length: 10 }, () =>
        createSale(
          {
            customerId: "",
            currency: "PYG",
            method: "CASH",
            discount: "",
            notes: "",
            lines: [{ productId: product.id, quantity: 1, unitPrice: "" }],
          },
          seller,
        ),
      ),
    );

    const numbers = sales.map((sale) => sale.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("sales summary", () => {
  it("reports the day per currency instead of one mixed total", async () => {
    await setExchangeRate({ currency: "USD", rate: "7350" }, admin);
    const guaraniProduct = await stockedProduct();
    const dollarProduct = await stockedProduct(
      { currency: "USD", salePrice: "100" },
      { quantity: 5, unitCost: "60" },
    );

    await createSale(
      {
        customerId: "",
        currency: "PYG",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: guaraniProduct.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );
    await createSale(
      {
        customerId: "",
        currency: "USD",
        method: "CASH",
        discount: "",
        notes: "",
        lines: [{ productId: dollarProduct.id, quantity: 1, unitPrice: "" }],
      },
      seller,
    );

    const summary = await getSalesSummary();
    expect(summary.todayCount).toBe(2);
    expect(summary.today.PYG).toBe("45000");
    expect(summary.today.USD).toBe("100");
  });
});
