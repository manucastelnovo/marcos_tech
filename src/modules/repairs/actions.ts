"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission, requireUser } from "@/shared/infrastructure/auth/session";
import { createRepair, type CreateRepairResult } from "./application/create-repair";
import { changeRepairStatus, deliverRepair } from "./application/change-status";
import {
  updateChecklist,
  updateDiagnosis,
  updateIntake,
  updatePricing,
} from "./application/update-repair";
import {
  changeStatusSchema,
  deliverRepairSchema,
  intakeSchema,
  updateChecklistSchema,
  updateDiagnosisSchema,
  updateIntakeSchema,
  updatePricingSchema,
} from "./application/schemas";
import { findImeiHistory, type ImeiHistoryEntry } from "./application/queries";
import { addRepairPhoto, type AddPhotoResult } from "./application/add-photo";
import { BusinessRuleError } from "@/shared/domain/errors";
import { updateWhatsAppTemplate, updateTemplateSchema } from "./application/templates";

/**
 * Server Actions are the security boundary.
 *
 * Every one of them authenticates, checks a permission and re-validates its
 * input with the same schema the form used. The form is a convenience; this is
 * the part an attacker cannot skip.
 */

export async function createRepairAction(
  input: unknown,
): Promise<ActionResult<CreateRepairResult>> {
  return runAction(async () => {
    const actor = await requirePermission("repair.create");
    const data = intakeSchema.parse(input);
    const result = await createRepair(data, actor);

    revalidatePath("/reparaciones");
    revalidatePath("/");
    return result;
  });
}

export async function changeStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.changeStatus");
    const data = changeStatusSchema.parse(input);
    await changeRepairStatus(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/reparaciones");
    revalidatePath("/");
  });
}

export async function deliverRepairAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.deliver");
    const data = deliverRepairSchema.parse(input);
    await deliverRepair(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/reparaciones");
    revalidatePath("/");
  });
}

export async function updateDiagnosisAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.editDiagnosis");
    const data = updateDiagnosisSchema.parse(input);
    await updateDiagnosis(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
  });
}

export async function updatePricingAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.editPricing");
    const data = updatePricingSchema.parse(input);
    await updatePricing(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/reparaciones");
  });
}

export async function updateIntakeAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.editIntake");
    const data = updateIntakeSchema.parse(input);
    await updateIntake(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/reparaciones");
  });
}

export async function updateChecklistAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireUser();
    const data = updateChecklistSchema.parse(input);
    await updateChecklist(data, actor);

    revalidatePath(`/reparaciones/${data.repairId}`);
  });
}

/**
 * Intake-time IMEI lookup. Read-only, but still behind a session: the device
 * history of the shop's customers is not public.
 */
export async function lookupImeiAction(
  imei: string,
): Promise<ActionResult<ImeiHistoryEntry[]>> {
  return runAction(async () => {
    await requirePermission("repair.view");
    return findImeiHistory(imei);
  });
}

/**
 * Photo upload. Takes FormData because a File cannot travel as a plain Server
 * Action argument.
 */
export async function uploadRepairPhotoAction(
  formData: FormData,
): Promise<ActionResult<AddPhotoResult>> {
  return runAction(async () => {
    const actor = await requirePermission("repair.uploadPhoto");

    const repairId = String(formData.get("repairId") ?? "");
    const file = formData.get("file");
    const caption = formData.get("caption");

    if (!repairId) throw new BusinessRuleError("Falta la reparación");
    if (!(file instanceof File)) throw new BusinessRuleError("No se recibió ninguna foto");

    const result = await addRepairPhoto(
      { repairId, file, caption: typeof caption === "string" ? caption : undefined },
      actor,
    );

    revalidatePath(`/reparaciones/${repairId}`);
    return result;
  });
}

export async function updateTemplateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("template.manage");
    await updateWhatsAppTemplate(updateTemplateSchema.parse(input), actor);
    revalidatePath("/plantillas");
  });
}
