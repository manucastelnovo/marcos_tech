import { z } from "zod";
import { CURRENCIES } from "@/shared/domain/money";
import { PRODUCT_CATEGORIES } from "../domain/product";

const optionalText = z.string().trim().max(300).optional().or(z.literal(""));

/**
 * Amounts stay text here and are parsed in the use case, where the product's
 * own currency is known. "310.000" means three hundred and ten thousand
 * guaraníes or three hundred and ten dollars depending on it, and the schema
 * cannot tell which.
 */
const amountText = z.string().trim().max(30).optional().or(z.literal(""));

export const productSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "El código es obligatorio")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo"),
  name: z.string().trim().min(2, "El nombre es obligatorio").max(120),
  category: z.enum(PRODUCT_CATEGORIES),
  compatibility: optionalText,
  currency: z.enum(CURRENCIES).default("PYG"),
  salePrice: amountText,
  minStock: z.coerce.number().int().min(0).max(100000).default(0),
  location: optionalText,
  tracksSerial: z.coerce.boolean().default(false),
});

export const updateProductSchema = productSchema.extend({
  productId: z.string().min(1),
});

export const receiveStockSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a cero").max(100000),
  unitCost: z.string().trim().min(1, "El costo es obligatorio").max(30),
  reason: optionalText,
  /// One serial per unit, for products that track them.
  serials: z.array(z.string().trim().min(1).max(60)).max(1000).optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce
    .number()
    .int()
    .refine((value) => value !== 0, "El ajuste no puede ser cero")
    .refine((value) => Math.abs(value) <= 100000, "Ajuste demasiado grande"),
  // Adjustments are the only movement that can go either way, so they have to
  // say why. An unexplained correction is indistinguishable from a mistake.
  reason: z.string().trim().min(3, "Explicá el motivo del ajuste").max(300),
});

export const consumePartSchema = z
  .object({
    repairId: z.string().min(1),
    productId: z.string().trim().optional().or(z.literal("")),
    /// Used when the part did not come from stock.
    description: optionalText,
    quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a cero").max(1000),
    serialId: z.string().trim().optional().or(z.literal("")),
    /// Only for parts entered by hand, in the repair's own currency.
    unitCost: amountText,
  })
  .superRefine((data, ctx) => {
    if (!data.productId && !(data.description && data.description.length >= 2)) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "Elegí un repuesto del stock o describí el que usaste",
      });
    }
  });

export const removePartSchema = z.object({
  repairPartId: z.string().min(1),
  reason: z.string().trim().min(3, "Explicá por qué se quita el repuesto").max(300),
});
