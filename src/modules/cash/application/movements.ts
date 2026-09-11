import "server-only";
import type { z } from "zod";
import { prisma, type PrismaTransaction } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { parseAmountInput, type Currency } from "@/shared/domain/money";
import { assertRepairScope } from "@/modules/repairs/application/repair-access";
import {
  CASH_MOVEMENT_LABEL,
  expectedSign,
  type CashMovementType,
} from "../domain/cash-movement";
import type { payRepairSchema, registerMovementSchema } from "./schemas";

/** The latest rate for a currency, or null when nobody has set one. */
export async function currentExchangeRate(
  tx: PrismaTransaction | typeof prisma,
  currency: Currency,
): Promise<string | null> {
  if (currency === "PYG") return null;

  const rate = await tx.exchangeRate.findFirst({
    where: { currency },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });

  return rate?.rate.toString() ?? null;
}

/**
 * An expense, a withdrawal, a refund or a correction.
 *
 * The amount is always typed positive; the movement type decides the direction,
 * so nobody has to reason about a minus sign at a counter.
 */
export async function registerCashMovement(
  input: z.output<typeof registerMovementSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "cash.operate");

  const type = input.type as CashMovementType;
  const magnitude = parseAmountInput(input.amount, input.currency);
  if (!magnitude || !magnitude.isPositive()) {
    throw new BusinessRuleError("El monto tiene que ser mayor a cero");
  }

  const sign = expectedSign(type);
  const goesOut = sign === "NEGATIVE" || (sign === "ANY" && input.direction === "OUT");
  const signed = goesOut ? magnitude.times(-1) : magnitude;

  await prisma.$transaction(async (tx) => {
    const session = await requireOpenSession(tx);
    const exchangeRate = await currentExchangeRate(tx, input.currency);

    await tx.cashMovement.create({
      data: {
        sessionId: session.id,
        type,
        amount: signed.toDecimalString(),
        currency: input.currency,
        exchangeRate,
        method: input.method,
        description: input.description?.trim() || null,
        actorId: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "CashSession",
      entityId: session.id,
      summary: `${CASH_MOVEMENT_LABEL[type]}: ${signed.format()}${
        input.description ? ` (${input.description})` : ""
      }`,
    });
  });
}

/**
 * Takes money against a repair.
 *
 * Two rows, one transaction. `RepairPayment` is what the customer owes and has
 * paid; `CashMovement` is what happened in the register. When no register is
 * open the payment is still recorded, and the session report lists it as taken
 * outside the drawer, because refusing to record money that changed hands is
 * how a system starts lying.
 */
export async function payRepair(
  input: z.output<typeof payRepairSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "cash.operate");

  const amount = parseAmountInput(input.amount, input.currency);
  if (!amount || !amount.isPositive()) {
    throw new BusinessRuleError("El cobro tiene que ser mayor a cero");
  }

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: { id: true, orderNumber: true, technicianId: true, deletedAt: true },
    });

    assertRepairScope(actor, repair);
    if (!repair) throw new NotFoundError("La reparación");

    const session = await tx.cashSession.findFirst({
      where: { closedAt: null },
      select: { id: true },
    });

    const exchangeRate = await currentExchangeRate(tx, input.currency);

    await tx.repairPayment.create({
      data: {
        repairId: repair.id,
        amount: amount.toDecimalString(),
        currency: input.currency,
        exchangeRate,
        method: input.method,
        sessionId: session?.id ?? null,
        actorId: actor.id,
      },
    });

    // Every method reaches the session so its report is complete. Only cash
    // counts toward the physical drawer, and reconciliation filters for that.
    if (session) {
      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: "REPAIR_PAYMENT",
          amount: amount.toDecimalString(),
          currency: input.currency,
          exchangeRate,
          method: input.method,
          description: `Cobro de ${repair.orderNumber}`,
          repairId: repair.id,
          actorId: actor.id,
        },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: session
        ? `Cobró ${amount.format()} de ${repair.orderNumber}`
        : `Cobró ${amount.format()} de ${repair.orderNumber} sin caja abierta`,
    });
  });
}

async function requireOpenSession(tx: PrismaTransaction) {
  const session = await tx.cashSession.findFirst({
    where: { closedAt: null },
    select: { id: true },
  });

  if (!session) {
    throw new BusinessRuleError("No hay ninguna caja abierta. Abrí la caja primero.");
  }

  return session;
}
