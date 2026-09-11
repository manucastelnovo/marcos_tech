const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Warranty options offered at delivery. */
export const WARRANTY_OPTIONS = [0, 30, 60, 90, 180] as const;

export type WarrantyStatus = {
  granted: boolean;
  expiresAt: Date | null;
  isActive: boolean;
  daysRemaining: number | null;
};

/**
 * Warranty runs from the moment the device was handed back, not from intake.
 * A repair that sat two weeks waiting for pickup must not eat the customer's
 * warranty.
 */
export function warrantyStatus(
  deliveredAt: Date | null,
  warrantyDays: number | null,
  now: Date,
): WarrantyStatus {
  if (!deliveredAt || !warrantyDays || warrantyDays <= 0) {
    return { granted: false, expiresAt: null, isActive: false, daysRemaining: null };
  }

  const expiresAt = new Date(deliveredAt.getTime() + warrantyDays * MS_PER_DAY);
  const remainingMs = expiresAt.getTime() - now.getTime();
  const isActive = remainingMs > 0;

  return {
    granted: true,
    expiresAt,
    isActive,
    daysRemaining: isActive ? Math.ceil(remainingMs / MS_PER_DAY) : 0,
  };
}

export function warrantyLabel(days: number): string {
  return days === 0 ? "Sin garantía" : `${days} días`;
}
