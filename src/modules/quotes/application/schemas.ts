import { z } from "zod";
import { CURRENCIES, parseAmountInput } from "@/shared/domain/money";
import { QUOTE_STATUSES } from "../domain/quote";

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));
const amountText = z.string().trim().max(30).optional().or(z.literal(""));

/**
 * The plain shape, kept separate from the refined schemas so the update variant
 * can add its id without depending on whether a refined schema still exposes
 * `.extend()`.
 */
const quoteFields = z.object({
  /// Either an existing customer, or just a name and phone written down.
  customerId: z.string().trim().optional().or(z.literal("")),
  customerName: z.string().trim().max(120).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(25).optional().or(z.literal("")),

  brandName: z.string().trim().min(1, "Marca obligatoria").max(60),
  modelName: z.string().trim().min(1, "Modelo obligatorio").max(80),
  description: z.string().trim().min(3, "Escribí qué trabajo se cotiza").max(2000),

  currency: z.enum(CURRENCIES).default("PYG"),
  partsCost: amountText,
  laborCost: amountText,

  validDays: z.coerce.number().int().min(0).max(365).default(15),
  notes: optionalText,
});

type QuoteFields = z.infer<typeof quoteFields>;

function checkQuote(data: QuoteFields, ctx: z.RefinementCtx): void {
  for (const field of ["partsCost", "laborCost"] as const) {
    try {
      const parsed = parseAmountInput(data[field], data.currency);
      if (parsed?.isNegative()) {
        ctx.addIssue({ code: "custom", path: [field], message: "No puede ser negativo" });
      }
    } catch {
      ctx.addIssue({ code: "custom", path: [field], message: "Monto inválido" });
    }
  }

  // A quote with no numbers is not a quote.
  const hasParts = Boolean(data.partsCost?.trim());
  const hasLabor = Boolean(data.laborCost?.trim());
  if (!hasParts && !hasLabor) {
    ctx.addIssue({
      code: "custom",
      path: ["laborCost"],
      message: "Cargá al menos el repuesto o la mano de obra",
    });
  }
}

export const quoteSchema = quoteFields.superRefine(checkQuote);

export const updateQuoteSchema = quoteFields
  .extend({ quoteId: z.string().min(1) })
  .superRefine(checkQuote);

export const changeQuoteStatusSchema = z.object({
  quoteId: z.string().min(1),
  status: z.enum(QUOTE_STATUSES),
});

export const acceptQuoteSchema = z.object({
  quoteId: z.string().min(1),
  /// Needed when the quote was written for a walk-in with no customer record.
  customerName: z.string().trim().max(120).optional().or(z.literal("")),
  customerPhone: z.string().trim().max(25).optional().or(z.literal("")),
});
