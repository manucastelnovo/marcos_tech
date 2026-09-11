const SEQUENCE_WIDTH = 5;

/**
 * Formats a per-year sequence into the number a person reads, e.g. OT-2026-00147
 * for a repair or VT-2026-00001 for a sale.
 *
 * The sequence itself comes from an atomic counter increment inside the same
 * transaction that inserts the record. Deriving it from a row count would hand
 * two simultaneous operations the same number.
 */
export function formatSequenceNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(SEQUENCE_WIDTH, "0")}`;
}

export function sequencePattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}-(\\d{4})-(\\d{${SEQUENCE_WIDTH},})$`);
}

export function parseSequenceNumber(
  prefix: string,
  value: string,
): { year: number; sequence: number } | null {
  const match = sequencePattern(prefix).exec(value.trim().toUpperCase());
  if (!match) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}
