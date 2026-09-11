import { cn } from "@/lib/utils";
import {
  STOCK_HEALTH_LABEL,
  STOCK_HEALTH_TONE,
  type StockHealth,
} from "../domain/product";
import { STOCK_MOVEMENT_LABEL, type StockMovementType } from "../domain/stock-movement";

const BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StockHealthBadge({
  health,
  className,
}: {
  health: StockHealth;
  className?: string;
}) {
  return (
    <span className={cn(BASE, STOCK_HEALTH_TONE[health], className)}>
      {STOCK_HEALTH_LABEL[health]}
    </span>
  );
}

const MOVEMENT_TONE: Record<StockMovementType, string> = {
  PURCHASE: "bg-emerald-100 text-emerald-900 border-emerald-300",
  RETURN: "bg-teal-100 text-teal-900 border-teal-300",
  SALE: "bg-blue-100 text-blue-900 border-blue-300",
  REPAIR_USE: "bg-indigo-100 text-indigo-900 border-indigo-300",
  ADJUSTMENT: "bg-amber-100 text-amber-900 border-amber-300",
};

export function MovementBadge({
  type,
  className,
}: {
  type: StockMovementType;
  className?: string;
}) {
  return <span className={cn(BASE, MOVEMENT_TONE[type], className)}>{STOCK_MOVEMENT_LABEL[type]}</span>;
}

/** Signed quantity, coloured so a shelf report reads at a glance. */
export function MovementQuantity({ quantity }: { quantity: number }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        quantity > 0 ? "text-emerald-700" : "text-red-700",
      )}
    >
      {quantity > 0 ? `+${quantity}` : quantity}
    </span>
  );
}
