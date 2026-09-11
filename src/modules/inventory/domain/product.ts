export const PRODUCT_CATEGORIES = [
  "SCREEN",
  "BATTERY",
  "BOARD",
  "CAMERA",
  "CONNECTOR",
  "FLEX",
  "CHARGER",
  "CABLE",
  "CASE",
  "GLASS",
  "ACCESSORY",
  "OTHER",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  SCREEN: "Pantallas",
  BATTERY: "Baterías",
  BOARD: "Placas",
  CAMERA: "Cámaras",
  CONNECTOR: "Conectores",
  FLEX: "Flex",
  CHARGER: "Cargadores",
  CABLE: "Cables",
  CASE: "Fundas",
  GLASS: "Vidrios",
  ACCESSORY: "Accesorios",
  OTHER: "Otros",
};

export type StockHealth = "NEGATIVE" | "OUT" | "LOW" | "OK";

/**
 * How a product's count should read on a shelf report.
 *
 * NEGATIVE is its own state, not a worse OUT. Zero means the shop sold what it
 * had; below zero means the records and the shelf disagree, and only a person
 * can resolve that.
 */
export function stockHealth(quantity: number, minStock: number): StockHealth {
  if (quantity < 0) return "NEGATIVE";
  if (quantity === 0) return "OUT";
  if (quantity <= minStock) return "LOW";
  return "OK";
}

export const STOCK_HEALTH_LABEL: Record<StockHealth, string> = {
  NEGATIVE: "Stock inconsistente",
  OUT: "Sin stock",
  LOW: "Stock bajo",
  OK: "En stock",
};

export const STOCK_HEALTH_TONE: Record<StockHealth, string> = {
  NEGATIVE: "bg-red-100 text-red-900 border-red-400",
  OUT: "bg-zinc-100 text-zinc-700 border-zinc-300",
  LOW: "bg-amber-100 text-amber-900 border-amber-400",
  OK: "bg-emerald-100 text-emerald-900 border-emerald-300",
};

/**
 * Whether consuming a part may drive the count below zero.
 *
 * The technician already used the screen. Blocking the record does not put the
 * screen back on the shelf; it just means the system stops describing reality
 * and the shop goes back to paper. So the movement is recorded and the negative
 * is reported loudly instead.
 *
 * Flip this to false to hard-block instead. Nothing else has to change.
 */
export const ALLOW_NEGATIVE_STOCK = true;
