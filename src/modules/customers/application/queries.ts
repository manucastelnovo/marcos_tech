import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import { OPEN_STATUSES, type RepairStatus } from "@/modules/repairs/domain/repair-status";
import { Money, type Currency } from "@/shared/domain/money";
import { normalizePhone } from "../domain/phone";

export type CustomerSuggestion = {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  repairCount: number;
  openRepairCount: number;
  lastRepairAt: Date | null;
};

/**
 * Intake search. The counter types a phone number, so digits are matched
 * against the normalised column; anything else falls back to a name match.
 */
export async function searchCustomers(query: string, take = 8): Promise<CustomerSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const digits = normalizePhone(trimmed);
  const isPhoneSearch = digits.length >= 3;

  const rows = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(isPhoneSearch ? [{ phone: { contains: digits } }] : []),
        { fullName: { contains: trimmed, mode: "insensitive" as const } },
      ],
    },
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsapp: true,
      repairs: {
        where: { deletedAt: null },
        select: { status: true, receivedAt: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    whatsapp: row.whatsapp,
    repairCount: row.repairs.length,
    openRepairCount: row.repairs.filter((repair) =>
      (OPEN_STATUSES as readonly string[]).includes(repair.status),
    ).length,
    lastRepairAt:
      row.repairs.reduce<Date | null>(
        (latest, repair) =>
          !latest || repair.receivedAt > latest ? repair.receivedAt : latest,
        null,
      ) ?? null,
  }));
}

export type CustomerRepairSummary = {
  id: string;
  orderNumber: string;
  receivedAt: Date;
  brandName: string;
  modelName: string;
  status: RepairStatus;
  currency: Currency;
  finalPrice: string | null;
  paidAmount: string;
};

export type CustomerDetail = {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  repairs: CustomerRepairSummary[];
};

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const row = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      whatsapp: true,
      address: true,
      notes: true,
      createdAt: true,
      repairs: {
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          receivedAt: true,
          brandName: true,
          modelName: true,
          status: true,
          currency: true,
          finalPrice: true,
          payments: { select: { amount: true, currency: true } },
        },
      },
    },
  });

  if (!row) return null;

  return {
    ...row,
    repairs: row.repairs.map(({ payments, ...repair }) => ({
      ...repair,
      finalPrice: repair.finalPrice?.toString() ?? null,
      paidAmount: payments
        .filter((payment) => payment.currency === repair.currency)
        .reduce(
          (total, payment) => total.plus(Money.of(payment.amount.toString(), repair.currency)),
          Money.zero(repair.currency),
        )
        .toDecimalString(),
    })),
  };
}

export type CustomerListItem = {
  id: string;
  fullName: string;
  phone: string;
  repairCount: number;
  lastRepairAt: Date | null;
};

export async function listCustomers(search?: string, take = 50): Promise<CustomerListItem[]> {
  const trimmed = search?.trim();
  const digits = trimmed ? normalizePhone(trimmed) : "";

  const rows = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { fullName: { contains: trimmed, mode: "insensitive" as const } },
              ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    take,
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      _count: { select: { repairs: true } },
      repairs: {
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: { receivedAt: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    repairCount: row._count.repairs,
    lastRepairAt: row.repairs[0]?.receivedAt ?? null,
  }));
}
