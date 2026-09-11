import "server-only";
import type { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError } from "@/shared/domain/errors";
import { CURRENCIES, type Currency } from "@/shared/domain/money";
import type { setExchangeRateSchema } from "./schemas";

export type RateEntry = {
  currency: Currency;
  rate: string;
  effectiveFrom: Date;
  setByName: string;
};

/**
 * Records a new rate.
 *
 * Nothing is ever updated. A rate is a fact about a moment, and every amount
 * already stores the rate it was written with, so correcting today must not
 * change what last month was worth.
 */
export async function setExchangeRate(
  input: z.output<typeof setExchangeRateSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "rate.manage");

  const rate = parseRate(input.rate);
  if (rate === null) throw new BusinessRuleError("Cotización inválida");

  await prisma.$transaction(async (tx) => {
    await tx.exchangeRate.create({
      data: { currency: input.currency, rate, setById: actor.id },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "ExchangeRate",
      entityId: input.currency,
      summary: `Fijó la cotización de ${input.currency} en ${rate} guaraníes`,
    });
  });
}

/** The latest rate for every currency other than the base one. */
export async function listCurrentRates(): Promise<RateEntry[]> {
  const entries: RateEntry[] = [];

  for (const currency of CURRENCIES) {
    if (currency === "PYG") continue;

    const latest = await prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { effectiveFrom: "desc" },
      select: {
        currency: true,
        rate: true,
        effectiveFrom: true,
        setBy: { select: { fullName: true } },
      },
    });

    if (latest) {
      entries.push({
        currency: latest.currency,
        rate: latest.rate.toString(),
        effectiveFrom: latest.effectiveFrom,
        setByName: latest.setBy.fullName,
      });
    }
  }

  return entries;
}

export async function listRateHistory(currency: Currency, take = 20): Promise<RateEntry[]> {
  const rows = await prisma.exchangeRate.findMany({
    where: { currency },
    orderBy: { effectiveFrom: "desc" },
    take,
    select: {
      currency: true,
      rate: true,
      effectiveFrom: true,
      setBy: { select: { fullName: true } },
    },
  });

  return rows.map((row) => ({
    currency: row.currency,
    rate: row.rate.toString(),
    effectiveFrom: row.effectiveFrom,
    setByName: row.setBy.fullName,
  }));
}

/**
 * Rates carry six decimals and are not money, so they do not go through
 * `Money`. Separators are still resolved the way a person types them.
 */
function parseRate(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s/g, "");
  const decimalMatch = /[.,](\d{1,6})$/.exec(cleaned);

  const canonical = decimalMatch
    ? `${cleaned.slice(0, cleaned.length - decimalMatch[0].length).replace(/[.,]/g, "") || "0"}.${decimalMatch[1]}`
    : cleaned.replace(/[.,]/g, "");

  if (!/^\d+(\.\d+)?$/.test(canonical)) return null;
  if (Number(canonical) <= 0) return null;

  return canonical;
}
