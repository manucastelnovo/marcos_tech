import "server-only";
import { prisma } from "@/shared/infrastructure/prisma";
import { writeAudit } from "@/shared/infrastructure/audit";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import { photoStorage } from "@/shared/infrastructure/photo-storage";
import { MAX_PHOTO_BYTES, isAllowedPhotoType } from "@/shared/domain/photo-storage";
import { assertCan } from "@/modules/users/domain/permissions";
import { BusinessRuleError, NotFoundError } from "@/shared/domain/errors";

/**
 * Sets the picture the point of sale shows for a product.
 *
 * A product has at most one picture. The new file is stored first, the row is
 * pointed at it, and only then is the old file removed: a failure at any step
 * leaves the product with a working picture, never with a broken link.
 */
export async function setProductImage(
  input: { productId: string; file: File },
  actor: CurrentUser,
): Promise<{ url: string }> {
  assertCan(actor.role, "stock.manage");

  if (!isAllowedPhotoType(input.file.type)) {
    throw new BusinessRuleError("Formato no admitido. Usá JPG, PNG o WebP.");
  }
  if (input.file.size > MAX_PHOTO_BYTES) {
    throw new BusinessRuleError("La imagen supera los 6 MB");
  }
  if (input.file.size === 0) {
    throw new BusinessRuleError("El archivo está vacío");
  }

  const product = await findProduct(input.productId);

  const stored = await photoStorage.save({
    folder: `products/${product.id}`,
    fileName: input.file.name,
    contentType: input.file.type,
    data: Buffer.from(await input.file.arrayBuffer()),
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { imageUrl: stored.url, imagePathname: stored.pathname },
      });

      await writeAudit(tx, {
        actorId: actor.id,
        action: "PHOTO_ADDED",
        entityType: "Product",
        entityId: product.id,
        summary: `Cambió la imagen de ${product.sku}`,
      });
    });
  } catch (error) {
    await photoStorage.remove(stored.pathname).catch(() => undefined);
    throw error;
  }

  if (product.imagePathname) {
    await photoStorage.remove(product.imagePathname).catch(() => undefined);
  }

  return { url: stored.url };
}

export async function removeProductImage(productId: string, actor: CurrentUser): Promise<void> {
  assertCan(actor.role, "stock.manage");

  const product = await findProduct(productId);
  if (!product.imagePathname) return;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { imageUrl: null, imagePathname: null },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Product",
      entityId: product.id,
      summary: `Quitó la imagen de ${product.sku}`,
    });
  });

  await photoStorage.remove(product.imagePathname).catch(() => undefined);
}

async function findProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, sku: true, imagePathname: true },
  });
  if (!product) throw new NotFoundError("El producto", productId);
  return product;
}
