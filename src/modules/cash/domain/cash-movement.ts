export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

/**
 * Only cash is physically in the drawer.
 *
 * A transfer or a card payment is revenue, and it is recorded as such, but
 * counting it toward the expected cash would show a shortfall at every single
 * close. This one predicate is what keeps reconciliation honest.
 */
export function movesTheDrawer(method: PaymentMethod): boolean {
  return method === "CASH";
}

export const CASH_MOVEMENT_TYPES = [
  "SALE",
  "REPAIR_PAYMENT",
  "EXPENSE",
  "WITHDRAWAL",
  "REFUND",
  "ADJUSTMENT",
] as const;

export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export const CASH_MOVEMENT_LABEL: Record<CashMovementType, string> = {
  SALE: "Venta",
  REPAIR_PAYMENT: "Cobro de reparación",
  EXPENSE: "Gasto",
  WITHDRAWAL: "Retiro de dinero",
  REFUND: "Devolución",
  ADJUSTMENT: "Ajuste",
};

/**
 * The sign each type is allowed to carry, mirroring the stock ledger. A sale
 * that takes money out, or an expense that puts money in, is a bug rather than
 * a business case. Adjustments go either way and demand a description.
 */
const REQUIRED_SIGN: Record<CashMovementType, "POSITIVE" | "NEGATIVE" | "ANY"> = {
  SALE: "POSITIVE",
  REPAIR_PAYMENT: "POSITIVE",
  EXPENSE: "NEGATIVE",
  WITHDRAWAL: "NEGATIVE",
  REFUND: "NEGATIVE",
  ADJUSTMENT: "ANY",
};

/** Types a person may enter by hand. Sales and repair payments are generated. */
export const MANUAL_MOVEMENT_TYPES: readonly CashMovementType[] = [
  "EXPENSE",
  "WITHDRAWAL",
  "REFUND",
  "ADJUSTMENT",
];

export function expectedSign(type: CashMovementType): "POSITIVE" | "NEGATIVE" | "ANY" {
  return REQUIRED_SIGN[type];
}

export function isValidMovement(type: CashMovementType, signedAmount: string): boolean {
  const value = Number(signedAmount);
  if (!Number.isFinite(value) || value === 0) return false;
  const sign = REQUIRED_SIGN[type];
  if (sign === "POSITIVE") return value > 0;
  if (sign === "NEGATIVE") return value < 0;
  return true;
}

export function requiresDescription(type: CashMovementType): boolean {
  return type === "ADJUSTMENT" || type === "EXPENSE";
}
