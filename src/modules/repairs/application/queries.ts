import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import { shopDayRange } from "@/shared/domain/datetime";
import { Money, type Currency } from "@/shared/domain/money";
import { OPEN_STATUSES, REPAIR_STATUSES, type RepairStatus } from "../domain/repair-status";
import type { UrgencyLevel } from "../domain/repair-urgency";
import type { ChecklistKey, ChecklistState } from "../domain/repair-checklist";

/**
 * Read models for the UI.
 *
 * Everything crossing into a client component is a plain, serialisable value:
 * Prisma Decimals become strings and are formatted with `Money` at the edge.
 */

export type RepairListItem = {
  id: string;
  orderNumber: string;
  receivedAt: Date;
  customerName: string;
  customerPhone: string;
  brandName: string;
  modelName: string;
  status: RepairStatus;
  urgency: UrgencyLevel;
  estimatedDeliveryAt: Date | null;
  currency: Currency;
  finalPrice: string | null;
  /** Sum of payments in the repair's own currency. Replaces the old deposit. */
  paidAmount: string;
  technicianName: string | null;
};

/**
 * Adds up what a repair has been paid, counting only payments made in its own
 * currency. A dollar payment against a guaraní job is real money, but folding
 * it in here would need a rate and would silently change the balance whenever
 * that rate moved.
 */
function sumPaid(
  payments: Array<{ amount: { toString(): string }; currency: Currency }>,
  currency: Currency,
): string {
  return payments
    .filter((payment) => payment.currency === currency)
    .reduce(
      (total, payment) => total.plus(Money.of(payment.amount.toString(), currency)),
      Money.zero(currency),
    )
    .toDecimalString();
}

export type RepairFilters = {
  status?: RepairStatus;
  onlyOpen?: boolean;
  onlyOverdue?: boolean;
  onlyUrgent?: boolean;
  technicianId?: string;
  search?: string;
  take?: number;
};

export async function listRepairs(filters: RepairFilters = {}): Promise<RepairListItem[]> {
  const now = new Date();
  const search = filters.search?.trim();

  const rows = await prisma.repair.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.onlyOpen ? { status: { in: [...OPEN_STATUSES] } } : {}),
      ...(filters.onlyUrgent ? { urgency: { in: ["URGENT", "VERY_URGENT"] } } : {}),
      ...(filters.technicianId ? { technicianId: filters.technicianId } : {}),
      ...(filters.onlyOverdue
        ? { status: { in: [...OPEN_STATUSES] }, estimatedDeliveryAt: { lt: now } }
        : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { imei: { contains: search, mode: "insensitive" as const } },
              { brandName: { contains: search, mode: "insensitive" as const } },
              { modelName: { contains: search, mode: "insensitive" as const } },
              { customer: { fullName: { contains: search, mode: "insensitive" as const } } },
              { customer: { phone: { contains: search.replace(/\D/g, "") } } },
            ],
          }
        : {}),
    },
    orderBy: [{ urgency: "desc" }, { receivedAt: "desc" }],
    take: filters.take ?? 100,
    select: {
      id: true,
      orderNumber: true,
      receivedAt: true,
      brandName: true,
      modelName: true,
      status: true,
      urgency: true,
      estimatedDeliveryAt: true,
      currency: true,
      finalPrice: true,
      payments: { select: { amount: true, currency: true } },
      customer: { select: { fullName: true, phone: true } },
      technician: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    receivedAt: row.receivedAt,
    customerName: row.customer.fullName,
    customerPhone: row.customer.phone,
    brandName: row.brandName,
    modelName: row.modelName,
    status: row.status,
    urgency: row.urgency,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    currency: row.currency,
    finalPrice: row.finalPrice?.toString() ?? null,
    paidAmount: sumPaid(row.payments, row.currency),
    technicianName: row.technician?.fullName ?? null,
  }));
}

export type DashboardSummary = {
  receivedToday: number;
  open: number;
  urgent: number;
  overdue: number;
  awaitingPickup: number;
  byStatus: Record<RepairStatus, number>;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const { start, end } = shopDayRange(now);
  const openFilter = { deletedAt: null, status: { in: [...OPEN_STATUSES] } };

  const [receivedToday, grouped, urgent, overdue] = await Promise.all([
    prisma.repair.count({ where: { deletedAt: null, receivedAt: { gte: start, lt: end } } }),
    prisma.repair.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.repair.count({
      where: { ...openFilter, urgency: { in: ["URGENT", "VERY_URGENT"] } },
    }),
    prisma.repair.count({
      where: { ...openFilter, estimatedDeliveryAt: { lt: now } },
    }),
  ]);

  // Start from every known status at zero, so the dashboard renders a complete
  // board even on a day when nothing reached a given state.
  const byStatus = Object.fromEntries(
    REPAIR_STATUSES.map((status) => [status, 0]),
  ) as Record<RepairStatus, number>;

  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }

  const open = OPEN_STATUSES.reduce((total, status) => total + byStatus[status], 0);

  return {
    receivedToday,
    open,
    urgent,
    overdue,
    awaitingPickup: byStatus.READY_FOR_PICKUP ?? 0,
    byStatus,
  };
}

export type RepairDetail = {
  id: string;
  orderNumber: string;
  publicToken: string;
  receivedAt: Date;
  status: RepairStatus;
  urgency: UrgencyLevel;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
  warrantyDays: number | null;
  brandName: string;
  modelName: string;
  imei: string | null;
  physicalCondition: string | null;
  deliveredAccessories: string | null;
  reportedProblem: string;
  technicalDiagnosis: string | null;
  workToPerform: string | null;
  partsNeeded: string | null;
  currency: Currency;
  exchangeRate: string | null;
  partsCost: string | null;
  laborCost: string | null;
  finalPrice: string | null;
  paidAmount: string;
  customer: { id: string; fullName: string; phone: string; whatsapp: string | null };
  technician: { id: string; fullName: string } | null;
  receivedBy: { id: string; fullName: string };
  checklist: Array<{ key: ChecklistKey; state: ChecklistState; note: string | null }>;
  photos: Array<{ id: string; url: string; caption: string | null; createdAt: Date }>;
  statusHistory: Array<{
    id: string;
    fromStatus: RepairStatus | null;
    toStatus: RepairStatus;
    note: string | null;
    changedAt: Date;
    changedByName: string;
  }>;
};

export async function getRepairDetail(id: string): Promise<RepairDetail | null> {
  const row = await prisma.repair.findFirst({
    where: { id, deletedAt: null },
    include: {
      payments: { select: { amount: true, currency: true } },
      customer: { select: { id: true, fullName: true, phone: true, whatsapp: true } },
      technician: { select: { id: true, fullName: true } },
      receivedBy: { select: { id: true, fullName: true } },
      checklist: { select: { key: true, state: true, note: true } },
      photos: {
        select: { id: true, url: true, caption: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedAt: true,
          changedBy: { select: { fullName: true } },
        },
        orderBy: { changedAt: "desc" },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    publicToken: row.publicToken,
    receivedAt: row.receivedAt,
    status: row.status,
    urgency: row.urgency,
    estimatedDeliveryAt: row.estimatedDeliveryAt,
    deliveredAt: row.deliveredAt,
    warrantyDays: row.warrantyDays,
    brandName: row.brandName,
    modelName: row.modelName,
    imei: row.imei,
    physicalCondition: row.physicalCondition,
    deliveredAccessories: row.deliveredAccessories,
    reportedProblem: row.reportedProblem,
    technicalDiagnosis: row.technicalDiagnosis,
    workToPerform: row.workToPerform,
    partsNeeded: row.partsNeeded,
    currency: row.currency,
    exchangeRate: row.exchangeRate?.toString() ?? null,
    partsCost: row.partsCost?.toString() ?? null,
    laborCost: row.laborCost?.toString() ?? null,
    finalPrice: row.finalPrice?.toString() ?? null,
    paidAmount: sumPaid(row.payments, row.currency),
    customer: row.customer,
    technician: row.technician,
    receivedBy: row.receivedBy,
    checklist: row.checklist,
    photos: row.photos,
    statusHistory: row.statusHistory.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      note: entry.note,
      changedAt: entry.changedAt,
      changedByName: entry.changedBy.fullName,
    })),
  };
}

/** The customer-facing tracking view. Status only: no prices, no notes. */
export type PublicRepairStatus = {
  orderNumber: string;
  brandName: string;
  modelName: string;
  status: RepairStatus;
  receivedAt: Date;
  estimatedDeliveryAt: Date | null;
  deliveredAt: Date | null;
};

export async function getPublicRepairStatus(token: string): Promise<PublicRepairStatus | null> {
  return prisma.repair.findFirst({
    where: { publicToken: token, deletedAt: null },
    select: {
      orderNumber: true,
      brandName: true,
      modelName: true,
      status: true,
      receivedAt: true,
      estimatedDeliveryAt: true,
      deliveredAt: true,
    },
  });
}

export type ImeiHistoryEntry = {
  id: string;
  orderNumber: string;
  receivedAt: Date;
  deliveredAt: Date | null;
  warrantyDays: number | null;
  status: RepairStatus;
  workToPerform: string | null;
  reportedProblem: string;
};

/**
 * Has this exact device been here before? Answering at intake is what turns a
 * warranty claim from an argument into a lookup.
 */
export async function findImeiHistory(
  imei: string,
  excludeRepairId?: string,
): Promise<ImeiHistoryEntry[]> {
  const clean = imei.trim().toUpperCase();
  if (clean.length < 6) return [];

  return prisma.repair.findMany({
    where: {
      imei: clean,
      deletedAt: null,
      ...(excludeRepairId ? { id: { not: excludeRepairId } } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 10,
    select: {
      id: true,
      orderNumber: true,
      receivedAt: true,
      deliveredAt: true,
      warrantyDays: true,
      status: true,
      workToPerform: true,
      reportedProblem: true,
    },
  });
}
