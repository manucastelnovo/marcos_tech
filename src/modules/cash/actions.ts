"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import { closeCashSession, openCashSession, type CloseResult } from "./application/session";
import { payRepair, registerCashMovement } from "./application/movements";
import { setExchangeRate } from "./application/exchange-rates";
import {
  closeSessionSchema,
  openSessionSchema,
  payRepairSchema,
  registerMovementSchema,
  setExchangeRateSchema,
} from "./application/schemas";

export async function openCashSessionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission("cash.operate");
    const result = await openCashSession(openSessionSchema.parse(input), actor);
    revalidatePath("/caja");
    revalidatePath("/");
    return result;
  });
}

export async function closeCashSessionAction(input: unknown): Promise<ActionResult<CloseResult>> {
  return runAction(async () => {
    const actor = await requirePermission("cash.close");
    const data = closeSessionSchema.parse(input);
    const result = await closeCashSession(data, actor);
    revalidatePath("/caja");
    revalidatePath(`/caja/${data.sessionId}`);
    revalidatePath("/");
    return result;
  });
}

export async function registerCashMovementAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("cash.operate");
    await registerCashMovement(registerMovementSchema.parse(input), actor);
    revalidatePath("/caja");
    revalidatePath("/");
  });
}

export async function payRepairAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("cash.operate");
    const data = payRepairSchema.parse(input);
    await payRepair(data, actor);
    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/reparaciones");
    revalidatePath("/caja");
  });
}

export async function setExchangeRateAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("rate.manage");
    await setExchangeRate(setExchangeRateSchema.parse(input), actor);
    revalidatePath("/monedas");
  });
}
