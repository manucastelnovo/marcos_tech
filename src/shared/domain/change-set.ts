import Decimal from "decimal.js";

export type FieldChange = { before: unknown; after: unknown };
export type ChangeSet = Record<string, FieldChange>;

/**
 * Builds a field-level diff, skipping untouched fields. Returns null when
 * nothing actually changed, so a no-op save does not pollute the audit log.
 *
 * The two sides are intentionally not the same type: `before` comes back from
 * the database (Decimal, Date) while `after` is what the use case is about to
 * write (strings, Dates). Comparison is by value, not by representation.
 */
export function buildChangeSet(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ChangeSet | null {
  const changes: ChangeSet = {};

  for (const [key, nextValue] of Object.entries(after)) {
    if (nextValue === undefined) continue;
    const previousValue = before[key];
    if (isSameValue(previousValue, nextValue)) continue;
    changes[key] = { before: previousValue ?? null, after: nextValue ?? null };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Decimal columns come back as "100.0000" while the value we are writing is
 * "100.00". Those are the same amount, and reporting them as a change would
 * fill the audit log with edits nobody made. Compare numerically instead.
 */
function asDecimal(value: unknown): Decimal | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return null;
  const text = String(value).trim();
  if (!NUMERIC_PATTERN.test(text)) return null;
  return new Decimal(text);
}

export function isSameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;

  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();

  const leftDecimal = asDecimal(left);
  const rightDecimal = asDecimal(right);
  if (leftDecimal && rightDecimal) return leftDecimal.equals(rightDecimal);

  return String(left) === String(right);
}

/** Dates and Decimals are not JSON. Normalise before they reach a Json column. */
export function serialiseChangeSet(changes: ChangeSet): Record<string, FieldChange> {
  const output: Record<string, FieldChange> = {};
  for (const [key, change] of Object.entries(changes)) {
    output[key] = { before: normalise(change.before), after: normalise(change.after) };
  }
  return output;
}

function normalise(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && !Array.isArray(value)) return String(value);
  return value;
}
