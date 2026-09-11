export const STOCK_MOVEMENT_TYPES = [
  "PURCHASE",
  "SALE",
  "REPAIR_USE",
  "RETURN",
  "ADJUSTMENT",
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = {
  PURCHASE: "Ingreso por compra",
  SALE: "Salida por venta",
  REPAIR_USE: "Salida por reparación",
  RETURN: "Devolución",
  ADJUSTMENT: "Ajuste",
};

/**
 * The sign a movement type is allowed to carry.
 *
 * A purchase that removes stock, or a sale that adds it, is a bug rather than a
 * business case. Adjustments are the one type that legitimately goes either
 * way, which is why they demand a written reason.
 */
const REQUIRED_SIGN: Record<StockMovementType, "POSITIVE" | "NEGATIVE" | "ANY"> = {
  PURCHASE: "POSITIVE",
  RETURN: "POSITIVE",
  SALE: "NEGATIVE",
  REPAIR_USE: "NEGATIVE",
  ADJUSTMENT: "ANY",
};

export function isValidMovement(type: StockMovementType, quantity: number): boolean {
  if (quantity === 0) return false;
  const sign = REQUIRED_SIGN[type];
  if (sign === "POSITIVE") return quantity > 0;
  if (sign === "NEGATIVE") return quantity < 0;
  return true;
}

export function requiresReason(type: StockMovementType): boolean {
  return type === "ADJUSTMENT";
}

/** Movements that add units and therefore update the weighted average cost. */
export function affectsAverageCost(type: StockMovementType): boolean {
  return type === "PURCHASE";
}
