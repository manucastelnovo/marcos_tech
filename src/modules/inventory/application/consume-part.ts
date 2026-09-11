import "server-only";
import type { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { parseAmountInput } from "@/shared/domain/money";
import { assertRepairScope } from "@/modules/repairs/application/repair-access";
import { ALLOW_NEGATIVE_STOCK } from "../domain/product";
import { costToString, toCostDecimal } from "../domain/cost";
import type { consumePartSchema, removePartSchema } from "./schemas";

/**
 * Records a part used on a repair.
 *
 * Two shapes, one use case. A part taken from stock moves the ledger and
 * freezes the cost of this exact moment onto the repair. A part bought
 * specially for the job, or scavenged, is recorded as free text with the cost
 * the counter typed, so the margin is still real even when the shelf was not
 * involved.
 */
export async function consumePartInRepair(
  input: z.output<typeof consumePartSchema>,
  actor: CurrentUser,
): Promise<{ id: string }> {
  assertCan(actor.role, "repair.usePart");

  return prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: {
        id: true,
        orderNumber: true,
        technicianId: true,
        deletedAt: true,
        currency: true,
      },
    });

    assertRepairScope(actor, repair);
    if (!repair) throw new NotFoundError("La reparación");

    if (!input.productId) {
      return recordFreeTextPart(tx, { input, actor, repair });
    }

    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        quantity: true,
        averageCost: true,
        currency: true,
        tracksSerial: true,
      },
    });

    if (!product) throw new NotFoundError("El producto");

    const remaining = product.quantity - input.quantity;
    if (remaining < 0 && !ALLOW_NEGATIVE_STOCK) {
      throw new BusinessRuleError(
        `Solo quedan ${product.quantity} unidades de ${product.sku}`,
      );
    }

    const serial = input.serialId
      ? await claimSerial(tx, {
          serialId: input.serialId,
          productId: product.id,
          repairId: repair.id,
          quantity: input.quantity,
        })
      : null;

    // The cost of this moment, frozen. A purchase tomorrow at a different price
    // must never change what this repair cost.
    const unitCost = serial
      ? serial.purchaseCost.toString()
      : product.averageCost.toString();

    await tx.product.update({
      where: { id: product.id },
      data: { quantity: { decrement: input.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: "REPAIR_USE",
        quantity: -input.quantity,
        unitCost: costToString(toCostDecimal(unitCost)),
        currency: product.currency,
        repairId: repair.id,
        actorId: actor.id,
      },
    });

    const part = await tx.repairPart.create({
      data: {
        repairId: repair.id,
        productId: product.id,
        description: `${product.sku} · ${product.name}`,
        quantity: input.quantity,
        unitCost: costToString(toCostDecimal(unitCost)),
        currency: product.currency,
        serialId: serial?.id ?? null,
        addedById: actor.id,
      },
      select: { id: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "PART_USED",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Usó ${input.quantity} de ${product.sku} en ${repair.orderNumber}`,
      changes: {
        quantity: { before: product.quantity, after: remaining },
      },
    });

    return part;
  });
}

/**
 * Puts a part back.
 *
 * The consumption row is deleted but the ledger keeps both movements, so the
 * history still shows the part left and came back rather than pretending it
 * never moved.
 */
export async function removePartFromRepair(
  input: z.output<typeof removePartSchema>,
  actor: CurrentUser,
): Promise<{ repairId: string }> {
  assertCan(actor.role, "repair.usePart");

  return prisma.$transaction(async (tx) => {
    const part = await tx.repairPart.findUnique({
      where: { id: input.repairPartId },
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        currency: true,
        productId: true,
        serialId: true,
        description: true,
        repair: {
          select: { id: true, orderNumber: true, technicianId: true, deletedAt: true },
        },
      },
    });

    if (!part) throw new NotFoundError("El repuesto de la reparación");
    assertRepairScope(actor, part.repair);

    if (part.productId) {
      await tx.product.update({
        where: { id: part.productId },
        data: { quantity: { increment: part.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId: part.productId,
          type: "RETURN",
          quantity: part.quantity,
          unitCost: part.unitCost.toString(),
          currency: part.currency,
          repairId: part.repair.id,
          reason: input.reason,
          actorId: actor.id,
        },
      });
    }

    if (part.serialId) {
      await tx.stockSerial.update({
        where: { id: part.serialId },
        data: { status: "IN_STOCK", repairId: null },
      });
    }

    await tx.repairPart.delete({ where: { id: part.id } });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "PART_USED",
      entityType: "Repair",
      entityId: part.repair.id,
      summary: `Quitó ${part.description} de ${part.repair.orderNumber}: ${input.reason}`,
    });

    return { repairId: part.repair.id };
  });
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function claimSerial(
  tx: TransactionClient,
  args: { serialId: string; productId: string; repairId: string; quantity: number },
) {
  if (args.quantity !== 1) {
    throw new BusinessRuleError("Un número de serie identifica una sola unidad");
  }

  const serial = await tx.stockSerial.findUnique({
    where: { id: args.serialId },
    select: { id: true, serial: true, productId: true, status: true, purchaseCost: true },
  });

  if (!serial || serial.productId !== args.productId) {
    throw new NotFoundError("El número de serie");
  }
  if (serial.status !== "IN_STOCK") {
    throw new BusinessRuleError(`El número de serie ${serial.serial} ya no está disponible`);
  }

  await tx.stockSerial.update({
    where: { id: serial.id },
    data: { status: "USED", repairId: args.repairId },
  });

  return serial;
}

async function recordFreeTextPart(
  tx: TransactionClient,
  args: {
    input: z.output<typeof consumePartSchema>;
    actor: CurrentUser;
    repair: { id: string; orderNumber: string; currency: "PYG" | "USD" | "ARS" | "BRL" };
  },
) {
  const { input, actor, repair } = args;
  const unitCost = parseAmountInput(input.unitCost, repair.currency);

  const part = await tx.repairPart.create({
    data: {
      repairId: repair.id,
      productId: null,
      description: input.description!.trim(),
      quantity: input.quantity,
      unitCost: unitCost ? costToString(toCostDecimal(unitCost.toDecimalString())) : "0",
      currency: repair.currency,
      addedById: actor.id,
    },
    select: { id: true },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    action: "PART_USED",
    entityType: "Repair",
    entityId: repair.id,
    summary: `Registró el repuesto "${input.description}" en ${repair.orderNumber} sin descontar stock`,
  });

  return part;
}
