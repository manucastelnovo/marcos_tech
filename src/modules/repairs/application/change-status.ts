import "server-only";
import { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError } from "@/shared/domain/errors";
import { REPAIR_STATUS_LABEL, assertTransition } from "../domain/repair-status";
import { assertRepairScope } from "./repair-access";
import { changeStatusSchema, deliverRepairSchema } from "./schemas";

export async function changeRepairStatus(
  input: z.output<typeof changeStatusSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "repair.changeStatus");

  if (input.toStatus === "DELIVERED") {
    // Delivery is not a plain status move: it stamps the handover time and the
    // warranty clock. Routing it here would leave both empty.
    throw new BusinessRuleError("Usá la acción de entrega para cerrar la orden");
  }

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: { id: true, status: true, orderNumber: true, technicianId: true, deletedAt: true },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    assertTransition(repair.status, input.toStatus);

    await tx.repair.update({
      where: { id: repair.id },
      data: { status: input.toStatus },
    });

    await tx.repairStatusHistory.create({
      data: {
        repairId: repair.id,
        fromStatus: repair.status,
        toStatus: input.toStatus,
        note: input.note?.trim() || null,
        changedById: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STATUS_CHANGE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Cambió ${repair.orderNumber} de "${REPAIR_STATUS_LABEL[repair.status]}" a "${REPAIR_STATUS_LABEL[input.toStatus]}"`,
      changes: {
        status: { before: repair.status, after: input.toStatus },
      },
    });
  });
}

/**
 * Hands the device back. Stamps the delivery moment and starts the warranty
 * clock, which is what makes a returning IMEI recognisable later.
 */
export async function deliverRepair(
  input: z.output<typeof deliverRepairSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "repair.deliver");

  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUnique({
      where: { id: input.repairId },
      select: {
        id: true,
        status: true,
        orderNumber: true,
        technicianId: true,
        deletedAt: true,
      },
    });

    assertRepairScope(actor, repair);
    if (!repair) return;

    assertTransition(repair.status, "DELIVERED");

    const deliveredAt = new Date();

    await tx.repair.update({
      where: { id: repair.id },
      data: {
        status: "DELIVERED",
        deliveredAt,
        warrantyDays: input.warrantyDays > 0 ? input.warrantyDays : null,
      },
    });

    await tx.repairStatusHistory.create({
      data: {
        repairId: repair.id,
        fromStatus: repair.status,
        toStatus: "DELIVERED",
        note: input.note?.trim() || null,
        changedById: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STATUS_CHANGE",
      entityType: "Repair",
      entityId: repair.id,
      summary:
        input.warrantyDays > 0
          ? `Entregó ${repair.orderNumber} con ${input.warrantyDays} días de garantía`
          : `Entregó ${repair.orderNumber} sin garantía`,
      changes: {
        status: { before: repair.status, after: "DELIVERED" },
        warrantyDays: { before: null, after: input.warrantyDays },
      },
    });
  });
}
