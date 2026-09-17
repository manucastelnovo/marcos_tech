"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/modules/inventory/domain/product";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import { createSale, type CreateSaleResult } from "./application/create-sale";
import { createSaleSchema } from "./application/schemas";
import { searchCatalog, type SellableProduct } from "./application/catalog";

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

const catalogFiltersSchema = z.object({
  query: z.string().trim().max(80).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
});

/** Product search for the point of sale. Carries prices, so behind sale.create. */
export async function searchCatalogAction(
  input: unknown,
): Promise<ActionResult<SellableProduct[]>> {
  return runAction(async () => {
    await requirePermission("sale.create");
    return searchCatalog(catalogFiltersSchema.parse(input));
  });
}
