"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import { adjustStock, createProduct, receiveStock, updateProduct } from "./application/commands";
import { consumePartInRepair, removePartFromRepair } from "./application/consume-part";
import {
  adjustStockSchema,
  consumePartSchema,
  productSchema,
  receiveStockSchema,
  removePartSchema,
  updateProductSchema,
} from "./application/schemas";
import { searchProducts, type ProductSuggestion } from "./application/queries";

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission("stock.manage");
    const result = await createProduct(productSchema.parse(input), actor);
    revalidatePath("/stock");
    return result;
  });
}

export async function updateProductAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("stock.manage");
    const data = updateProductSchema.parse(input);
    await updateProduct(data, actor);
    revalidatePath("/stock");
    revalidatePath(`/stock/${data.productId}`);
  });
}

export async function receiveStockAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("stock.manage");
    const data = receiveStockSchema.parse(input);
    await receiveStock(data, actor);
    revalidatePath("/stock");
    revalidatePath(`/stock/${data.productId}`);
    revalidatePath("/");
  });
}

export async function adjustStockAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("stock.manage");
    const data = adjustStockSchema.parse(input);
    await adjustStock(data, actor);
    revalidatePath("/stock");
    revalidatePath(`/stock/${data.productId}`);
    revalidatePath("/");
  });
}

export async function consumePartAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission("repair.usePart");
    const data = consumePartSchema.parse(input);
    const result = await consumePartInRepair(data, actor);
    revalidatePath(`/reparaciones/${data.repairId}`);
    revalidatePath("/stock");
    return result;
  });
}

export async function removePartAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("repair.usePart");
    const { repairId } = await removePartFromRepair(removePartSchema.parse(input), actor);
    revalidatePath(`/reparaciones/${repairId}`);
    revalidatePath("/stock");
  });
}

/** Typeahead for the parts picker. Behind a session: this is inventory data. */
export async function searchProductsAction(
  query: string,
): Promise<ActionResult<ProductSuggestion[]>> {
  return runAction(async () => {
    await requirePermission("stock.view");
    return searchProducts(query);
  });
}
