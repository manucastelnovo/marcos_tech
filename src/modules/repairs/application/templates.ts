import "server-only";
import { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { buildChangeSet, writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { NotFoundError } from "@/shared/domain/errors";

/** Placeholders the renderer knows how to fill. */
export const TEMPLATE_VARIABLES = [
  { token: "{{cliente}}", description: "Nombre del cliente" },
  { token: "{{equipo}}", description: "Marca y modelo" },
  { token: "{{orden}}", description: "Número de orden" },
  { token: "{{total}}", description: "Precio final" },
  { token: "{{saldo}}", description: "Saldo pendiente" },
] as const;

export const updateTemplateSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(2, "El nombre es obligatorio").max(80),
  body: z.string().trim().min(5, "El mensaje es obligatorio").max(1000),
});

export async function updateWhatsAppTemplate(
  input: z.output<typeof updateTemplateSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "template.manage");

  await prisma.$transaction(async (tx) => {
    const template = await tx.whatsAppTemplate.findUnique({
      where: { key: input.key },
      select: { id: true, key: true, label: true, body: true },
    });

    if (!template) throw new NotFoundError("La plantilla");

    const next = { label: input.label, body: input.body };
    const changes = buildChangeSet(template, next);
    if (!changes) return;

    await tx.whatsAppTemplate.update({ where: { key: input.key }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "WhatsAppTemplate",
      entityId: template.id,
      summary: `Editó la plantilla "${input.label}"`,
      changes,
    });
  });
}
