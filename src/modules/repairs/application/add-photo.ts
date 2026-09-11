import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError } from "@/shared/domain/errors";
import { photoStorage } from "../infrastructure/photo-storage";
import {
  MAX_PHOTO_BYTES,
  isAllowedPhotoType,
} from "../domain/ports/photo-storage";
import { assertRepairScope } from "./repair-access";

export type AddPhotoResult = { id: string; url: string };

/**
 * Attaches intake evidence to a repair.
 *
 * The blob is written first and the row second. If the row fails the blob is
 * removed, so the storage bucket does not fill with files nothing points to.
 */
export async function addRepairPhoto(
  input: { repairId: string; file: File; caption?: string },
  actor: CurrentUser,
): Promise<AddPhotoResult> {
  assertCan(actor.role, "repair.uploadPhoto");

  if (!isAllowedPhotoType(input.file.type)) {
    throw new BusinessRuleError("Formato no admitido. Usá JPG, PNG o WebP.");
  }
  if (input.file.size > MAX_PHOTO_BYTES) {
    throw new BusinessRuleError("La foto supera los 6 MB. Se comprime antes de subir.");
  }
  if (input.file.size === 0) {
    throw new BusinessRuleError("El archivo está vacío");
  }

  const repair = await prisma.repair.findUnique({
    where: { id: input.repairId },
    select: { id: true, orderNumber: true, technicianId: true, deletedAt: true },
  });

  assertRepairScope(actor, repair);
  if (!repair) throw new BusinessRuleError("La reparación no existe");

  const stored = await photoStorage.save({
    repairId: repair.id,
    fileName: input.file.name,
    contentType: input.file.type,
    data: Buffer.from(await input.file.arrayBuffer()),
  });

  try {
    return await prisma.$transaction(async (tx) => {
      const photo = await tx.repairPhoto.create({
        data: {
          repairId: repair.id,
          url: stored.url,
          pathname: stored.pathname,
          caption: input.caption?.trim() || null,
          uploadedById: actor.id,
        },
        select: { id: true, url: true },
      });

      await writeAudit(tx, {
        actorId: actor.id,
        action: "PHOTO_ADDED",
        entityType: "Repair",
        entityId: repair.id,
        summary: `Agregó una foto a ${repair.orderNumber}`,
      });

      return photo;
    });
  } catch (error) {
    await photoStorage.remove(stored.pathname).catch(() => undefined);
    throw error;
  }
}
