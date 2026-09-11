import "server-only";
import { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { buildChangeSet, writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { NotFoundError } from "@/shared/domain/errors";
import { normalizePhone } from "../domain/phone";
import { customerSchema, updateCustomerSchema } from "./schemas";

export async function createCustomer(
  input: z.output<typeof customerSchema>,
  actor: CurrentUser,
): Promise<{ id: string }> {
  assertCan(actor.role, "customer.manage");

  const phone = normalizePhone(input.phone);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        fullName: input.fullName,
        phone,
        whatsapp: input.whatsapp?.trim() ? normalizePhone(input.whatsapp) : phone,
        address: emptyToNull(input.address),
        notes: emptyToNull(input.notes),
      },
      select: { id: true, fullName: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Customer",
      entityId: customer.id,
      summary: `Creó el cliente ${customer.fullName}`,
    });

    return { id: customer.id };
  });
}

export async function updateCustomer(
  input: z.output<typeof updateCustomerSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "customer.manage");

  const phone = normalizePhone(input.phone);
  const next = {
    fullName: input.fullName,
    phone,
    whatsapp: input.whatsapp?.trim() ? normalizePhone(input.whatsapp) : phone,
    address: emptyToNull(input.address),
    notes: emptyToNull(input.notes),
  };

  await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        whatsapp: true,
        address: true,
        notes: true,
      },
    });

    if (!existing) throw new NotFoundError("El cliente");

    const changes = buildChangeSet(existing, next);
    if (!changes) return;

    await tx.customer.update({ where: { id: existing.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Customer",
      entityId: existing.id,
      summary: `Actualizó el cliente ${next.fullName}`,
      changes,
    });
  });
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
