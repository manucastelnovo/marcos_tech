import {
  formatSequenceNumber,
  parseSequenceNumber,
  sequencePattern,
} from "@/shared/domain/sequence-number";

/** "Orden de trabajo". Sales use their own prefix on the same machinery. */
export const REPAIR_NUMBER_PREFIX = "OT";

export function formatOrderNumber(year: number, sequence: number): string {
  return formatSequenceNumber(REPAIR_NUMBER_PREFIX, year, sequence);
}

export function parseOrderNumber(value: string): { year: number; sequence: number } | null {
  return parseSequenceNumber(REPAIR_NUMBER_PREFIX, value);
}

export function looksLikeOrderNumber(value: string): boolean {
  return sequencePattern(REPAIR_NUMBER_PREFIX).test(value.trim().toUpperCase());
}
