import "server-only";
import { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { buildChangeSet, writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan, can } from "@/modules/users/domain/permissions";
import { ForbiddenError } from "@/shared/domain/errors";
import { parseAmountInput } from "@/shared/domain/money";
import { shopLocalInputToUtc } from "@/shared/domain/datetime";
import { assertRepairScope } from "./repair-access";
import {
  updateChecklistSchema,
  updateDiagnosisSchema,
  updateIntakeSchema,
  updatePricingSchema,
} from "./schemas";

/** What the technician found and what they are going to do about it. */
export async function updateDiagnosis(
  input: z.output<typeof updateDiagnosisSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "repair.editDiagnosis");

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: {
        id: true,
        orderNumber: true,
        technicianId: true,
        deletedAt: true,
        technicalDiagnosis: true,
        workToPerform: true,
        partsNeeded: true,
      },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    const next = {
      technicalDiagnosis: emptyToNull(input.technicalDiagnosis),
      workToPerform: emptyToNull(input.workToPerform),
      partsNeeded: emptyToNull(input.partsNeeded),
    };

    const changes = buildChangeSet(repair, next);
    if (!changes) return;

    await tx.repair.update({ where: { id: repair.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Actualizó el diagnóstico de ${repair.orderNumber}`,
      changes,
    });
  });
}

/**
 * Prices. Deliberately its own use case with its own permission, so a
 * technician cannot reach it even by posting the request directly.
 */
export async function updatePricing(
  input: z.output<typeof updatePricingSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "repair.editPricing");

  const currency = input.currency;
  // Money received is not edited here. It is the sum of RepairPayment rows, and
  // changing what a customer paid by typing over a number is exactly what the
  // audit trail exists to prevent.
  const next = {
    currency,
    exchangeRate: input.exchangeRate?.trim() || null,
    partsCost: parseAmountInput(input.partsCost, currency)?.toDecimalString() ?? null,
    laborCost: parseAmountInput(input.laborCost, currency)?.toDecimalString() ?? null,
    finalPrice: parseAmountInput(input.finalPrice, currency)?.toDecimalString() ?? null,
  };

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: {
        id: true,
        orderNumber: true,
        technicianId: true,
        deletedAt: true,
        currency: true,
        exchangeRate: true,
        partsCost: true,
        laborCost: true,
        finalPrice: true,
      },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    const changes = buildChangeSet(repair, next);
    if (!changes) return;

    await tx.repair.update({ where: { id: repair.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "PRICE_CHANGE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Modificó los montos de ${repair.orderNumber}`,
      changes,
    });
  });
}

/** Device details, urgency and scheduling: the counter's side of the order. */
export async function updateIntake(
  input: z.output<typeof updateIntakeSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "repair.editIntake");

  const next = {
    brandName: input.brandName,
    modelName: input.modelName,
    imei: input.imei?.trim() ? input.imei.trim().toUpperCase() : null,
    physicalCondition: emptyToNull(input.physicalCondition),
    deliveredAccessories: emptyToNull(input.deliveredAccessories),
    reportedProblem: input.reportedProblem,
    urgency: input.urgency,
    estimatedDeliveryAt: input.estimatedDeliveryAt
      ? shopLocalInputToUtc(input.estimatedDeliveryAt)
      : null,
    technicianId: input.technicianId?.trim() || null,
  };

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: {
        id: true,
        orderNumber: true,
        technicianId: true,
        deletedAt: true,
        brandName: true,
        modelName: true,
        imei: true,
        physicalCondition: true,
        deliveredAccessories: true,
        reportedProblem: true,
        urgency: true,
        estimatedDeliveryAt: true,
      },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    const changes = buildChangeSet(repair, next);
    if (!changes) return;

    await tx.repair.update({ where: { id: repair.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Actualizó los datos de ${repair.orderNumber}`,
      changes,
    });
  });
}

/** The intake checklist, editable by whoever is holding the device. */
export async function updateChecklist(
  input: z.output<typeof updateChecklistSchema>,
  actor: CurrentUser,
): Promise<void> {
  const allowed = can(actor.role, "repair.editIntake") || can(actor.role, "repair.editDiagnosis");
  if (!allowed) throw new ForbiddenError("No podés editar el checklist");

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: { id: true, orderNumber: true, technicianId: true, deletedAt: true },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    for (const entry of input.checklist) {
      await tx.repairChecklistItem.upsert({
        where: { repairId_key: { repairId: repair.id, key: entry.key } },
        create: {
          repairId: repair.id,
          key: entry.key,
          state: entry.state,
          note: emptyToNull(entry.note),
        },
        update: { state: entry.state, note: emptyToNull(entry.note) },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Actualizó el checklist de ${repair.orderNumber}`,
    });
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
