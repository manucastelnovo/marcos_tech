import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { createProduct, receiveStock } from "@/modules/inventory/application/commands";
import { createSale } from "./create-sale";
import { getFeaturedProducts, listCatalogCategories, searchCatalog } from "./catalog";

const seller: CurrentUser = {
  id: "catalog-seller",
  email: "seller@catalog.local",
  name: "Seller Catalog",
  role: "SELLER",
};

async function product(
  sku: string,
  overrides: Partial<Parameters<typeof createProduct>[0]> = {},
  stock: { quantity: number; serials?: string[] } = { quantity: 5 },
) {
  const created = await createProduct(
    {
      sku,
      name: `Producto ${sku}`,
      category: "GLASS",
      compatibility: "",
      currency: "PYG",
      salePrice: "45.000",
      minStock: 0,
      location: "",
      tracksSerial: false,
      ...overrides,
    },
    seller,
  );
  if (stock.quantity > 0) {
    await receiveStock(
      {
        productId: created.id,
        quantity: stock.quantity,
        unitCost: "20.000",
        serials: stock.serials,
      },
      seller,
    );
  }
  return created;
}

async function cleanup() {
  await prisma.auditLog.deleteMany();
  await prisma.saleLine.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockSerial.deleteMany();
  await prisma.product.deleteMany();
  await prisma.counter.deleteMany();
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: seller.id },
    create: {
      id: seller.id,
      email: seller.email,
      fullName: seller.name,
      role: seller.role,
      passwordHash: "not-used",
    },
    update: {},
  });
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.user.deleteMany({ where: { id: seller.id } });
  await prisma.$disconnect();
});

describe("searchCatalog", () => {
  it("puts the exact code first, so a scanner adds the right product", async () => {
    await product("VID-130");
    await product("VID-13");

    const results = await searchCatalog({ query: "vid-13" });

    expect(results.map((entry) => entry.sku)).toEqual(["VID-13", "VID-130"]);
    expect(results[0].salePrice).toBe("45000");
  });

  it("finds a product by the IMEI of a unit on the shelf, and not once it is gone", async () => {
    await product(
      "IPH-13",
      { name: "iPhone 13", category: "OTHER", tracksSerial: true },
      { quantity: 1, serials: ["356789012345678"] },
    );

    const found = await searchCatalog({ query: "356789012345678" });
    expect(found.map((entry) => entry.sku)).toEqual(["IPH-13"]);

    await prisma.stockSerial.updateMany({ data: { status: "USED" } });
    expect(await searchCatalog({ query: "356789012345678" })).toEqual([]);
  });

  it("filters by category and hides inactive products", async () => {
    await product("BAT-1", { category: "BATTERY" });
    await product("VID-1");
    const hidden = await product("BAT-2", { category: "BATTERY" });
    await prisma.product.update({ where: { id: hidden.id }, data: { isActive: false } });

    const batteries = await searchCatalog({ category: "BATTERY" });

    expect(batteries.map((entry) => entry.sku)).toEqual(["BAT-1"]);
  });
});

describe("listCatalogCategories", () => {
  it("offers only categories that have products", async () => {
    await product("BAT-1", { category: "BATTERY" });
    await product("VID-1");
    await product("VID-2");

    expect((await listCatalogCategories()).sort()).toEqual(["BATTERY", "GLASS"]);
  });
});

describe("getFeaturedProducts", () => {
  it("ranks by units sold, then fills with products in stock", async () => {
    const slow = await product("SLOW-1");
    const fast = await product("FAST-1");
    await product("IDLE-1");
    await product("EMPTY-1", {}, { quantity: 0 });

    const sell = (productId: string, quantity: number) =>
      createSale(
        {
          currency: "PYG",
          method: "CASH",
          lines: [{ productId, quantity, unitPrice: "" }],
        },
        seller,
      );
    await sell(slow.id, 1);
    await sell(fast.id, 3);

    const featured = await getFeaturedProducts(3);

    expect(featured.map((entry) => entry.sku)).toEqual(["FAST-1", "SLOW-1", "IDLE-1"]);
  });
});
