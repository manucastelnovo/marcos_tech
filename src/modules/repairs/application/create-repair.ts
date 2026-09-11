import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, type PrismaTransaction } from "@/shared/infrastructure/prisma";
import { nextSequence } from "@/shared/infrastructure/counter";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { parseAmountInput } from "@/shared/domain/money";
import { shopLocalInputToUtc, shopYear } from "@/shared/domain/datetime";
import { normalizePhone } from "@/modules/customers/domain/phone";
import { formatOrderNumber } from "../domain/order-number";
import type { IntakeData } from "./schemas";

export type CreateRepairResult = {
  repairId: string;
  orderNumber: string;
  customerId: string;
};

/**
 * Records a device at the counter.
 *
 * Everything happens in one transaction: the customer, the order number, the
 * repair, its checklist, its first status row and the audit entry. A half-saved
 * intake is worse than no intake at all, because the device is already in the
 * shop.
 */
export async function createRepair(
  input: IntakeData,
  actor: CurrentUser,
): Promise<CreateRepairResult> {
  assertCan(actor.role, "repair.create");

  const currency = input.currency;
  const partsCost = parseAmountInput(input.partsCost, currency);
  const laborCost = parseAmountInput(input.laborCost, currency);
  const finalPrice = parseAmountInput(input.finalPrice, currency);
  const deposit = parseAmountInput(input.deposit, currency);
  const exchangeRate = input.exchangeRate?.trim() ? input.exchangeRate.trim() : null;

  const estimatedDeliveryAt = input.estimatedDeliveryAt
    ? shopLocalInputToUtc(input.estimatedDeliveryAt)
    : null;

  return prisma.$transaction(async (tx) => {
    const customerId = await resolveCustomer(tx, input, actor);
    const orderNumber = await nextOrderNumber(tx);

    const repair = await tx.repair.create({
      data: {
        orderNumber,
        publicToken: generatePublicToken(),
        customerId,
        brandName: input.brandName,
        modelName: input.modelName,
        imei: input.imei?.trim() ? input.imei.trim().toUpperCase() : null,
        physicalCondition: emptyToNull(input.physicalCondition),
        deliveredAccessories: emptyToNull(input.deliveredAccessories),
        reportedProblem: input.reportedProblem,
        partsNeeded: emptyToNull(input.partsNeeded),
        urgency: input.urgency,
        estimatedDeliveryAt,
        technicianId: input.technicianId?.trim() || null,
        receivedById: actor.id,
        currency,
        exchangeRate,
        partsCost: partsCost?.toDecimalString() ?? null,
        laborCost: laborCost?.toDecimalString() ?? null,
        finalPrice: finalPrice?.toDecimalString() ?? null,
        status: "RECEIVED",
      },
      select: { id: true, orderNumber: true },
    });

    // The deposit taken at the counter is the repair's first payment. It links
    // to the open register when there is one, and is still recorded when there
    // is not, rather than being refused.
    if (deposit?.isPositive()) {
      const session = await tx.cashSession.findFirst({
        where: { closedAt: null },
        select: { id: true },
      });

      await tx.repairPayment.create({
        data: {
          repairId: repair.id,
          amount: deposit.toDecimalString(),
          currency,
          exchangeRate,
          method: "CASH",
          sessionId: session?.id ?? null,
          actorId: actor.id,
        },
      });

      if (session) {
        await tx.cashMovement.create({
          data: {
            sessionId: session.id,
            type: "REPAIR_PAYMENT",
            amount: deposit.toDecimalString(),
            currency,
            exchangeRate,
            method: "CASH",
            description: `Seña de ${repair.orderNumber}`,
            repairId: repair.id,
            actorId: actor.id,
          },
        });
      }
    }

    const checklist = (input.checklist ?? []).filter((entry) => entry.state !== "NOT_TESTED" || entry.note);
    if (checklist.length > 0) {
      await tx.repairChecklistItem.createMany({
        data: checklist.map((entry) => ({
          repairId: repair.id,
          key: entry.key,
          state: entry.state,
          note: emptyToNull(entry.note),
        })),
      });
    }

    await tx.repairStatusHistory.create({
      data: {
        repairId: repair.id,
        fromStatus: null,
        toStatus: "RECEIVED",
        note: "Equipo recibido en el local",
        changedById: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Creó la orden ${repair.orderNumber} (${input.brandName} ${input.modelName})`,
    });

    return { repairId: repair.id, orderNumber: repair.orderNumber, customerId };
  });
}

/**
 * Uses the customer the counter picked, or creates one from what they typed.
 * Creating the customer inline is what keeps intake to a single screen.
 */
async function resolveCustomer(
  tx: PrismaTransaction,
  input: IntakeData,
  actor: CurrentUser,
): Promise<string> {
  if (input.customerId) {
    const existing = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const phone = normalizePhone(input.customerPhone);
  const created = await tx.customer.create({
    data: {
      fullName: input.customerName?.trim() || "Cliente sin nombre",
      phone,
      whatsapp: input.customerWhatsapp?.trim() ? normalizePhone(input.customerWhatsapp) : phone,
    },
    select: { id: true, fullName: true },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    action: "CREATE",
    entityType: "Customer",
    entityId: created.id,
    summary: `Creó el cliente ${created.fullName}`,
  });

  return created.id;
}

/** Order numbers come from the shared atomic counter, under the "repair" key. */
async function nextOrderNumber(tx: PrismaTransaction): Promise<string> {
  const year = shopYear();
  return formatOrderNumber(year, await nextSequence(tx, "repair", year));
}

/**
 * The token in the public tracking URL. Random, not the order number: a
 * sequential id in a public link lets anyone walk the shop's entire order book.
 */
function generatePublicToken(): string {
  return randomBytes(16).toString("base64url");
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
