import "server-only";
import type { z } from "zod";
import { prisma } from "@/shared/infrastructure/prisma";
import { buildChangeSet, writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";
import { parseAmountInput, type Currency } from "@/shared/domain/money";
import { costToString, toCostDecimal, weightedAverageCost } from "../domain/cost";
import type { productSchema, updateProductSchema, receiveStockSchema, adjustStockSchema } from "./schemas";

export async function createProduct(
  input: z.output<typeof productSchema>,
  actor: CurrentUser,
): Promise<{ id: string }> {
  assertCan(actor.role, "stock.manage");

  const salePrice = parseAmountInput(input.salePrice, input.currency);

  const existing = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (existing) throw new BusinessRuleError(`Ya existe un producto con el código ${input.sku}`);

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        category: input.category,
        compatibility: emptyToNull(input.compatibility),
        currency: input.currency,
        salePrice: salePrice?.toDecimalString() ?? null,
        minStock: input.minStock,
        location: emptyToNull(input.location),
        tracksSerial: input.tracksSerial,
      },
      select: { id: true, name: true, sku: true },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "CREATE",
      entityType: "Product",
      entityId: product.id,
      summary: `Creó el producto ${product.sku} (${product.name})`,
    });

    return { id: product.id };
  });
}

export async function updateProduct(
  input: z.output<typeof updateProductSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "stock.manage");

  const salePrice = parseAmountInput(input.salePrice, input.currency);

  const next = {
    sku: input.sku,
    name: input.name,
    category: input.category,
    compatibility: emptyToNull(input.compatibility),
    currency: input.currency,
    salePrice: salePrice?.toDecimalString() ?? null,
    minStock: input.minStock,
    location: emptyToNull(input.location),
    tracksSerial: input.tracksSerial,
  };

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        compatibility: true,
        currency: true,
        salePrice: true,
        minStock: true,
        location: true,
        tracksSerial: true,
      },
    });

    if (!product) throw new NotFoundError("El producto");

    const changes = buildChangeSet(product, next);
    if (!changes) return;

    await tx.product.update({ where: { id: product.id }, data: next });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: product.id,
      summary: `Actualizó el producto ${next.sku}`,
      changes,
    });
  });
}

/**
 * Records a purchase.
 *
 * The ledger row, the cached quantity and the recomputed average all move
 * together. A purchase that raised the count without recording its cost would
 * quietly corrupt every margin that follows it.
 */
export async function receiveStock(
  input: z.output<typeof receiveStockSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "stock.manage");

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        quantity: true,
        averageCost: true,
        currency: true,
        tracksSerial: true,
      },
    });

    if (!product) throw new NotFoundError("El producto");

    const unitCost = parseUnitCost(input.unitCost, product.currency);
    const serials = normaliseSerials(input.serials);

    if (product.tracksSerial && serials.length > 0 && serials.length !== input.quantity) {
      throw new BusinessRuleError(
        `Ingresás ${input.quantity} unidades pero cargaste ${serials.length} números de serie`,
      );
    }
    if (new Set(serials).size !== serials.length) {
      throw new BusinessRuleError("Hay números de serie repetidos en la carga");
    }

    const newAverage = weightedAverageCost({
      currentQuantity: product.quantity,
      currentAverage: product.averageCost.toString(),
      incomingQuantity: input.quantity,
      incomingUnitCost: unitCost,
    });

    await tx.product.update({
      where: { id: product.id },
      data: {
        quantity: { increment: input.quantity },
        averageCost: costToString(newAverage),
      },
    });

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: "PURCHASE",
        quantity: input.quantity,
        unitCost: costToString(toCostDecimal(unitCost)),
        currency: product.currency,
        reason: emptyToNull(input.reason),
        actorId: actor.id,
      },
    });

    if (serials.length > 0) {
      const clash = await tx.stockSerial.findFirst({
        where: { productId: product.id, serial: { in: serials } },
        select: { serial: true },
      });
      if (clash) {
        throw new BusinessRuleError(`El número de serie ${clash.serial} ya está cargado`);
      }

      await tx.stockSerial.createMany({
        data: serials.map((serial) => ({
          productId: product.id,
          serial,
          purchaseCost: costToString(toCostDecimal(unitCost)),
          currency: product.currency,
        })),
      });
    }

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STOCK_MOVEMENT",
      entityType: "Product",
      entityId: product.id,
      summary: `Ingresó ${input.quantity} de ${product.sku} (${product.name})`,
      changes: {
        quantity: { before: product.quantity, after: product.quantity + input.quantity },
        averageCost: { before: product.averageCost.toString(), after: costToString(newAverage) },
      },
    });
  });
}

/**
 * A manual correction after counting the shelf. Always demands a reason,
 * because an unexplained adjustment is indistinguishable from a mistake.
 */
export async function adjustStock(
  input: z.output<typeof adjustStockSchema>,
  actor: CurrentUser,
): Promise<void> {
  assertCan(actor.role, "stock.manage");

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true, sku: true, name: true, quantity: true, averageCost: true, currency: true },
    });

    if (!product) throw new NotFoundError("El producto");

    await tx.product.update({
      where: { id: product.id },
      data: { quantity: { increment: input.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        type: "ADJUSTMENT",
        quantity: input.quantity,
        // An adjustment moves units, never the cost basis: nothing was bought.
        unitCost: product.averageCost.toString(),
        currency: product.currency,
        reason: input.reason,
        actorId: actor.id,
      },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "STOCK_MOVEMENT",
      entityType: "Product",
      entityId: product.id,
      summary: `Ajustó ${product.sku} en ${input.quantity > 0 ? "+" : ""}${input.quantity}: ${input.reason}`,
      changes: {
        quantity: { before: product.quantity, after: product.quantity + input.quantity },
      },
    });
  });
}

function parseUnitCost(raw: string, currency: Currency): string {
  const parsed = parseAmountInput(raw, currency);
  if (!parsed) throw new BusinessRuleError("El costo es obligatorio");
  if (parsed.isNegative()) throw new BusinessRuleError("El costo no puede ser negativo");
  return parsed.toDecimalString();
}

function normaliseSerials(serials: string[] | undefined): string[] {
  return (serials ?? []).map((serial) => serial.trim().toUpperCase()).filter(Boolean);
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
