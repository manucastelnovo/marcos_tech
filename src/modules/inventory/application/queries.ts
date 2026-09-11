import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import type { Currency } from "@/shared/domain/money";
import { sumCosts } from "../domain/cost";
import { stockHealth, type ProductCategory, type StockHealth } from "../domain/product";
import type { StockMovementType } from "../domain/stock-movement";

export type ProductListItem = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  compatibility: string | null;
  quantity: number;
  minStock: number;
  averageCost: string;
  salePrice: string | null;
  currency: Currency;
  location: string | null;
  tracksSerial: boolean;
  health: StockHealth;
};

export type ProductFilters = {
  search?: string;
  category?: ProductCategory;
  /** Only what needs attention: low, out or negative. */
  onlyAlerts?: boolean;
  take?: number;
};

export async function listProducts(filters: ProductFilters = {}): Promise<ProductListItem[]> {
  const search = filters.search?.trim();

  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
              { compatibility: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ quantity: "asc" }, { name: "asc" }],
    take: filters.take ?? 200,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      compatibility: true,
      quantity: true,
      minStock: true,
      averageCost: true,
      salePrice: true,
      currency: true,
      location: true,
      tracksSerial: true,
    },
  });

  const items = rows.map((row) => ({
    ...row,
    averageCost: row.averageCost.toString(),
    salePrice: row.salePrice?.toString() ?? null,
    health: stockHealth(row.quantity, row.minStock),
  }));

  // The alert filter is applied here rather than in SQL because "low" compares
  // two columns of the same row, which Prisma cannot express in a where clause.
  return filters.onlyAlerts ? items.filter((item) => item.health !== "OK") : items;
}

export type StockAlerts = {
  negative: number;
  out: number;
  low: number;
};

export async function getStockAlerts(): Promise<StockAlerts> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, isActive: true },
    select: { quantity: true, minStock: true },
  });

  const alerts: StockAlerts = { negative: 0, out: 0, low: 0 };
  for (const row of rows) {
    const health = stockHealth(row.quantity, row.minStock);
    if (health === "NEGATIVE") alerts.negative += 1;
    else if (health === "OUT") alerts.out += 1;
    else if (health === "LOW") alerts.low += 1;
  }
  return alerts;
}

export type StockMovementEntry = {
  id: string;
  type: StockMovementType;
  quantity: number;
  unitCost: string;
  currency: Currency;
  reason: string | null;
  createdAt: Date;
  actorName: string;
  repairId: string | null;
  repairOrderNumber: string | null;
};

export type ProductDetail = ProductListItem & {
  movements: StockMovementEntry[];
  serials: Array<{ id: string; serial: string; status: string; repairOrderNumber: string | null }>;
  /** Sum of the ledger, for comparison against the cached quantity. */
  ledgerQuantity: number;
};

export async function getProductDetail(id: string): Promise<ProductDetail | null> {
  const row = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      compatibility: true,
      quantity: true,
      minStock: true,
      averageCost: true,
      salePrice: true,
      currency: true,
      location: true,
      tracksSerial: true,
      movements: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          quantity: true,
          unitCost: true,
          currency: true,
          reason: true,
          createdAt: true,
          repairId: true,
          actor: { select: { fullName: true } },
          repair: { select: { orderNumber: true } },
        },
      },
      serials: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          serial: true,
          status: true,
          repair: { select: { orderNumber: true } },
        },
      },
    },
  });

  if (!row) return null;

  const ledger = await prisma.stockMovement.aggregate({
    where: { productId: id },
    _sum: { quantity: true },
  });

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    compatibility: row.compatibility,
    quantity: row.quantity,
    minStock: row.minStock,
    averageCost: row.averageCost.toString(),
    salePrice: row.salePrice?.toString() ?? null,
    currency: row.currency,
    location: row.location,
    tracksSerial: row.tracksSerial,
    health: stockHealth(row.quantity, row.minStock),
    ledgerQuantity: ledger._sum.quantity ?? 0,
    movements: row.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      unitCost: movement.unitCost.toString(),
      currency: movement.currency,
      reason: movement.reason,
      createdAt: movement.createdAt,
      actorName: movement.actor.fullName,
      repairId: movement.repairId,
      repairOrderNumber: movement.repair?.orderNumber ?? null,
    })),
    serials: row.serials.map((serial) => ({
      id: serial.id,
      serial: serial.serial,
      status: serial.status,
      repairOrderNumber: serial.repair?.orderNumber ?? null,
    })),
  };
}

export type ProductSuggestion = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  averageCost: string;
  currency: Currency;
  tracksSerial: boolean;
  availableSerials: Array<{ id: string; serial: string }>;
};

/** Typeahead for the parts picker on a repair. */
export async function searchProducts(query: string, take = 8): Promise<ProductSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { sku: { contains: trimmed, mode: "insensitive" } },
        { name: { contains: trimmed, mode: "insensitive" } },
        { compatibility: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    take,
    orderBy: { name: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      quantity: true,
      averageCost: true,
      currency: true,
      tracksSerial: true,
      serials: {
        where: { status: "IN_STOCK" },
        take: 50,
        orderBy: { serial: "asc" },
        select: { id: true, serial: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    averageCost: row.averageCost.toString(),
    currency: row.currency,
    tracksSerial: row.tracksSerial,
    availableSerials: row.serials,
  }));
}

export type RepairPartEntry = {
  id: string;
  description: string;
  quantity: number;
  unitCost: string;
  currency: Currency;
  productId: string | null;
  serial: string | null;
  addedByName: string;
  createdAt: Date;
};

export async function listRepairParts(repairId: string): Promise<RepairPartEntry[]> {
  const rows = await prisma.repairPart.findMany({
    where: { repairId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitCost: true,
      currency: true,
      productId: true,
      createdAt: true,
      serial: { select: { serial: true } },
      addedBy: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unitCost: row.unitCost.toString(),
    currency: row.currency,
    productId: row.productId,
    serial: row.serial?.serial ?? null,
    addedByName: row.addedBy.fullName,
    createdAt: row.createdAt,
  }));
}

/**
 * A repair's real part cost: the sum of what each part actually cost when it
 * was consumed, not a number somebody typed at intake.
 *
 * Parts costed in another currency are reported separately rather than
 * converted. A single total mixing guaraníes and dollars would be a lie, and
 * the conversion belongs to the reporting slice with its own frozen rate.
 */
export async function repairPartsCost(repairId: string): Promise<Record<Currency, string>> {
  const parts = await listRepairParts(repairId);
  const byCurrency: Partial<Record<Currency, Array<{ unitCost: string; quantity: number }>>> = {};

  for (const part of parts) {
    (byCurrency[part.currency] ??= []).push({
      unitCost: part.unitCost,
      quantity: part.quantity,
    });
  }

  const totals: Partial<Record<Currency, string>> = {};
  for (const [currency, entries] of Object.entries(byCurrency)) {
    totals[currency as Currency] = sumCosts(entries ?? []).toString();
  }

  return totals as Record<Currency, string>;
}
