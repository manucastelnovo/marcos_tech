import { z } from "zod";

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, "Nombre obligatorio").max(120),
  phone: z.string().trim().min(6, "Teléfono obligatorio").max(25),
  whatsapp: z.string().trim().max(25).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const updateCustomerSchema = customerSchema.extend({
  customerId: z.string().min(1),
});

export type CustomerInput = z.output<typeof customerSchema>;
