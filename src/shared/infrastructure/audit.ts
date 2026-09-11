import "server-only";
import type { AuditAction } from "@/generated/prisma/enums";
import { serialiseChangeSet, type ChangeSet } from "@/shared/domain/change-set";
import type { PrismaTransaction } from "./prisma";

export { buildChangeSet } from "@/shared/domain/change-set";
export type { ChangeSet, FieldChange } from "@/shared/domain/change-set";

export type AuditInput = {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** One sentence an admin can read without decoding a diff. */
  summary: string;
  changes?: ChangeSet | null;
};

/**
 * Appends an audit row.
 *
 * It takes the transaction client rather than the global one on purpose: the
 * signature makes it impossible to record a change outside the transaction that
 * performed it. Either both rows land, or neither does.
 */
export async function writeAudit(tx: PrismaTransaction, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      changes: input.changes ? (serialiseChangeSet(input.changes) as object) : undefined,
    },
  });
}
