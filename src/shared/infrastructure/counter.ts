import "server-only";
import type { PrismaTransaction } from "./prisma";

/**
 * The next number in a per-year series, taken atomically.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` takes a row lock and hands
 * back the incremented value in one statement. Reading the counter and writing
 * it back would give two simultaneous operations the same number, which is how
 * two devices end up sharing an order number on a busy morning.
 *
 * Must be called inside the same transaction that inserts the record it names,
 * so a rolled-back insert does not burn a number.
 */
/** The series a number belongs to: OT, VT and PR respectively. */
export type CounterKey = "repair" | "sale" | "quote";

export async function nextSequence(
  tx: PrismaTransaction,
  key: CounterKey,
  year: number,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO "Counter" ("key", "year", "value")
    VALUES (${key}, ${year}, 1)
    ON CONFLICT ("key", "year") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"
  `;

  return rows[0].value;
}
