import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import { Money, type Currency } from "@/shared/domain/money";
import { shopDayRange } from "@/shared/domain/datetime";
import type { PaymentMethod } from "@/modules/cash/domain/cash-movement";

export type SaleListItem = {
  id: string;
  number: string;
  createdAt: Date;
  customerName: string | null;
  sellerName: string;
  currency: Currency;
  total: string;
  method: PaymentMethod;
  lineCount: number;
};

export async function listSales(search?: string, take = 60): Promise<SaleListItem[]> {
  const trimmed = search?.trim();

  const rows = await prisma.sale.findMany({
    where: {
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { number: { contains: trimmed, mode: "insensitive" as const } },
              { customer: { fullName: { contains: trimmed, mode: "insensitive" as const } } },
              {
                lines: {
                  some: { description: { contains: trimmed, mode: "insensitive" as const } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      number: true,
      createdAt: true,
      currency: true,
      total: true,
      method: true,
      customer: { select: { fullName: true } },
      seller: { select: { fullName: true } },
      _count: { select: { lines: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    customerName: row.customer?.fullName ?? null,
    sellerName: row.seller.fullName,
    currency: row.currency,
    total: row.total.toString(),
    method: row.method,
    lineCount: row._count.lines,
  }));
}

export type SaleDetail = {
  id: string;
  number: string;
  createdAt: Date;
  customer: { id: string; fullName: string; phone: string } | null;
  sellerName: string;
  currency: Currency;
  exchangeRate: string | null;
  subtotal: string;
  discount: string;
  total: string;
  /** Revenue minus the frozen cost of what was sold. */
  margin: string;
  method: PaymentMethod;
  notes: string | null;
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: string;
    unitCost: string;
    lineTotal: string;
    productId: string | null;
  }>;
};

export async function getSaleDetail(id: string): Promise<SaleDetail | null> {
  const row = await prisma.sale.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      number: true,
      createdAt: true,
      currency: true,
      exchangeRate: true,
      subtotal: true,
      discount: true,
      total: true,
      method: true,
      notes: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      seller: { select: { fullName: true } },
      lines: {
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPrice: true,
          unitCost: true,
          lineTotal: true,
          productId: true,
        },
      },
    },
  });

  if (!row) return null;

  const cost = row.lines.reduce(
    (total, line) =>
      total.plus(Money.of(line.unitCost.toString(), row.currency).times(line.quantity)),
    Money.zero(row.currency),
  );

  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    customer: row.customer,
    sellerName: row.seller.fullName,
    currency: row.currency,
    exchangeRate: row.exchangeRate?.toString() ?? null,
    subtotal: row.subtotal.toString(),
    discount: row.discount.toString(),
    total: row.total.toString(),
    margin: Money.of(row.total.toString(), row.currency).minus(cost).toDecimalString(),
    method: row.method,
    notes: row.notes,
    lines: row.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toString(),
      unitCost: line.unitCost.toString(),
      lineTotal: line.lineTotal.toString(),
      productId: line.productId,
    })),
  };
}

export type SalesSummary = {
  /** Totals per currency: mixing them into one number would be a lie. */
  today: Partial<Record<Currency, string>>;
  month: Partial<Record<Currency, string>>;
  todayCount: number;
};

export async function getSalesSummary(): Promise<SalesSummary> {
  const now = new Date();
  const { start, end } = shopDayRange(now);
  const monthStart = shopDayRange(new Date(now.getFullYear(), now.getMonth(), 1)).start;

  const [todayRows, monthRows] = await Promise.all([
    prisma.sale.groupBy({
      by: ["currency"],
      where: { deletedAt: null, createdAt: { gte: start, lt: end } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.sale.groupBy({
      by: ["currency"],
      where: { deletedAt: null, createdAt: { gte: monthStart, lt: end } },
      _sum: { total: true },
    }),
  ]);

  const today: Partial<Record<Currency, string>> = {};
  let todayCount = 0;
  for (const row of todayRows) {
    today[row.currency] = row._sum.total?.toString() ?? "0";
    todayCount += row._count._all;
  }

  const month: Partial<Record<Currency, string>> = {};
  for (const row of monthRows) {
    month[row.currency] = row._sum.total?.toString() ?? "0";
  }

  return { today, month, todayCount };
}
