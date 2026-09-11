import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import type { Currency } from "@/shared/domain/money";
import type { QuoteStatus } from "../domain/quote";

export type QuoteListItem = {
  id: string;
  number: string;
  createdAt: Date;
  customerLabel: string;
  brandName: string;
  modelName: string;
  currency: Currency;
  total: string;
  status: QuoteStatus;
  validUntil: Date | null;
  convertedRepairId: string | null;
};

export async function listQuotes(
  filters: { status?: QuoteStatus; search?: string; take?: number } = {},
): Promise<QuoteListItem[]> {
  const search = filters.search?.trim();

  const rows = await prisma.quote.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: "insensitive" as const } },
              { brandName: { contains: search, mode: "insensitive" as const } },
              { modelName: { contains: search, mode: "insensitive" as const } },
              { customerName: { contains: search, mode: "insensitive" as const } },
              { customerPhone: { contains: search.replace(/\D/g, "") } },
              { customer: { fullName: { contains: search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filters.take ?? 100,
    select: {
      id: true,
      number: true,
      createdAt: true,
      brandName: true,
      modelName: true,
      currency: true,
      total: true,
      status: true,
      validUntil: true,
      convertedRepairId: true,
      customerName: true,
      customerPhone: true,
      customer: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    // A walk-in has no customer record yet, so fall back to what was written.
    customerLabel:
      row.customer?.fullName ?? row.customerName ?? row.customerPhone ?? "Sin cliente",
    brandName: row.brandName,
    modelName: row.modelName,
    currency: row.currency,
    total: row.total.toString(),
    status: row.status,
    validUntil: row.validUntil,
    convertedRepairId: row.convertedRepairId,
  }));
}

export type QuoteDetail = QuoteListItem & {
  description: string;
  partsCost: string | null;
  laborCost: string | null;
  exchangeRate: string | null;
  notes: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  createdByName: string;
  convertedOrderNumber: string | null;
};

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  const row = await prisma.quote.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      number: true,
      createdAt: true,
      brandName: true,
      modelName: true,
      description: true,
      currency: true,
      exchangeRate: true,
      partsCost: true,
      laborCost: true,
      total: true,
      status: true,
      validUntil: true,
      notes: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      convertedRepairId: true,
      customer: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
      convertedRepair: { select: { orderNumber: true } },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt,
    customerLabel:
      row.customer?.fullName ?? row.customerName ?? row.customerPhone ?? "Sin cliente",
    brandName: row.brandName,
    modelName: row.modelName,
    description: row.description,
    currency: row.currency,
    exchangeRate: row.exchangeRate?.toString() ?? null,
    partsCost: row.partsCost?.toString() ?? null,
    laborCost: row.laborCost?.toString() ?? null,
    total: row.total.toString(),
    status: row.status,
    validUntil: row.validUntil,
    notes: row.notes,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    createdByName: row.createdBy.fullName,
    convertedRepairId: row.convertedRepairId,
    convertedOrderNumber: row.convertedRepair?.orderNumber ?? null,
  };
}

export async function countPendingQuotes(): Promise<number> {
  return prisma.quote.count({ where: { deletedAt: null, status: "PENDING" } });
}
