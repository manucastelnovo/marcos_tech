import "server-only";
import { ForbiddenError, NotFoundError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";

export type RepairScope = {
  id: string;
  technicianId: string | null;
  deletedAt: Date | null;
};

/**
 * A technician may only move work that belongs to them, or pick up work nobody
 * has claimed yet. Sellers and admins are not scoped: at the counter anyone
 * has to be able to hand a device back.
 */
export function assertRepairScope(actor: CurrentUser, repair: RepairScope | null): RepairScope {
  if (!repair || repair.deletedAt) throw new NotFoundError("La reparación");

  if (actor.role === "TECHNICIAN" && repair.technicianId && repair.technicianId !== actor.id) {
    throw new ForbiddenError("Esta reparación está asignada a otro técnico");
  }

  return repair;
}
