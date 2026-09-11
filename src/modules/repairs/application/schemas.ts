import { z } from "zod";
import { CURRENCIES, parseAmountInput, type Currency } from "@/shared/domain/money";
import { CHECKLIST_KEYS, CHECKLIST_STATES } from "../domain/repair-checklist";
import { REPAIR_STATUSES } from "../domain/repair-status";
import { URGENCY_LEVELS } from "../domain/repair-urgency";
import { WARRANTY_OPTIONS } from "../domain/warranty";

/**
 * One schema per operation, shared by the client form and the Server Action.
 * The client gets instant feedback; the server re-validates the same rules,
 * because the client is not a security boundary.
 */

const optionalText = z.string().trim().max(2000).optional().or(z.literal(""));

/** Money arrives as text. It is parsed with the currency in hand, never as a float. */
const amountText = z.string().trim().max(30).optional().or(z.literal(""));

const MONEY_FIELDS = ["partsCost", "laborCost", "finalPrice", "deposit"] as const;

type AmountBearing = {
  currency: Currency;
  partsCost?: string;
  laborCost?: string;
  finalPrice?: string;
  deposit?: string;
};

/**
 * Amounts are checked together with the currency because "1.234" means one
 * thousand guaraníes and one dollar twenty-three depending on it. The deposit
 * rule lives here too: taking more money than the job is worth is a data-entry
 * mistake, not a business case.
 */
function checkAmounts(data: AmountBearing, ctx: z.RefinementCtx): void {
  for (const field of MONEY_FIELDS) {
    try {
      parseAmountInput(data[field], data.currency);
    } catch {
      ctx.addIssue({ code: "custom", path: [field], message: "Monto inválido" });
    }
  }

  try {
    const price = parseAmountInput(data.finalPrice, data.currency);
    const deposit = parseAmountInput(data.deposit, data.currency);
    if (price && deposit && deposit.greaterThan(price)) {
      ctx.addIssue({
        code: "custom",
        path: ["deposit"],
        message: "La seña no puede superar el precio final",
      });
    }
    if (deposit?.isNegative()) {
      ctx.addIssue({ code: "custom", path: ["deposit"], message: "La seña no puede ser negativa" });
    }
  } catch {
    // Already reported above.
  }
}

export const checklistEntrySchema = z.object({
  key: z.enum(CHECKLIST_KEYS),
  state: z.enum(CHECKLIST_STATES),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export const intakeSchema = z
  .object({
    // Customer: either an existing id, or enough to create one inline.
    customerId: z.string().trim().optional().or(z.literal("")),
    customerName: z.string().trim().max(120).optional().or(z.literal("")),
    customerPhone: z.string().trim().min(6, "Teléfono obligatorio").max(25),
    customerWhatsapp: z.string().trim().max(25).optional().or(z.literal("")),

    // Device
    brandName: z.string().trim().min(1, "Marca obligatoria").max(60),
    modelName: z.string().trim().min(1, "Modelo obligatorio").max(80),
    imei: z.string().trim().max(30).optional().or(z.literal("")),

    physicalCondition: optionalText,
    deliveredAccessories: optionalText,
    reportedProblem: z.string().trim().min(3, "Contá qué le pasa al equipo").max(2000),
    partsNeeded: optionalText,

    // Scheduling
    urgency: z.enum(URGENCY_LEVELS).default("NORMAL"),
    estimatedDeliveryAt: z.string().trim().optional().or(z.literal("")),
    technicianId: z.string().trim().optional().or(z.literal("")),

    // Money
    currency: z.enum(CURRENCIES).default("PYG"),
    exchangeRate: amountText,
    partsCost: amountText,
    laborCost: amountText,
    finalPrice: amountText,
    deposit: amountText,

    checklist: z.array(checklistEntrySchema).max(CHECKLIST_KEYS.length).optional(),
  })
  .superRefine((data, ctx) => {
    const hasExistingCustomer = Boolean(data.customerId);
    const hasNewCustomerName = Boolean(data.customerName && data.customerName.length >= 2);

    if (!hasExistingCustomer && !hasNewCustomerName) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Elegí un cliente existente o escribí el nombre del nuevo",
      });
    }

    checkAmounts(data, ctx);
  });

export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeData = z.output<typeof intakeSchema>;

export const changeStatusSchema = z.object({
  repairId: z.string().min(1),
  toStatus: z.enum(REPAIR_STATUSES),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const updateDiagnosisSchema = z.object({
  repairId: z.string().min(1),
  technicalDiagnosis: optionalText,
  workToPerform: optionalText,
  partsNeeded: optionalText,
});

export const updatePricingSchema = z
  .object({
    repairId: z.string().min(1),
    currency: z.enum(CURRENCIES),
    exchangeRate: amountText,
    partsCost: amountText,
    laborCost: amountText,
    finalPrice: amountText,
  })
  .superRefine(checkAmounts);

export const updateIntakeSchema = z.object({
  repairId: z.string().min(1),
  brandName: z.string().trim().min(1).max(60),
  modelName: z.string().trim().min(1).max(80),
  imei: z.string().trim().max(30).optional().or(z.literal("")),
  physicalCondition: optionalText,
  deliveredAccessories: optionalText,
  reportedProblem: z.string().trim().min(3).max(2000),
  urgency: z.enum(URGENCY_LEVELS),
  estimatedDeliveryAt: z.string().trim().optional().or(z.literal("")),
  technicianId: z.string().trim().optional().or(z.literal("")),
});

export const deliverRepairSchema = z.object({
  repairId: z.string().min(1),
  warrantyDays: z.coerce.number().int().min(0).max(365).default(0),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export const warrantyOptionSchema = z.union(
  WARRANTY_OPTIONS.map((days) => z.literal(days)) as [
    z.ZodLiteral<number>,
    z.ZodLiteral<number>,
    ...z.ZodLiteral<number>[],
  ],
);

export const updateChecklistSchema = z.object({
  repairId: z.string().min(1),
  checklist: z.array(checklistEntrySchema).max(CHECKLIST_KEYS.length),
});
