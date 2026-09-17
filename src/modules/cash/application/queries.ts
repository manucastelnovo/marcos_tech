import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import type { Currency } from "@/shared/domain/money";
import { shopDayRange } from "@/shared/domain/datetime";
import { movesTheDrawer, type CashMovementType, type PaymentMethod } from "../domain/cash-movement";
import { currenciesInPlay, reconcile, type CurrencyLine } from "../domain/reconciliation";

export type CashMovementEntry = {
  id: string;
  type: CashMovementType;
  amount: string;
  currency: Currency;
  method: PaymentMethod;
  description: string | null;
  createdAt: Date;
  actorName: string;
  repairId: string | null;
  repairOrderNumber: string | null;
};

export type CashSessionDetail = {
  id: string;
  openedAt: Date;
  openedByName: string;
  closedAt: Date | null;
  closedByName: string | null;
  notes: string | null;
  isOpen: boolean;
  lines: CurrencyLine[];
  movements: CashMovementEntry[];
  /** Money taken while no register was open, for the day this session covers. */
  paymentsOutside: Array<{
    id: string;
    amount: string;
    currency: Currency;
    method: PaymentMethod;
    createdAt: Date;
    repairOrderNumber: string;
  }>;
};

async function buildDetail(sessionId: string): Promise<CashSessionDetail | null> {
  const session = await prisma.cashSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      notes: true,
      openedBy: { select: { fullName: true } },
      closedBy: { select: { fullName: true } },
      counts: { select: { currency: true, phase: true, amount: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          method: true,
          description: true,
          createdAt: true,
          repairId: true,
          actor: { select: { fullName: true } },
          repair: { select: { orderNumber: true } },
        },
      },
    },
  });

  if (!session) return null;

  const opening = toRecord(session.counts.filter((count) => count.phase === "OPENING"));
  const closing = toRecord(session.counts.filter((count) => count.phase === "CLOSING"));

  // Only cash is in the drawer; the rest is revenue recorded alongside it.
  const cashMovements = session.movements
    .filter((movement) => movesTheDrawer(movement.method))
    .map((movement) => ({
      currency: movement.currency,
      amount: movement.amount.toString(),
    }));

  const lines = reconcile({
    currencies: currenciesInPlay(opening, cashMovements),
    openingCounts: opening,
    closingCounts: closing,
    movements: cashMovements,
  });

  const { start, end } = shopDayRange(session.openedAt);
  const outside = await prisma.repairPayment.findMany({
    where: { sessionId: null, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      createdAt: true,
      repair: { select: { orderNumber: true } },
    },
  });

  return {
    id: session.id,
    openedAt: session.openedAt,
    openedByName: session.openedBy.fullName,
    closedAt: session.closedAt,
    closedByName: session.closedBy?.fullName ?? null,
    notes: session.notes,
    isOpen: session.closedAt === null,
    lines,
    movements: session.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: movement.amount.toString(),
      currency: movement.currency,
      method: movement.method,
      description: movement.description,
      createdAt: movement.createdAt,
      actorName: movement.actor.fullName,
      repairId: movement.repairId,
      repairOrderNumber: movement.repair?.orderNumber ?? null,
    })),
    paymentsOutside: outside.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toString(),
      currency: payment.currency,
      method: payment.method,
      createdAt: payment.createdAt,
      repairOrderNumber: payment.repair.orderNumber,
    })),
  };
}

export async function getOpenCashSession(): Promise<CashSessionDetail | null> {
  const open = await prisma.cashSession.findFirst({
    where: { closedAt: null },
    select: { id: true },
  });

  return open ? buildDetail(open.id) : null;
}

export async function getCashSession(id: string): Promise<CashSessionDetail | null> {
  return buildDetail(id);
}

export type CashSessionSummary = {
  id: string;
  openedAt: Date;
  closedAt: Date | null;
  openedByName: string;
  closedByName: string | null;
  movementCount: number;
  hasDifference: boolean;
};

export async function listCashSessions(take = 30): Promise<CashSessionSummary[]> {
  const rows = await prisma.cashSession.findMany({
    orderBy: { openedAt: "desc" },
    take,
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      openedBy: { select: { fullName: true } },
      closedBy: { select: { fullName: true } },
      counts: { select: { currency: true, phase: true, amount: true } },
      movements: { select: { currency: true, amount: true, method: true } },
      _count: { select: { movements: true } },
    },
  });

  return rows.map((row) => {
    const opening = toRecord(row.counts.filter((count) => count.phase === "OPENING"));
    const closing = toRecord(row.counts.filter((count) => count.phase === "CLOSING"));
    const cashMovements = row.movements
      .filter((movement) => movesTheDrawer(movement.method))
      .map((movement) => ({
        currency: movement.currency,
        amount: movement.amount.toString(),
      }));

    const lines = reconcile({
      currencies: currenciesInPlay(opening, cashMovements),
      openingCounts: opening,
      closingCounts: closing,
      movements: cashMovements,
    });

    return {
      id: row.id,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      openedByName: row.openedBy.fullName,
      closedByName: row.closedBy?.fullName ?? null,
      movementCount: row._count.movements,
      hasDifference: lines.some(
        (line) => line.difference !== null && Number(line.difference) !== 0,
      ),
    };
  });
}

export type RepairPaymentEntry = {
  id: string;
  amount: string;
  currency: Currency;
  method: PaymentMethod;
  createdAt: Date;
  actorName: string;
  insideSession: boolean;
};

export async function listRepairPayments(repairId: string): Promise<RepairPaymentEntry[]> {
  const rows = await prisma.repairPayment.findMany({
    where: { repairId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      method: true,
      createdAt: true,
      sessionId: true,
      actor: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    amount: row.amount.toString(),
    currency: row.currency,
    method: row.method,
    createdAt: row.createdAt,
    actorName: row.actor.fullName,
    insideSession: row.sessionId !== null,
  }));
}

function toRecord(
  counts: Array<{ currency: Currency; amount: { toString(): string } }>,
): Partial<Record<Currency, string>> {
  return Object.fromEntries(
    counts.map((count) => [count.currency, count.amount.toString()]),
  ) as Partial<Record<Currency, string>>;
}

export type CashStatus = {
  isOpen: boolean;
  openedAt: Date | null;
  openedByName: string | null;
};

/**
 * Whether a register is open, and nothing else.
 *
 * The header shows this on every screen, so it must stay a single indexed
 * lookup. `getOpenCashSession` loads every movement and is for the cash page.
 */
export async function getCashStatus(): Promise<CashStatus> {
  const open = await prisma.cashSession.findFirst({
    where: { closedAt: null },
    select: { openedAt: true, openedBy: { select: { fullName: true } } },
  });

  return {
    isOpen: open !== null,
    openedAt: open?.openedAt ?? null,
    openedByName: open?.openedBy.fullName ?? null,
  };
}
