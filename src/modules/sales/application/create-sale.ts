import "server-only";
import { prisma, type PrismaTransaction } from "@/shared/infrastructure/prisma";
import { nextSequence } from "@/shared/infrastructure/counter";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { Money, parseAmountInput, type Currency } from "@/shared/domain/money";
import { shopYear } from "@/shared/domain/datetime";
import { costToString, toCostDecimal } from "@/modules/inventory/domain/cost";
import { computeTotals, convertAmount, formatSaleNumber, lineTotal } from "../domain/sale";
import type { CreateSaleInput } from "./schemas";

export type CreateSaleResult = {
  saleId: string;
  number: string;
  total: string;
  belowCost: boolean;
};

/**
 * Rings up a counter sale.
 *
 * One transaction covers the sale, its lines, a stock movement per line, the
 * stock decrement, the cash movement and the audit row. A sale that took money
 * without moving stock is worse than a sale that failed, because the shelf and
 * the till then disagree with nobody noticing.
 */
export async function createSale(
  input: CreateSaleInput,
  actor: CurrentUser,
): Promise<CreateSaleResult> {
  assertCan(actor.role, "sale.create");

  const currency = input.currency;

  return prisma.$transaction(async (tx) => {
    const rates = await loadRates(tx);

    const products = await tx.product.findMany({
      where: { id: { in: input.lines.map((line) => line.productId) }, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        quantity: true,
        averageCost: true,
        salePrice: true,
        currency: true,
      },
    });

    const byId = new Map(products.map((product) => [product.id, product]));

    const resolved = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new NotFoundError("El producto", line.productId);

      const typedPrice = parseAmountInput(line.unitPrice, currency);
      const unitPrice = typedPrice
        ? typedPrice.toDecimalString()
        : convertOrFail(product.salePrice?.toString() ?? null, product.currency, currency, rates, {
            what: `el precio de ${product.sku}`,
          });

      const unitCost = convertOrFail(
        product.averageCost.toString(),
        product.currency,
        currency,
        rates,
        { what: `el costo de ${product.sku}` },
      );

      return {
        product,
        quantity: line.quantity,
        unitPrice,
        unitCost,
      };
    });

    const totals = computeTotals(
      resolved.map((line) => ({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
      })),
      parseAmountInput(input.discount, currency)?.toDecimalString() ?? "0",
      currency,
    );

    if (Money.of(totals.total, currency).isNegative()) {
      throw new BusinessRuleError("El descuento no puede superar el total de la venta");
    }

    const year = shopYear();
    const number = formatSaleNumber(year, await nextSequence(tx, "sale", year));

    const session = await tx.cashSession.findFirst({
      where: { closedAt: null },
      select: { id: true },
    });

    const sale = await tx.sale.create({
      data: {
        number,
        customerId: input.customerId?.trim() || null,
        sellerId: actor.id,
        currency,
        // The rate that priced this ticket, frozen. A rate change tomorrow must
        // not restate what was sold today.
        exchangeRate: currency === "PYG" ? null : (rates[currency] ?? null),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        method: input.method,
        sessionId: session?.id ?? null,
        notes: input.notes?.trim() || null,
        lines: {
          create: resolved.map((line) => ({
            productId: line.product.id,
            description: `${line.product.sku} · ${line.product.name}`,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            lineTotal: lineTotal(line.unitPrice, line.quantity, currency),
          })),
        },
      },
      select: { id: true, number: true },
    });

    for (const line of resolved) {
      await tx.product.update({
        where: { id: line.product.id },
        data: { quantity: { decrement: line.quantity } },
      });

      await tx.stockMovement.create({
        data: {
          productId: line.product.id,
          type: "SALE",
          quantity: -line.quantity,
          // The movement records cost in the product's own currency, which is
          // the ledger's frame of reference, not the ticket's.
          unitCost: costToString(toCostDecimal(line.product.averageCost.toString())),
          currency: line.product.currency,
          saleId: sale.id,
          actorId: actor.id,
        },
      });
    }

    if (session) {
      await tx.cashMovement.create({
        data: {
          sessionId: session.id,
          type: "SALE",
          amount: totals.total,
          currency,
          exchangeRate: currency === "PYG" ? null : (rates[currency] ?? null),
          method: input.method,
          description: `Venta ${sale.number}`,
          saleId: sale.id,
          actorId: actor.id,
        },
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Sale",
      entityId: sale.id,
      summary: `Registró la venta ${sale.number} por ${Money.of(totals.total, currency).format()}`,
    });

    return {
      saleId: sale.id,
      number: sale.number,
      total: totals.total,
      belowCost: totals.belowCost,
    };
  });
}

async function loadRates(tx: PrismaTransaction): Promise<Partial<Record<Currency, string>>> {
  const rows = await tx.exchangeRate.findMany({
    orderBy: { effectiveFrom: "desc" },
    select: { currency: true, rate: true },
  });

  const rates: Partial<Record<Currency, string>> = {};
  for (const row of rows) {
    // Ordered newest first, so the first sighting of a currency is its rate.
    rates[row.currency] ??= row.rate.toString();
  }
  return rates;
}

/**
 * Converts, or refuses with a message that says what to do.
 *
 * Selling a dollar-priced screen in guaraníes needs a rate. Guessing one, or
 * quietly using zero, would put a real screen on a ticket for nothing.
 */
function convertOrFail(
  amount: string | null,
  from: Currency,
  to: Currency,
  rates: Partial<Record<Currency, string>>,
  context: { what: string },
): string {
  if (amount === null) {
    throw new BusinessRuleError(`Falta cargar ${context.what}`);
  }

  const converted = convertAmount(amount, from, to, rates);
  if (converted === null) {
    throw new BusinessRuleError(
      `No hay cotización para convertir ${context.what} de ${from} a ${to}. Cargala en Monedas.`,
    );
  }

  return converted;
}
