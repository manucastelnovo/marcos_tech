import Decimal from "decimal.js";

/**
 * Inventory cost is computed with raw Decimal, not with `Money`.
 *
 * `Money` rounds to the currency's scale on every operation, which is exactly
 * right for a price a customer pays and exactly wrong for an average. A screen
 * bought at 310.000 and another at 305.000 guaraníes averages to 307.500, and
 * rounding that to a whole guaraní on every purchase would drift the cost basis
 * away from reality one part at a time.
 *
 * Amounts are kept at four decimal places, matching the database column, and
 * rounded to the currency scale only when a person reads them.
 */
const COST_SCALE = 4;

export function toCostDecimal(value: string | number | Decimal): Decimal {
  return (value instanceof Decimal ? value : new Decimal(String(value))).toDecimalPlaces(
    COST_SCALE,
    Decimal.ROUND_HALF_UP,
  );
}

export function costToString(value: Decimal): string {
  return value.toFixed(COST_SCALE);
}

/**
 * Weighted average after receiving new units.
 *
 * When there is nothing on hand, or the count is negative because parts were
 * used before their purchase was recorded, the previous average describes
 * nothing. The incoming price becomes the new basis rather than being blended
 * with a number that means nothing.
 */
export function weightedAverageCost(input: {
  currentQuantity: number;
  currentAverage: string | Decimal;
  incomingQuantity: number;
  incomingUnitCost: string | Decimal;
}): Decimal {
  const incomingUnitCost = toCostDecimal(input.incomingUnitCost);

  if (input.incomingQuantity <= 0) return toCostDecimal(input.currentAverage);
  if (input.currentQuantity <= 0) return incomingUnitCost;

  const currentAverage = toCostDecimal(input.currentAverage);
  const currentValue = currentAverage.times(input.currentQuantity);
  const incomingValue = incomingUnitCost.times(input.incomingQuantity);
  const totalQuantity = input.currentQuantity + input.incomingQuantity;

  return toCostDecimal(currentValue.plus(incomingValue).dividedBy(totalQuantity));
}

/** Total cost of a quantity at a frozen unit cost. */
export function lineCost(unitCost: string | Decimal, quantity: number): Decimal {
  return toCostDecimal(toCostDecimal(unitCost).times(quantity));
}

/** Sums frozen part costs. Used for a repair's real margin. */
export function sumCosts(costs: Array<{ unitCost: string; quantity: number }>): Decimal {
  return costs.reduce(
    (total, entry) => total.plus(lineCost(entry.unitCost, entry.quantity)),
    new Decimal(0),
  );
}
