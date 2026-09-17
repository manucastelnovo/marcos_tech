import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import type { Currency } from "@/shared/domain/money";
import type { ProductCategory } from "@/modules/inventory/domain/product";
import { getTopProducts } from "@/modules/reports/application/profitability";

/** What the point of sale needs to show and price a product. */
export type SellableProduct = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  minStock: number;
  /** List price in the product's own currency. Null when nobody set one. */
  salePrice: string | null;
  averageCost: string;
  currency: Currency;
  imageUrl: string | null;
};

const SELLABLE_SELECT = {
  id: true,
  sku: true,
  name: true,
  category: true,
  quantity: true,
  minStock: true,
  salePrice: true,
  averageCost: true,
  currency: true,
  imageUrl: true,
} as const;

type SellableRow = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  minStock: number;
  salePrice: { toString(): string } | null;
  averageCost: { toString(): string };
  currency: Currency;
  imageUrl: string | null;
};

function toSellable(row: SellableRow): SellableProduct {
  return {
    ...row,
    salePrice: row.salePrice?.toString() ?? null,
    averageCost: row.averageCost.toString(),
  };
}

export type CatalogFilters = {
  query?: string;
  category?: ProductCategory;
  take?: number;
};

/**
 * Product search for the counter.
 *
 * Matches code, name, compatibility and the serial or IMEI of a unit on the
 * shelf. An exact code match is put first, which is what lets a USB barcode
 * scanner type the code, press Enter and add the right product.
 */
export async function searchCatalog(filters: CatalogFilters): Promise<SellableProduct[]> {
  const query = filters.query?.trim() ?? "";

  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(query
        ? {
            OR: [
              { sku: { contains: query, mode: "insensitive" as const } },
              { name: { contains: query, mode: "insensitive" as const } },
              { compatibility: { contains: query, mode: "insensitive" as const } },
              { serials: { some: { status: "IN_STOCK", serial: { contains: query } } } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: filters.take ?? 24,
    select: SELLABLE_SELECT,
  });

  const upper = query.toUpperCase();
  return rows
    .map(toSellable)
    .sort((a, b) => Number(b.sku.toUpperCase() === upper) - Number(a.sku.toUpperCase() === upper));
}

const FEATURED_WINDOW_DAYS = 30;

/**
 * What the counter sold most in the last month, so the usual items are one
 * click away before anything is typed. A shop with no sales yet sees products
 * that are in stock instead of an empty grid.
 */
export async function getFeaturedProducts(take = 8): Promise<SellableProduct[]> {
  const to = new Date();
  const from = new Date(to.getTime() - FEATURED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const top = await getTopProducts(from, to, take * 2);
  const ids = [...new Set(top.map((entry) => entry.productId).filter((id) => id !== null))];

  const rows = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids }, deletedAt: null, isActive: true },
        select: SELLABLE_SELECT,
      })
    : [];

  const rank = new Map(ids.map((id, index) => [id, index]));
  const featured = rows
    .map(toSellable)
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    .slice(0, take);

  if (featured.length >= take) return featured;

  const filler = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      quantity: { gt: 0 },
      id: { notIn: featured.map((product) => product.id) },
    },
    orderBy: { updatedAt: "desc" },
    take: take - featured.length,
    select: SELLABLE_SELECT,
  });

  return [...featured, ...filler.map(toSellable)];
}

/** Only the categories that actually have products, so no chip leads nowhere. */
export async function listCatalogCategories(): Promise<ProductCategory[]> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    distinct: ["category"],
    select: { category: true },
  });
  return rows.map((row) => row.category);
}
