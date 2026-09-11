import "server-only";
import type { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { CURRENCIES, parseAmountInput, type Currency } from "@/shared/domain/money";
import { formatDateTime } from "@/shared/domain/datetime";
import { movesTheDrawer } from "../domain/cash-movement";
import { currenciesInPlay, reconcile, type CurrencyLine } from "../domain/reconciliation";
import type { closeSessionSchema, openSessionSchema } from "./schemas";

/**
 * Opens the register.
 *
 * At most one session may be open at a time. The check below gives a readable
 * error, and the unique index on `openMarker` is what actually guarantees it:
 * two simultaneous opens cannot both win.
 */
export async function openCashSession(
  input: z.output<typeof openSessionSchema>,
  actor: CurrentUser,
): Promise<{ id: string }> {
  assertCan(actor.role, "cash.operate");

  const counts = normaliseCounts(input.counts);

  const alreadyOpen = await prisma.cashSession.findFirst({
    where: { closedAt: null },
    select: { id: true, openedAt: true, openedBy: { select: { fullName: true } } },
  });

  if (alreadyOpen) {
    throw new BusinessRuleError(
      `Ya hay una caja abierta desde ${formatDateTime(alreadyOpen.openedAt)} por ${alreadyOpen.openedBy.fullName}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.create({
      data: {
        openedById: actor.id,
        openMarker: true,
        notes: input.notes?.trim() || null,
        counts: {
          create: counts.map(({ currency, amount }) => ({
            currency,
            phase: "OPENING" as const,
            amount,
          })),
        },
      },
      select: { id: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "CashSession",
      entityId: session.id,
      summary:
        counts.length > 0
          ? `Abrió la caja con ${counts.map((c) => `${c.amount} ${c.currency}`).join(", ")}`
          : "Abrió la caja sin fondo inicial",
    });

    return { id: session.id };
  });
}

export type CloseResult = {
  lines: CurrencyLine[];
};

/**
 * Closes the register.
 *
 * Every currency is reconciled on its own, and a difference never blocks the
 * close. Forcing the numbers to match would only teach people to invent a
 * count; recording the gap with a name and a timestamp is the point.
 */
export async function closeCashSession(
  input: z.output<typeof closeSessionSchema>,
  actor: CurrentUser,
): Promise<CloseResult> {
  assertCan(actor.role, "cash.close");

  const closingCounts = normaliseCounts(input.counts);

  return prisma.$transaction(async (tx) => {
    const session = await tx.cashSession.findUnique({
      where: { id: input.sessionId },
      select: {
        id: true,
        closedAt: true,
        counts: { select: { currency: true, phase: true, amount: true } },
        movements: { select: { currency: true, amount: true, method: true } },
      },
    });

    if (!session) throw new NotFoundError("La caja");
    if (session.closedAt) throw new BusinessRuleError("Esta caja ya fue cerrada");

    const opening = toRecord(
      session.counts.filter((count) => count.phase === "OPENING"),
    );
    // Only cash is in the drawer. Transfers and cards are revenue, not contents.
    const cashMovements = session.movements
      .filter((movement) => movesTheDrawer(movement.method))
      .map((movement) => ({
        currency: movement.currency,
        amount: movement.amount.toString(),
      }));

    const closing = Object.fromEntries(
      closingCounts.map(({ currency, amount }) => [currency, amount]),
    ) as Partial<Record<Currency, string>>;

    const currencies = union(
      currenciesInPlay(opening, cashMovements),
      closingCounts.map((count) => count.currency),
    );

    const lines = reconcile({
      currencies,
      openingCounts: opening,
      closingCounts: closing,
      movements: cashMovements,
    });

    await tx.cashCount.createMany({
      data: closingCounts.map(({ currency, amount }) => ({
        sessionId: session.id,
        currency,
        phase: "CLOSING" as const,
        amount,
      })),
      skipDuplicates: true,
    });

    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        closedAt: new Date(),
        closedById: actor.id,
        // Releasing the marker is what lets the next session open.
        openMarker: null,
        notes: input.notes?.trim() || undefined,
      },
    });

    const offBy = lines.filter((line) => line.difference && Number(line.difference) !== 0);

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "CashSession",
      entityId: session.id,
      summary:
        offBy.length === 0
          ? "Cerró la caja sin diferencias"
          : `Cerró la caja con diferencia en ${offBy.map((line) => `${line.currency} ${line.difference}`).join(", ")}`,
      changes: Object.fromEntries(
        lines.map((line) => [
          line.currency,
          { before: line.expected, after: line.counted },
        ]),
      ),
    });

    return { lines };
  });
}

function normaliseCounts(
  counts: Array<{ currency: Currency; amount?: string }>,
): Array<{ currency: Currency; amount: string }> {
  const seen = new Set<Currency>();
  const result: Array<{ currency: Currency; amount: string }> = [];

  for (const count of counts) {
    if (seen.has(count.currency)) continue;
    const parsed = parseAmountInput(count.amount, count.currency);
    if (!parsed) continue;
    seen.add(count.currency);
    result.push({ currency: count.currency, amount: parsed.toDecimalString() });
  }

  return result;
}

function toRecord(
  counts: Array<{ currency: Currency; amount: { toString(): string } }>,
): Partial<Record<Currency, string>> {
  return Object.fromEntries(
    counts.map((count) => [count.currency, count.amount.toString()]),
  ) as Partial<Record<Currency, string>>;
}

function union(...groups: Currency[][]): Currency[] {
  const seen = new Set<Currency>();
  for (const group of groups) {
    for (const currency of group) seen.add(currency);
  }
  // Keep a stable order so the close screen does not reshuffle between renders.
  return CURRENCIES.filter((currency) => seen.has(currency));
}
