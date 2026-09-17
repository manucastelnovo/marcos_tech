import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/shared/infrastructure/prisma";
import { BusinessRuleError, ForbiddenError } from "@/shared/domain/errors";
import type { CurrentUser } from "@/shared/infrastructure/auth/session";
import type { PhotoUpload } from "@/shared/domain/photo-storage";
import { createProduct } from "./commands";
import { removeProductImage, setProductImage } from "./product-image";

// In memory: these tests are about the product row, not about Vercel Blob.
const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/shared/infrastructure/photo-storage", () => ({
  photoStorage: {
    async save(upload: PhotoUpload) {
      const pathname = `${upload.folder}/${crypto.randomUUID()}.jpg`;
      stored.set(pathname, upload);
      return { url: `https://blob.test/${pathname}`, pathname };
    },
    async remove(pathname: string) {
      stored.delete(pathname);
    },
  },
}));

const admin: CurrentUser = {
  id: "image-admin",
  email: "admin@image.local",
  name: "Admin Image",
  role: "ADMIN",
};

const technician: CurrentUser = {
  id: "image-tech",
  email: "tech@image.local",
  name: "Tech Image",
  role: "TECHNICIAN",
};

function jpeg(bytes = 10) {
  return new File([new Uint8Array(bytes)], "foto.jpg", { type: "image/jpeg" });
}

async function newProduct() {
  return createProduct(
    {
      sku: `IMG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: "Funda",
      category: "CASE",
      compatibility: "",
      currency: "PYG",
      salePrice: "",
      minStock: 0,
      location: "",
      tracksSerial: false,
    },
    admin,
  );
}

beforeAll(async () => {
  for (const user of [admin, technician]) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
        passwordHash: "not-used",
      },
      update: {},
    });
  }
});

beforeEach(async () => {
  stored.clear();
  await prisma.auditLog.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.product.deleteMany();
});

afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, technician.id] } } });
  await prisma.$disconnect();
});

describe("product image", () => {
  it("replaces the picture and removes the old file", async () => {
    const product = await newProduct();

    const first = await setProductImage({ productId: product.id, file: jpeg() }, admin);
    const second = await setProductImage({ productId: product.id, file: jpeg() }, admin);

    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.imageUrl).toBe(second.url);
    expect(first.url).not.toBe(second.url);
    expect([...stored.keys()]).toEqual([row.imagePathname]);
    expect(row.imagePathname?.startsWith(`products/${product.id}/`)).toBe(true);
  });

  it("removes the picture and its file", async () => {
    const product = await newProduct();
    await setProductImage({ productId: product.id, file: jpeg() }, admin);

    await removeProductImage(product.id, admin);

    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(row.imageUrl).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("is for people who manage stock only", async () => {
    const product = await newProduct();

    await expect(
      setProductImage({ productId: product.id, file: jpeg() }, technician),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(stored.size).toBe(0);
  });

  it("refuses what is not a picture before storing anything", async () => {
    const product = await newProduct();
    const pdf = new File([new Uint8Array(10)], "doc.pdf", { type: "application/pdf" });

    await expect(
      setProductImage({ productId: product.id, file: pdf }, admin),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(
      setProductImage({ productId: product.id, file: jpeg(0) }, admin),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(stored.size).toBe(0);
  });
});
