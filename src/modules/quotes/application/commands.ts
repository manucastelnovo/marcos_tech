import "server-only";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { prisma, type PrismaTransaction } from "@/shared/infrastructure/prisma";
import { nextSequence } from "@/shared/infrastructure/counter";
import { buildChangeSet, writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { parseAmountInput, type Currency } from "@/shared/domain/money";
import { shopYear } from "@/shared/domain/datetime";
import { normalizePhone } from "@/modules/customers/domain/phone";
import { formatOrderNumber } from "@/modules/repairs/domain/order-number";
import {
  QUOTE_STATUS_LABEL,
  assertQuoteTransition,
  formatQuoteNumber,
  quoteTotal,
} from "../domain/quote";
import type { acceptQuoteSchema, changeQuoteStatusSchema, quoteSchema, updateQuoteSchema } from "./schemas";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function createQuote(
  input: z.output<typeof quoteSchema>,
  actor: CurrentUser,
): Promise<{ id: string; number: string }> {
  assertCan(actor.role, "quote.manage");

  const amounts = parseAmounts(input);

  return prisma.$transaction(async (tx) => {
    const year = shopYear();
    const number = formatQuoteNumber(year, await nextSequence(tx, "quote", year));

    const quote = await tx.quote.create({
      data: {
        number,
        customerId: input.customerId?.trim() || null,
        customerName: input.customerName?.trim() || null,
        customerPhone: input.customerPhone?.trim()
          ? normalizePhone(input.customerPhone)
          : null,
        brandName: input.brandName,
        modelName: input.modelName,
        description: input.description,
        currency: input.currency,
        exchangeRate: await currentRate(tx, input.currency),
        partsCost: amounts.partsCost,
        laborCost: amounts.laborCost,
        total: amounts.total,
        validUntil:
          input.validDays > 0 ? new Date(Date.now() + input.validDays * MS_PER_DAY) : null,
        notes: input.notes?.trim() || null,
        createdById: actor.id,
      },
      select: { id: true, number: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Quote",
      entityId: quote.id,
      summary: `Creó el presupuesto ${quote.number} (${input.brandName} ${input.modelName})`,
    });

    return quote;
  });
}

export async function updateQuote(
  input: z.output<typeof updateQuoteSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "quote.manage");

  const amounts = parseAmounts(input);

  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        brandName: true,
        modelName: true,
        description: true,
        currency: true,
        partsCost: true,
        laborCost: true,
        total: true,
        notes: true,
      },
    });

    if (!quote) throw new NotFoundError("El presupuesto");
    if (quote.status === "ACCEPTED") {
      // The work order already exists and was priced from these numbers.
      throw new BusinessRuleError("Un presupuesto aceptado ya no se edita");
    }

    const next = {
      brandName: input.brandName,
      modelName: input.modelName,
      description: input.description,
      currency: input.currency,
      partsCost: amounts.partsCost,
      laborCost: amounts.laborCost,
      total: amounts.total,
      notes: input.notes?.trim() || null,
    };

    const changes = buildChangeSet(quote, next);
    if (!changes) return;

    await tx.quote.update({ where: { id: quote.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "PRICE_CHANGE",
      entityType: "Quote",
      entityId: quote.id,
      summary: `Modificó el presupuesto ${quote.number}`,
      changes,
    });
  });
}

/** Records what the customer answered. Accepting goes through `acceptQuote`. */
export async function changeQuoteStatus(
  input: z.output<typeof changeQuoteStatusSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "quote.manage");

  if (input.status === "ACCEPTED") {
    throw new BusinessRuleError("Usá la acción de aceptar, que además crea la orden de trabajo");
  }

  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, deletedAt: null },
      select: { id: true, number: true, status: true },
    });

    if (!quote) throw new NotFoundError("El presupuesto");
    assertQuoteTransition(quote.status, input.status);

    await tx.quote.update({ where: { id: quote.id }, data: { status: input.status } });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STATUS_CHANGE",
      entityType: "Quote",
      entityId: quote.id,
      summary: `Marcó el presupuesto ${quote.number} como ${QUOTE_STATUS_LABEL[input.status]}`,
      changes: { status: { before: quote.status, after: input.status } },
    });
  });
}

export type AcceptQuoteResult = { repairId: string; orderNumber: string };

/**
 * Turns an accepted quote into a work order.
 *
 * The device is arriving now, so this is a real intake: it creates the customer
 * when the quote was written for a walk-in, opens the repair with the quoted
 * prices, and links the two so the order can always be traced back to what was
 * promised.
 */
export async function acceptQuote(
  input: z.output<typeof acceptQuoteSchema>,
  actor: CurrentUser,
): Promise<AcceptQuoteResult> {
  assertCan(actor.role, "quote.manage");
  assertCan(actor.role, "repair.create");

  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: input.quoteId, deletedAt: null },
      select: {
        id: true,
        number: true,
        status: true,
        customerId: true,
        customerName: true,
        customerPhone: true,
        brandName: true,
        modelName: true,
        description: true,
        currency: true,
        exchangeRate: true,
        partsCost: true,
        laborCost: true,
        total: true,
      },
    });

    if (!quote) throw new NotFoundError("El presupuesto");
    assertQuoteTransition(quote.status, "ACCEPTED");

    const customerId = await resolveCustomer(tx, {
      quoteCustomerId: quote.customerId,
      name: input.customerName?.trim() || quote.customerName,
      phone: input.customerPhone?.trim() || quote.customerPhone,
      actor,
    });

    const year = shopYear();
    const orderNumber = formatOrderNumber(year, await nextSequence(tx, "repair", year));

    const repair = await tx.repair.create({
      data: {
        orderNumber,
        publicToken: randomBytes(16).toString("base64url"),
        customerId,
        brandName: quote.brandName,
        modelName: quote.modelName,
        reportedProblem: quote.description,
        currency: quote.currency,
        exchangeRate: quote.exchangeRate,
        partsCost: quote.partsCost,
        laborCost: quote.laborCost,
        finalPrice: quote.total,
        receivedById: actor.id,
        status: "RECEIVED",
        statusHistory: {
          create: {
            toStatus: "RECEIVED",
            note: `Equipo recibido desde el presupuesto ${quote.number}`,
            changedById: actor.id,
          },
        },
      },
      select: { id: true, orderNumber: true },
    });

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: "ACCEPTED", customerId, convertedRepairId: repair.id },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STATUS_CHANGE",
      entityType: "Quote",
      entityId: quote.id,
      summary: `Aceptó el presupuesto ${quote.number} y abrió la orden ${repair.orderNumber}`,
      changes: { status: { before: quote.status, after: "ACCEPTED" } },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Repair",
      entityId: repair.id,
      summary: `Creó la orden ${repair.orderNumber} desde el presupuesto ${quote.number}`,
    });

    return { repairId: repair.id, orderNumber: repair.orderNumber };
  });
}

function parseAmounts(input: {
  currency: Currency;
  partsCost?: string;
  laborCost?: string;
}) {
  const partsCost = parseAmountInput(input.partsCost, input.currency)?.toDecimalString() ?? null;
  const laborCost = parseAmountInput(input.laborCost, input.currency)?.toDecimalString() ?? null;
  return { partsCost, laborCost, total: quoteTotal(partsCost, laborCost, input.currency) };
}

async function currentRate(tx: PrismaTransaction, currency: Currency): Promise<string | null> {
  if (currency === "PYG") return null;
  const rate = await tx.exchangeRate.findFirst({
    where: { currency },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  return rate?.rate.toString() ?? null;
}

async function resolveCustomer(
  tx: PrismaTransaction,
  args: {
    quoteCustomerId: string | null;
    name: string | null;
    phone: string | null;
    actor: CurrentUser;
  },
): Promise<string> {
  if (args.quoteCustomerId) {
    const existing = await tx.customer.findFirst({
      where: { id: args.quoteCustomerId, deletedAt: null },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  if (!args.phone) {
    throw new BusinessRuleError(
      "Falta el teléfono del cliente para abrir la orden de trabajo",
    );
  }

  const phone = normalizePhone(args.phone);
  const created = await tx.customer.create({
    data: {
      fullName: args.name || "Cliente sin nombre",
      phone,
      whatsapp: phone,
    },
    select: { id: true, fullName: true },
  });

  await writeAudit(tx, {
    actorId: args.actor.id,
    action: "CREATE",
    entityType: "Customer",
    entityId: created.id,
    summary: `Creó el cliente ${created.fullName} al aceptar un presupuesto`,
  });

  return created.id;
}
