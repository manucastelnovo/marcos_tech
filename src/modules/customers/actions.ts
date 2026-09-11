"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/shared/application/action-result";
import { requirePermission } from "@/shared/infrastructure/auth/session";
import { createCustomer, updateCustomer } from "./application/commands";
import { customerSchema, updateCustomerSchema } from "./application/schemas";
import { searchCustomers, type CustomerSuggestion } from "./application/queries";

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission("customer.manage");
    const data = customerSchema.parse(input);
    const result = await createCustomer(data, actor);

    revalidatePath("/clientes");
    return result;
  });
}

export async function updateCustomerAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission("customer.manage");
    const data = updateCustomerSchema.parse(input);
    await updateCustomer(data, actor);

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${data.customerId}`);
  });
}

/** Typeahead for the intake screen. Behind a session: this is customer data. */
export async function searchCustomersAction(
  query: string,
): Promise<ActionResult<CustomerSuggestion[]>> {
  return runAction(async () => {
    await requirePermission("customer.view");
    return searchCustomers(query);
  });
}
