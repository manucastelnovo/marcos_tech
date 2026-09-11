"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import { createSale, type CreateSaleResult } from "./application/create-sale";
import { createSaleSchema } from "./application/schemas";

export async function createSaleAction(input: unknown): Promise<ActionResult<CreateSaleResult>> {
  return runAction(async () => {
    const actor = await requirePermission("sale.create");
    const result = await createSale(createSaleSchema.parse(input), actor);

    revalidatePath("/ventas");
    revalidatePath("/stock");
    revalidatePath("/caja");
    revalidatePath("/");
    return result;
  });
}
