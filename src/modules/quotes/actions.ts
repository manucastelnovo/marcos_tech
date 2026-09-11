"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import {
  acceptQuote,
  changeQuoteStatus,
  createQuote,
  updateQuote,
  type AcceptQuoteResult,
} from "./application/commands";
import {
  acceptQuoteSchema,
  changeQuoteStatusSchema,
  quoteSchema,
  updateQuoteSchema,
} from "./application/schemas";

export async function createQuoteAction(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  return runAction(async () => {
    const actor = await requirePermission("quote.manage");
    const result = await createQuote(quoteSchema.parse(input), actor);
    revalidatePath("/presupuestos");
    revalidatePath("/");
    return result;
  });
}

export async function updateQuoteAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("quote.manage");
    const data = updateQuoteSchema.parse(input);
    await updateQuote(data, actor);
    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${data.quoteId}`);
  });
}

export async function changeQuoteStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("quote.manage");
    const data = changeQuoteStatusSchema.parse(input);
    await changeQuoteStatus(data, actor);
    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${data.quoteId}`);
    revalidatePath("/");
  });
}

export async function acceptQuoteAction(
  input: unknown,
): Promise<ActionResult<AcceptQuoteResult>> {
  return runAction(async () => {
    const actor = await requirePermission("quote.manage");
    const data = acceptQuoteSchema.parse(input);
    const result = await acceptQuote(data, actor);

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${data.quoteId}`);
    revalidatePath("/reparaciones");
    revalidatePath("/");
    return result;
  });
}
