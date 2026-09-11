import { z } from "zod";
import { CURRENCIES, parseAmountInput } from "@/shared/domain/money";
import { PAYMENT_METHODS } from "@/modules/cash/domain/cash-movement";

const amountText = z.string().trim().max(30).optional().or(z.literal(""));

export const saleLineSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a cero").max(10000),
  /// Left blank, the product's list price is used, converted if needed.
  unitPrice: amountText,
});

export const createSaleSchema = z
  .object({
    customerId: z.string().trim().optional().or(z.literal("")),
    currency: z.enum(CURRENCIES).default("PYG"),
    method: z.enum(PAYMENT_METHODS).default("CASH"),
    discount: amountText,
    notes: z.string().trim().max(300).optional().or(z.literal("")),
    lines: z.array(saleLineSchema).min(1, "Agregá al menos un producto").max(100),
  })
  .superRefine((data, ctx) => {
    for (const [index, line] of data.lines.entries()) {
      try {
        parseAmountInput(line.unitPrice, data.currency);
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "unitPrice"],
          message: "Precio inválido",
        });
      }
    }

    try {
      const discount = parseAmountInput(data.discount, data.currency);
      if (discount?.isNegative()) {
        ctx.addIssue({
          code: "custom",
          path: ["discount"],
          message: "El descuento no puede ser negativo",
        });
      }
    } catch {
      ctx.addIssue({ code: "custom", path: ["discount"], message: "Descuento inválido" });
    }
  });

export type CreateSaleInput = z.output<typeof createSaleSchema>;
