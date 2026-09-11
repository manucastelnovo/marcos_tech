import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { ForbiddenError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { createRepair } from "@/modules/repairs/application/create-repair";
import { intakeSchema } from "@/modules/repairs/application/schemas";
import { adjustStock, createProduct, receiveStock } from "./commands";
import { consumePartInRepair, removePartFromRepair } from "./consume-part";
import { getProductDetail, listRepairParts, repairPartsCost } from "./queries";

const seller: CurrentUser = {
  id: "inv-seller",
  email: "seller@inv.local",
  name: "Seller Inv",
  role: "SELLER",
};

const technician: CurrentUser = {
  id: "inv-tech",
  email: "tech@inv.local",
  name: "Tech Inv",
  role: "TECHNICIAN",
};

async function newProduct(overrides: Record<string, unknown> = {}) {
  return createProduct(
    {
      sku: `SKU-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      name: "Pantalla iPhone 13",
      category: "SCREEN",
      compatibility: "iPhone 13",
      currency: "PYG",
      salePrice: "450.000",
      minStock: 2,
      location: "",
      tracksSerial: false,
      ...overrides,
    } as Parameters<typeof createProduct>[0],
    seller,
  );
}

async function newRepair() {
  return createRepair(
    intakeSchema.parse({
      customerPhone: `0981${Math.floor(100000 + Math.random() * 899999)}`,
      customerName: "Cliente Stock",
      brandName: "Apple",
      modelName: "iPhone 13",
      reportedProblem: "Pantalla rota",
      currency: "PYG",
      finalPrice: "2.000.000",
    }),
    seller,
  );
}

/** The invariant the whole slice rests on. */
async function assertLedgerMatchesCache(productId: string) {
  const detail = await getProductDetail(productId);
  expect(detail?.quantity).toBe(detail?.ledgerQuantity);
}

beforeAll(async () => {
  for (const user of [seller, technician]) {
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
  await prisma.repairPart.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockSerial.deleteMany();
  await prisma.product.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counter.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.repairPart.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockSerial.deleteMany();
  await prisma.product.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: [seller.id, technician.id] } } });
  await prisma.$disconnect();
});

describe("receiveStock", () => {
  it("moves the ledger and the cached quantity together", async () => {
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 5, unitCost: "300.000" }, seller);

    const detail = await getProductDetail(product.id);
    expect(detail?.quantity).toBe(5);
    expect(detail?.ledgerQuantity).toBe(5);
    expect(detail?.averageCost).toBe("300000");
    expect(detail?.movements).toHaveLength(1);
    expect(detail?.movements[0].type).toBe("PURCHASE");
  });

  it("recomputes the weighted average across purchases", async () => {
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 5, unitCost: "300.000" }, seller);
    await receiveStock({ productId: product.id, quantity: 5, unitCost: "310.000" }, seller);

    const detail = await getProductDetail(product.id);
    expect(detail?.quantity).toBe(10);
    expect(detail?.averageCost).toBe("305000");
    await assertLedgerMatchesCache(product.id);
  });

  it("refuses a serial list that does not match the quantity received", async () => {
    const product = await newProduct({ tracksSerial: true });
    await expect(
      receiveStock(
        { productId: product.id, quantity: 3, unitCost: "300.000", serials: ["A1", "A2"] },
        seller,
      ),
    ).rejects.toThrow(/números de serie/i);
  });

  it("refuses to load the same serial twice", async () => {
    const product = await newProduct({ tracksSerial: true });
    await receiveStock(
      { productId: product.id, quantity: 2, unitCost: "300.000", serials: ["A1", "A2"] },
      seller,
    );

    await expect(
      receiveStock(
        { productId: product.id, quantity: 1, unitCost: "300.000", serials: ["A1"] },
        seller,
      ),
    ).rejects.toThrow(/ya está cargado/i);
  });

  it("rejects a technician", async () => {
    const product = await newProduct();
    await expect(
      receiveStock({ productId: product.id, quantity: 1, unitCost: "1000" }, technician),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("consuming a part in a repair", () => {
  it("decrements stock, freezes the cost and links the movement to the order", async () => {
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 5, unitCost: "300.000" }, seller);
    const repair = await newRepair();

    await consumePartInRepair(
      { repairId: repair.repairId, productId: product.id, quantity: 1, description: "", serialId: "", unitCost: "" },
      technician,
    );

    const detail = await getProductDetail(product.id);
    expect(detail?.quantity).toBe(4);
    await assertLedgerMatchesCache(product.id);

    const parts = await listRepairParts(repair.repairId);
    expect(parts).toHaveLength(1);
    expect(parts[0].unitCost).toBe("300000");
    expect(parts[0].quantity).toBe(1);

    const movement = detail?.movements.find((entry) => entry.type === "REPAIR_USE");
    expect(movement?.quantity).toBe(-1);
    expect(movement?.repairOrderNumber).toBe(repair.orderNumber);
  });

  it("never lets a later purchase rewrite what an earlier repair cost", async () => {
    // This is the whole point of freezing the cost at consumption.
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 1, unitCost: "300.000" }, seller);
    const repair = await newRepair();

    await consumePartInRepair(
      { repairId: repair.repairId, productId: product.id, quantity: 1, description: "", serialId: "", unitCost: "" },
      seller,
    );

    await receiveStock({ productId: product.id, quantity: 10, unitCost: "500.000" }, seller);

    const parts = await listRepairParts(repair.repairId);
    expect(parts[0].unitCost).toBe("300000");

    const detail = await getProductDetail(product.id);
    expect(detail?.averageCost).toBe("500000");
  });

  it("records the part even when the shelf runs out, and reports the negative", async () => {
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 1, unitCost: "300.000" }, seller);
    const repair = await newRepair();

    await consumePartInRepair(
      { repairId: repair.repairId, productId: product.id, quantity: 3, description: "", serialId: "", unitCost: "" },
      seller,
    );

    const detail = await getProductDetail(product.id);
    expect(detail?.quantity).toBe(-2);
    expect(detail?.health).toBe("NEGATIVE");
    await assertLedgerMatchesCache(product.id);
  });

  it("accepts a part that never came from stock", async () => {
    const repair = await newRepair();

    await consumePartInRepair(
      {
        repairId: repair.repairId,
        productId: "",
        description: "Pin de carga comprado en el momento",
        quantity: 1,
        serialId: "",
        unitCost: "120.000",
      },
      seller,
    );

    const parts = await listRepairParts(repair.repairId);
    expect(parts[0].productId).toBeNull();
    expect(parts[0].unitCost).toBe("120000");
  });

  it("computes the repair's real part cost from what was consumed", async () => {
    const screen = await newProduct();
    const connector = await newProduct({ name: "Pin de carga", category: "CONNECTOR" });
    await receiveStock({ productId: screen.id, quantity: 2, unitCost: "310.000" }, seller);
    await receiveStock({ productId: connector.id, quantity: 5, unitCost: "45.000" }, seller);

    const repair = await newRepair();
    await consumePartInRepair(
      { repairId: repair.repairId, productId: screen.id, quantity: 1, description: "", serialId: "", unitCost: "" },
      seller,
    );
    await consumePartInRepair(
      { repairId: repair.repairId, productId: connector.id, quantity: 2, description: "", serialId: "", unitCost: "" },
      seller,
    );

    const cost = await repairPartsCost(repair.repairId);
    expect(cost.PYG).toBe("400000");
  });

  it("claims a serial once and refuses to hand it out again", async () => {
    const product = await newProduct({ tracksSerial: true });
    await receiveStock(
      { productId: product.id, quantity: 2, unitCost: "300.000", serials: ["S1", "S2"] },
      seller,
    );

    const detail = await getProductDetail(product.id);
    const serialId = detail!.serials.find((entry) => entry.serial === "S1")!.id;

    const first = await newRepair();
    await consumePartInRepair(
      { repairId: first.repairId, productId: product.id, quantity: 1, serialId, description: "", unitCost: "" },
      seller,
    );

    const second = await newRepair();
    await expect(
      consumePartInRepair(
        { repairId: second.repairId, productId: product.id, quantity: 1, serialId, description: "", unitCost: "" },
        seller,
      ),
    ).rejects.toThrow(/ya no está disponible/i);
  });

  it("refuses a serial for more than one unit", async () => {
    const product = await newProduct({ tracksSerial: true });
    await receiveStock(
      { productId: product.id, quantity: 2, unitCost: "300.000", serials: ["S1", "S2"] },
      seller,
    );
    const detail = await getProductDetail(product.id);
    const serialId = detail!.serials[0].id;
    const repair = await newRepair();

    await expect(
      consumePartInRepair(
        { repairId: repair.repairId, productId: product.id, quantity: 2, serialId, description: "", unitCost: "" },
        seller,
      ),
    ).rejects.toThrow(/una sola unidad/i);
  });
});

describe("removing a part", () => {
  it("puts the units back and frees the serial, keeping both ledger rows", async () => {
    const product = await newProduct({ tracksSerial: true });
    await receiveStock(
      { productId: product.id, quantity: 1, unitCost: "300.000", serials: ["S9"] },
      seller,
    );
    const before = await getProductDetail(product.id);
    const serialId = before!.serials[0].id;

    const repair = await newRepair();
    const part = await consumePartInRepair(
      { repairId: repair.repairId, productId: product.id, quantity: 1, serialId, description: "", unitCost: "" },
      seller,
    );

    await removePartFromRepair({ repairPartId: part.id, reason: "Se cargó por error" }, seller);

    const after = await getProductDetail(product.id);
    expect(after?.quantity).toBe(1);
    expect(after?.serials[0].status).toBe("IN_STOCK");
    expect(after?.movements.filter((entry) => entry.type === "RETURN")).toHaveLength(1);
    expect(after?.movements.filter((entry) => entry.type === "REPAIR_USE")).toHaveLength(1);
    await assertLedgerMatchesCache(product.id);
    expect(await listRepairParts(repair.repairId)).toHaveLength(0);
  });
});

describe("the ledger is the truth", () => {
  it("stays in step through a long mixed sequence", async () => {
    const product = await newProduct();
    const repair = await newRepair();

    await receiveStock({ productId: product.id, quantity: 20, unitCost: "300.000" }, seller);
    await adjustStock({ productId: product.id, quantity: -3, reason: "Rotura en el taller" }, seller);
    await receiveStock({ productId: product.id, quantity: 7, unitCost: "320.000" }, seller);

    for (let index = 0; index < 5; index += 1) {
      await consumePartInRepair(
        { repairId: repair.repairId, productId: product.id, quantity: 2, description: "", serialId: "", unitCost: "" },
        seller,
      );
    }

    await adjustStock({ productId: product.id, quantity: 1, reason: "Apareció una unidad" }, seller);

    const detail = await getProductDetail(product.id);
    expect(detail?.quantity).toBe(20 - 3 + 7 - 10 + 1);
    await assertLedgerMatchesCache(product.id);
  });

  it("records both movements when two jobs take the last unit at once", async () => {
    const product = await newProduct();
    await receiveStock({ productId: product.id, quantity: 1, unitCost: "300.000" }, seller);
    const first = await newRepair();
    const second = await newRepair();

    await Promise.all([
      consumePartInRepair(
        { repairId: first.repairId, productId: product.id, quantity: 1, description: "", serialId: "", unitCost: "" },
        seller,
      ),
      consumePartInRepair(
        { repairId: second.repairId, productId: product.id, quantity: 1, description: "", serialId: "", unitCost: "" },
        seller,
      ),
    ]);

    const detail = await getProductDetail(product.id);
    // Both parts really left the shelf, so the count is minus one rather than
    // an invented zero.
    expect(detail?.quantity).toBe(-1);
    await assertLedgerMatchesCache(product.id);
  });
});
